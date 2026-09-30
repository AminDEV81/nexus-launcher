use std::time::{Duration, Instant};
use sysinfo::System;

/// Sensor reads can be slow; refresh sparingly.
const TEMP_REFRESH: Duration = Duration::from_secs(3);

pub struct CpuMetrics {
    pub usage: f32,
    pub cores: u32,
    pub clock_ghz: f32,
    pub temp_c: Option<f32>,
    pub power_w: Option<f32>,
}

pub struct CpuTelemetryProvider {
    #[cfg(target_os = "windows")]
    thermal: super::thermal::ThermalZoneReader,
    #[cfg(not(target_os = "windows"))]
    components: Option<sysinfo::Components>,
    last_temp_poll: Option<Instant>,
    cached_temp: Option<f32>,
    source: Option<&'static str>,
}

impl CpuTelemetryProvider {
    pub fn new() -> Self {
        Self {
            #[cfg(target_os = "windows")]
            thermal: super::thermal::ThermalZoneReader::new(),
            #[cfg(not(target_os = "windows"))]
            components: None,
            last_temp_poll: None,
            cached_temp: None,
            source: None,
        }
    }

    /// Where the current CPU temperature comes from, for the settings page.
    pub fn temp_source(&self) -> Option<&'static str> {
        self.source
    }

    #[cfg(target_os = "windows")]
    fn platform_temp(&mut self) -> Option<f32> {
        self.thermal.poll()
    }

    #[cfg(not(target_os = "windows"))]
    fn platform_temp(&mut self) -> Option<f32> {
        match self.components.as_mut() {
            Some(c) => c.refresh(),
            None => self.components = Some(sysinfo::Components::new_with_refreshed_list()),
        }
        let components = self.components.as_ref()?;
        components
            .iter()
            .filter(|c| {
                let l = c.label().to_lowercase();
                l.contains("cpu") || l.contains("core") || l.contains("package") || l.contains("tctl")
            })
            .map(|c| c.temperature())
            .filter(|t| t.is_finite() && (1.0..=125.0).contains(t))
            .fold(None, |acc: Option<f32>, t| Some(acc.map_or(t, |m| m.max(t))))
    }

    /// CPU temperature: LibreHardwareMonitor bridge first (real package
    /// sensor), then the OS thermal zone. `None` means "not available" —
    /// never a guess.
    fn poll_temp(&mut self, external: Option<f32>) -> Option<f32> {
        if let Some(t) = external {
            self.source = Some("LibreHardwareMonitor");
            self.cached_temp = Some(t);
            self.last_temp_poll = Some(Instant::now());
            return Some(t);
        }

        let due = self
            .last_temp_poll
            .map(|t| t.elapsed() >= TEMP_REFRESH)
            .unwrap_or(true);
        if !due {
            return self.cached_temp;
        }
        self.last_temp_poll = Some(Instant::now());

        self.cached_temp = self.platform_temp().map(|t| (t * 10.0).round() / 10.0);
        self.source = self.cached_temp.map(|_| "System thermal zone");
        self.cached_temp
    }

    pub fn poll(&mut self, sys: &System, external_temp: Option<f32>) -> CpuMetrics {
        let cpus = sys.cpus();
        let usage = sys.global_cpu_usage();
        let cores = cpus.len() as u32;

        let avg_freq_mhz = if !cpus.is_empty() {
            cpus.iter().map(|c| c.frequency()).sum::<u64>() / cpus.len() as u64
        } else {
            0
        };
        let clock_ghz = ((avg_freq_mhz as f32 / 1000.0) * 100.0).round() / 100.0;

        CpuMetrics {
            usage: (usage * 10.0).round() / 10.0,
            cores,
            clock_ghz,
            temp_c: self.poll_temp(external_temp),
            // CPU package power needs a kernel driver (RAPL/MSR); not available.
            power_w: None,
        }
    }
}

impl Default for CpuTelemetryProvider {
    fn default() -> Self {
        Self::new()
    }
}
