//! Optional bridge to LibreHardwareMonitor / OpenHardwareMonitor.
//!
//! Windows exposes neither the CPU package temperature nor the GPU hotspot
//! without a kernel driver. If the user runs LibreHardwareMonitor (or
//! OpenHardwareMonitor) with its "Remote Web Server" enabled, its sensor
//! tree is readable at `http://127.0.0.1:8085/data.json`; we read CPU
//! temperature and GPU hotspot/VRAM temperature from there. Everything is
//! best-effort: if the server isn't running this stays empty.

use serde_json::Value;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct ExternalSensors {
    pub cpu_temp_c: Option<f32>,
    pub gpu_hotspot_c: Option<f32>,
    pub gpu_memory_temp_c: Option<f32>,
}

impl ExternalSensors {
    pub fn is_empty(&self) -> bool {
        self.cpu_temp_c.is_none() && self.gpu_hotspot_c.is_none() && self.gpu_memory_temp_c.is_none()
    }
}

const ADDRESS: &str = "127.0.0.1:8085";

pub struct ExternalSensorBridge {
    latest: Arc<Mutex<ExternalSensors>>,
}

impl ExternalSensorBridge {
    /// Spawns the polling thread. It lives for the whole process and sleeps
    /// longer while the server is unreachable.
    pub fn start() -> Self {
        let latest = Arc::new(Mutex::new(ExternalSensors::default()));
        let shared = latest.clone();

        std::thread::spawn(move || loop {
            let next = fetch().unwrap_or_default();
            let reachable = !next.is_empty();
            if let Ok(mut slot) = shared.lock() {
                *slot = next;
            }
            std::thread::sleep(Duration::from_secs(if reachable { 2 } else { 10 }));
        });

        Self { latest }
    }

    pub fn latest(&self) -> ExternalSensors {
        self.latest.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

fn fetch() -> Option<ExternalSensors> {
    let addr: SocketAddr = ADDRESS.parse().ok()?;
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(200)).ok()?;
    stream.set_read_timeout(Some(Duration::from_millis(800))).ok()?;
    stream.set_write_timeout(Some(Duration::from_millis(300))).ok()?;
    // HTTP/1.0 so the server never answers with chunked encoding.
    stream
        .write_all(b"GET /data.json HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .ok()?;

    let mut raw = Vec::new();
    stream.take(4 * 1024 * 1024).read_to_end(&mut raw).ok()?;
    let split = raw.windows(4).position(|w| w == b"\r\n\r\n")?;
    let json: Value = serde_json::from_slice(&raw[split + 4..]).ok()?;
    Some(parse_sensor_tree(&json))
}

/// Leading number of strings like `65.4 °C` (also accepts a decimal comma).
fn parse_value(text: &str) -> Option<f32> {
    let trimmed = text.trim();
    let end = trimmed
        .find(|c: char| !(c.is_ascii_digit() || c == '.' || c == ',' || c == '-'))
        .unwrap_or(trimmed.len());
    let value: f32 = trimmed[..end].replace(',', ".").parse().ok()?;
    (1.0..=150.0).contains(&value).then_some(value)
}

/// Walks the LibreHardwareMonitor sensor tree and picks the relevant temperatures.
pub fn parse_sensor_tree(root: &Value) -> ExternalSensors {
    struct Acc {
        cpu_primary: Option<f32>,
        cpu_cores: Option<f32>,
        hotspot: Option<f32>,
        memory: Option<f32>,
    }
    let mut acc = Acc {
        cpu_primary: None,
        cpu_cores: None,
        hotspot: None,
        memory: None,
    };

    fn walk(node: &Value, acc: &mut Acc) {
        let text = node.get("Text").and_then(Value::as_str).unwrap_or("");
        let value_text = node.get("Value").and_then(Value::as_str).unwrap_or("");

        if value_text.contains('°') {
            if let Some(v) = parse_value(value_text) {
                let name = text.to_lowercase();
                if name.contains("hot spot") || name.contains("hotspot") {
                    acc.hotspot = Some(acc.hotspot.map_or(v, |m| m.max(v)));
                } else if name.contains("memory junction") || name == "gpu memory" {
                    acc.memory = Some(acc.memory.map_or(v, |m| m.max(v)));
                } else if name.contains("cpu package")
                    || name.contains("tctl")
                    || name.contains("tdie")
                    || name == "cpu total"
                {
                    acc.cpu_primary = Some(acc.cpu_primary.map_or(v, |m| m.max(v)));
                } else if name.starts_with("core") {
                    acc.cpu_cores = Some(acc.cpu_cores.map_or(v, |m| m.max(v)));
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
        gpu_hotspot_c: acc.hotspot,
        gpu_memory_temp_c: acc.memory,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_values() {
        assert_eq!(parse_value("65.4 °C"), Some(65.4));
        assert_eq!(parse_value("71,5 °C"), Some(71.5));
        assert_eq!(parse_value("0 °C"), None);
        assert_eq!(parse_value("abc"), None);
    }

    #[test]
    fn picks_cpu_package_and_gpu_hotspot() {
        let json: Value = serde_json::from_str(
            r#"{"Text":"Sensor","Children":[{"Text":"PC","Children":[
              {"Text":"Ryzen","Children":[{"Text":"Temperatures","Children":[
                {"Text":"Core #1","Value":"61.0 °C"},
                {"Text":"CPU Package","Value":"66.5 °C"}]}]},
              {"Text":"RTX","Children":[{"Text":"Temperatures","Children":[
                {"Text":"GPU Core","Value":"60.0 °C"},
                {"Text":"GPU Hot Spot","Value":"72.0 °C"},
                {"Text":"GPU Memory Junction","Value":"70.0 °C"}]}]}]}]}"#,
        )
        .unwrap();
        let s = parse_sensor_tree(&json);
        assert_eq!(s.cpu_temp_c, Some(66.5));
        assert_eq!(s.gpu_hotspot_c, Some(72.0));
        assert_eq!(s.gpu_memory_temp_c, Some(70.0));
    }
}
