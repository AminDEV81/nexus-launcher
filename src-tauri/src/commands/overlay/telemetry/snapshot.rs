use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayMetrics {
    pub timestamp: u64,

    // Frame Performance
    pub fps: Option<f32>,
    pub frametime_ms: Option<f32>,
    pub fps_one_percent_low: Option<f32>,
    pub fps_point_one_percent_low: Option<f32>,
    pub frametime_history: Vec<f32>,

    // CPU Telemetry
    pub cpu_usage: Option<f32>,
    pub cpu_temp: Option<f32>,
    pub cpu_clock_ghz: Option<f32>,
    pub cpu_power_w: Option<f32>,
    pub cpu_cores: Option<u32>,

    // GPU Telemetry
    pub gpu_name: Option<String>,
    pub gpu_usage: Option<f32>,
    pub gpu_vram_used_bytes: Option<u64>,
    pub gpu_vram_total_bytes: Option<u64>,
    pub gpu_temp: Option<f32>,
    /// GPU hotspot / junction temperature (vendor-dependent availability).
    pub gpu_hotspot_temp: Option<f32>,
    /// VRAM (memory junction) temperature.
    pub gpu_memory_temp: Option<f32>,
    pub gpu_clock_mhz: Option<u32>,
    pub gpu_fan_percent: Option<f32>,
    pub gpu_power_w: Option<f32>,

    // Memory Telemetry
    pub ram_used_bytes: Option<u64>,
    pub ram_total_bytes: Option<u64>,
    pub ram_available_bytes: Option<u64>,

    // Storage & Network Telemetry (Delta-based)
    pub disk_read_bps: Option<f32>,
    pub disk_write_bps: Option<f32>,
    pub network_download_bps: Option<f32>,
    pub network_upload_bps: Option<f32>,
    pub ping_ms: Option<f32>,

    // System, Battery & Context
    pub battery_percent: Option<f32>,
    pub battery_charging: Option<bool>,
    pub game_title: Option<String>,
    pub session_seconds: Option<u64>,
}

impl Default for OverlayMetrics {
    fn default() -> Self {
        Self {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            fps: None,
            frametime_ms: None,
            fps_one_percent_low: None,
            fps_point_one_percent_low: None,
            frametime_history: Vec::new(),
            cpu_usage: None,
            cpu_temp: None,
            cpu_clock_ghz: None,
            cpu_power_w: None,
            cpu_cores: None,
            gpu_name: None,
            gpu_usage: None,
            gpu_vram_used_bytes: None,
            gpu_vram_total_bytes: None,
            gpu_temp: None,
            gpu_hotspot_temp: None,
            gpu_memory_temp: None,
            gpu_clock_mhz: None,
            gpu_fan_percent: None,
            gpu_power_w: None,
            ram_used_bytes: None,
            ram_total_bytes: None,
            ram_available_bytes: None,
            disk_read_bps: None,
            disk_write_bps: None,
            network_download_bps: None,
            network_upload_bps: None,
            ping_ms: None,
            battery_percent: None,
            battery_charging: None,
            game_title: None,
            session_seconds: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryProviderStatus {
    pub cpu: bool,
    pub gpu: bool,
    pub memory: bool,
    pub frame_timing: bool,
    pub storage: bool,
    pub network: bool,
    pub battery: bool,
    pub active_game: bool,
    /// Why FPS is unavailable (e.g. missing administrator rights).
    pub frame_timing_error: Option<String>,
    /// Origin of the CPU temperature reading, `None` when unavailable.
    pub cpu_temp_source: Option<String>,
}
