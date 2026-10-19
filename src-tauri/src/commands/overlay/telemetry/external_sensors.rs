//! Bridge to LibreHardwareMonitor / OpenHardwareMonitor (HTTP JSON + WMI)
//! and Windows WMI thermal zones.

use serde_json::Value;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

const ADDRESS: &str = "127.0.0.1:8085";

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ExternalSensors {
    pub cpu_temp_c: Option<f32>,
    pub cpu_power_w: Option<f32>,
    pub cpu_clock_ghz: Option<f32>,
    pub gpu_temp_c: Option<f32>,
    pub gpu_hotspot_c: Option<f32>,
    pub gpu_memory_temp_c: Option<f32>,
    pub gpu_usage: Option<f32>,
    pub gpu_clock_mhz: Option<u32>,
    pub gpu_fan_percent: Option<f32>,
    pub gpu_power_w: Option<f32>,
    pub source: Option<&'static str>,
}

impl ExternalSensors {
    pub fn is_empty(&self) -> bool {
        self.cpu_temp_c.is_none()
            && self.gpu_temp_c.is_none()
            && self.gpu_hotspot_c.is_none()
            && self.gpu_memory_temp_c.is_none()
    }
}

pub struct ExternalSensorBridge {
    latest: Arc<Mutex<ExternalSensors>>,
}

impl ExternalSensorBridge {
    /// Spawns the background polling thread.
    /// Uses zero-overhead TCP socket reads for LibreHardwareMonitor HTTP (`127.0.0.1:8085`),
    /// and strictly rate-limits PowerShell WMI thermal fallback so `powershell.exe` is NEVER
    /// spawned repeatedly every 2-5 seconds during gameplay!
    pub fn start() -> Self {
        let latest = Arc::new(Mutex::new(ExternalSensors::default()));
        let shared = latest.clone();

        std::thread::spawn(move || {
            let mut last_wmi_probe: Option<Instant> = None;
            let mut wmi_consecutive_misses: u32 = 0;

            loop {
                let mut next = fetch_http().unwrap_or_default();
                let http_ok = !next.is_empty();

                if !http_ok {
                    // Only probe WMI via PowerShell if enough time has elapsed (60s if supported, 300s if unsupported)
                    let wmi_interval = if wmi_consecutive_misses >= 2 {
                        Duration::from_secs(300)
                    } else {
                        Duration::from_secs(45)
                    };
                    let should_probe_wmi = last_wmi_probe
                        .map(|t| t.elapsed() >= wmi_interval)
                        .unwrap_or(true);

                    if should_probe_wmi {
                        last_wmi_probe = Some(Instant::now());
                        if let Some(wmi_sensors) = fetch_wmi_sensors() {
                            if !wmi_sensors.is_empty() {
                                wmi_consecutive_misses = 0;
                                next = wmi_sensors;
                            } else {
                                wmi_consecutive_misses = wmi_consecutive_misses.saturating_add(1);
                            }
                        } else {
                            wmi_consecutive_misses = wmi_consecutive_misses.saturating_add(1);
                        }
                    } else if let Ok(prev) = shared.lock() {
                        next = prev.clone();
                    }
                }

                if let Ok(mut slot) = shared.lock() {
                    *slot = next;
                }
                std::thread::sleep(Duration::from_secs(if http_ok { 2 } else { 8 }));
            }
        });

        Self { latest }
    }

    pub fn latest(&self) -> ExternalSensors {
        self.latest.lock().map(|g| g.clone()).unwrap_or_default()
    }
}

fn fetch_http() -> Option<ExternalSensors> {
    let addr: SocketAddr = ADDRESS.parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(120)).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(600))).ok()?;
    stream.set_write_timeout(Some(Duration::from_millis(200))).ok()?;
    stream
        .write_all(b"GET /data.json HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;

    let mut raw = Vec::new();
    stream.take(4 * 1024 * 1024).read_to_end(&mut raw).ok()?;
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let json: Value = serde_json::from_slice(&raw[split + 4..]).ok()?;
    let mut parsed = parse_sensor_tree(&json);
    if !parsed.is_empty() {
        parsed.source = Some("LibreHardwareMonitor (HTTP)");
    }
    Some(parsed)
}

#[cfg(target_os = "windows")]
fn fetch_wmi_sensors() -> Option<ExternalSensors> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let script = r#"
$ErrorActionPreference = 'SilentlyContinue'
$out = @{ cpuTemp = $null; cpuPower = $null; gpuTemp = $null; gpuHot = $null; gpuMem = $null; src = $null }
foreach ($ns in @('root\LibreHardwareMonitor', 'root\OpenHardwareMonitor')) {
  $sensors = Get-CimInstance -Namespace $ns -ClassName Sensor
  if ($sensors) {
    foreach ($s in $sensors) {
      $n = ([string]$s.Name).ToLower()
      $t = [string]$s.SensorType
      $v = [double]$s.Value
      if ($t -eq 'Temperature' -and $v -gt 15 -and $v -lt 130) {
        if ($n -match 'cpu package|tctl|tdie|cpu total|ccd1|core max|core average|cpu \(tctl') {
          if (-not $out.cpuTemp -or $v -gt $out.cpuTemp) { $out.cpuTemp = $v; $out.src = $ns }
        } elseif ($n -match '^core #' -and -not $out.cpuTemp) {
          $out.cpuTemp = $v; $out.src = $ns
        } elseif ($n -match 'hot spot|hotspot|gpu junction') {
          $out.gpuHot = $v
        } elseif ($n -match 'memory junction|gpu memory') {
          $out.gpuMem = $v
        } elseif ($n -match 'gpu core|gpu temperature') {
          $out.gpuTemp = $v
        }
      } elseif ($t -eq 'Power' -and $v -gt 1 -and $v -lt 500) {
        if ($n -match 'cpu package|cpu power|package power') { $out.cpuPower = $v }
      }
    }
    if ($out.cpuTemp) { break }
  }
}
if (-not $out.cpuTemp) {
  $tz = Get-CimInstance -Namespace 'root\cimv2' -ClassName Win32_PerfFormattedData_Counters_ThermalZoneInformation
  foreach ($z in $tz) {
    $hp = [double]$z.HighPrecisionTemperature
    $c = if ($hp -gt 2732) { ($hp / 10.0) - 273.15 } elseif ([double]$z.Temperature -gt 273) { [double]$z.Temperature - 273.15 } else { 0 }
    if ($c -gt 22 -and $c -lt 115 -and [Math]::Abs($c - 27.85) -gt 0.2) {
      if (-not $out.cpuTemp -or $c -gt $out.cpuTemp) { $out.cpuTemp = [Math]::Round($c, 1); $out.src = 'Windows Thermal Zone (WMI)' }
    }
  }
}
$out | ConvertTo-Json -Compress
"#;

    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let json: Value = serde_json::from_str(text.trim()).ok()?;

    let cpu_temp_c = json.get("cpuTemp").and_then(Value::as_f64).map(|v| v as f32);
    let cpu_power_w = json.get("cpuPower").and_then(Value::as_f64).map(|v| v as f32);
    let gpu_temp_c = json.get("gpuTemp").and_then(Value::as_f64).map(|v| v as f32);
    let gpu_hotspot_c = json.get("gpuHot").and_then(Value::as_f64).map(|v| v as f32);
    let gpu_memory_temp_c = json.get("gpuMem").and_then(Value::as_f64).map(|v| v as f32);
    let src_str = json.get("src").and_then(Value::as_str).unwrap_or("");
    let source = if src_str.contains("LibreHardwareMonitor") {
        Some("LibreHardwareMonitor (WMI)")
    } else if src_str.contains("OpenHardwareMonitor") {
        Some("OpenHardwareMonitor (WMI)")
    } else if src_str.contains("Thermal Zone") {
        Some("Windows Thermal Zone")
    } else {
        None
    };

    Some(ExternalSensors {
        cpu_temp_c,
        cpu_power_w,
        cpu_clock_ghz: None,
        gpu_temp_c,
        gpu_hotspot_c,
        gpu_memory_temp_c,
        gpu_usage: None,
        gpu_clock_mhz: None,
        gpu_fan_percent: None,
        gpu_power_w: None,
        source,
    })
}

#[cfg(not(target_os = "windows"))]
fn fetch_wmi_sensors() -> Option<ExternalSensors> {
    None
}

fn parse_value(text: &str, max_bound: f32) -> Option<f32> {
    let trimmed = text.trim();
    let end = trimmed
        .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == ',' || c == '-'))
        .unwrap_or(trimmed.len());
    if end == 0 {
        return None;
    }
    let value: f32 = trimmed[..end].replace(',', ".").parse().ok()?;
    (1.0..=max_bound).contains(&value).then_some(value)
}

pub fn parse_sensor_tree(root: &Value) -> ExternalSensors {
    #[derive(Default)]
    struct Acc {
        cpu_primary: Option<f32>,
        cpu_cores: Option<f32>,
        cpu_power: Option<f32>,
        cpu_clock_mhz: Option<f32>,
        gpu_temp: Option<f32>,
        hotspot: Option<f32>,
        memory: Option<f32>,
        gpu_usage: Option<f32>,
        gpu_clock_mhz: Option<u32>,
        gpu_fan: Option<f32>,
        gpu_power: Option<f32>,
    }
    let mut acc = Acc::default();

    fn walk(node: &Value, acc: &mut Acc) {
        let text = node.get("Text").and_then(Value::as_str).unwrap_or("");
        let value_text = node.get("Value").and_then(Value::as_str).unwrap_or("");
        let name = text.to_lowercase();

        if value_text.contains('°') {
            if let Some(v) = parse_value(value_text, 150.0) {
                if name.contains("hot spot") || name.contains("hotspot") {
                    acc.hotspot = Some(acc.hotspot.map_or(v, |m| m.max(v)));
                } else if name.contains("memory junction") || name == "gpu memory" {
                    acc.memory = Some(acc.memory.map_or(v, |m| m.max(v)));
                } else if name.contains("gpu core") || name == "gpu temperature" || name == "gpu" {
                    acc.gpu_temp = Some(acc.gpu_temp.map_or(v, |m| m.max(v)));
                } else if name.contains("cpu package")
                    || name.contains("tctl")
                    || name.contains("tdie")
                    || name.contains("core max")
                    || name.contains("core average")
                    || name.contains("ccd1")
                    || name == "cpu total"
                {
                    acc.cpu_primary = Some(acc.cpu_primary.map_or(v, |m| m.max(v)));
                } else if name.starts_with("core") || name.contains("cpu") {
                    acc.cpu_cores = Some(acc.cpu_cores.map_or(v, |m| m.max(v)));
                }
            }
        } else if value_text.ends_with(" W") || value_text.contains(" W") {
            if let Some(v) = parse_value(value_text, 800.0) {
                if name.contains("cpu package") || name.contains("cpu power") {
                    acc.cpu_power = Some(acc.cpu_power.map_or(v, |m| m.max(v)));
                } else if name.contains("gpu") {
                    acc.gpu_power = Some(acc.gpu_power.map_or(v, |m| m.max(v)));
                }
            }
        } else if value_text.contains("MHz") {
            if let Some(v) = parse_value(value_text, 10000.0) {
                if name.contains("gpu core") {
                    acc.gpu_clock_mhz = Some(v.round() as u32);
                } else if name.starts_with("core #") || name.contains("cpu") {
                    acc.cpu_clock_mhz = Some(acc.cpu_clock_mhz.map_or(v, |m| m.max(v)));
                }
            }
        } else if value_text.contains('%') {
            if let Some(v) = parse_value(value_text, 100.0) {
                if name == "gpu core" || name == "d3d 3d" {
                    acc.gpu_usage = Some(acc.gpu_usage.map_or(v, |m| m.max(v)));
                } else if name.contains("gpu fan") {
                    acc.gpu_fan = Some(acc.gpu_fan.map_or(v, |m| m.max(v)));
                }
            }
        }

        if let Some(children) = node.get("Children").and_then(Value::as_array) {
            for child in children {
                walk(child, acc);
            }
        }
    }

    walk(root, &mut acc);

    ExternalSensors {
        cpu_temp_c: acc.cpu_primary.or(acc.cpu_cores),
        cpu_power_w: acc.cpu_power,
        cpu_clock_ghz: acc.cpu_clock_mhz.map(|mhz| ((mhz / 1000.0) * 100.0).round() / 100.0),
        gpu_temp_c: acc.gpu_temp,
        gpu_hotspot_c: acc.hotspot,
        gpu_memory_temp_c: acc.memory,
        gpu_usage: acc.gpu_usage,
        gpu_clock_mhz: acc.gpu_clock_mhz,
        gpu_fan_percent: acc.gpu_fan,
        gpu_power_w: acc.gpu_power,
        source: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_values() {
        assert_eq!(parse_value("65.4 °C", 150.0), Some(65.4));
        assert_eq!(parse_value("71,5 °C", 150.0), Some(71.5));
        assert_eq!(parse_value("0 °C", 150.0), None);
        assert_eq!(parse_value("abc", 150.0), None);
    }

    #[test]
    fn extracts_temps_from_tree() {
        let json: Value = serde_json::from_str(
            r#"{
                "Text": "Sensor",
                "Children": [
                    { "Text": "CPU Package", "Value": "66.5 °C" },
                    { "Text": "Core #1", "Value": "64.0 °C" },
                    { "Text": "GPU Core", "Value": "60.0 °C" },
                    { "Text": "GPU Hot Spot", "Value": "72.0 °C" },
                    { "Text": "GPU Memory Junction", "Value": "70.0 °C" }
                ]
            }"#,
        )
        .unwrap();
        let s = parse_sensor_tree(&json);
        assert_eq!(s.cpu_temp_c, Some(66.5));
        assert_eq!(s.gpu_temp_c, Some(60.0));
        assert_eq!(s.gpu_hotspot_c, Some(72.0));
        assert_eq!(s.gpu_memory_temp_c, Some(70.0));
    }
}
