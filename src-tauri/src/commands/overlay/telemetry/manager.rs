use super::battery::BatteryTelemetryProvider;
use super::cpu::CpuTelemetryProvider;
use super::external_sensors::ExternalSensorBridge;
use super::frame_timing::{FrameTimingProvider, WindowsFrameTimingProvider};
use super::gpu::GpuTelemetryProvider;
use super::memory::MemoryTelemetryProvider;
use super::network::NetworkTelemetryProvider;
use super::snapshot::{OverlayMetrics, TelemetryProviderStatus};
use super::storage::StorageTelemetryProvider;
use crate::commands::overlay::game_detection::process::ForegroundProcess;
use crate::commands::overlay::game_detection::{GameResolver, ProcessScanner};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Instant;
use sysinfo::System;

pub struct TelemetryManager {
    system: System,
    cpu_provider: CpuTelemetryProvider,
    gpu_provider: GpuTelemetryProvider,
    memory_provider: MemoryTelemetryProvider,
    network_provider: NetworkTelemetryProvider,
    storage_provider: StorageTelemetryProvider,
    battery_provider: BatteryTelemetryProvider,
    frame_provider: WindowsFrameTimingProvider,
    game_resolver: GameResolver,
    external: ExternalSensorBridge,

    consumer_count: AtomicUsize,
    frame_running: bool,
    /// Last game seen in the foreground; kept while its process is alive so
    /// alt-tabbing doesn't blank the title / session timer.
    sticky_game: Option<ForegroundProcess>,
    last_snapshot: OverlayMetrics,
    last_poll_time: Option<Instant>,
}

impl TelemetryManager {
    pub fn new() -> Self {
        let mut system = System::new();
        system.refresh_cpu_all();
        system.refresh_memory();

        Self {
            system,
            cpu_provider: CpuTelemetryProvider::new(),
            gpu_provider: GpuTelemetryProvider::new(),
            memory_provider: MemoryTelemetryProvider::new(),
            network_provider: NetworkTelemetryProvider::new(),
            storage_provider: StorageTelemetryProvider::new(),
            battery_provider: BatteryTelemetryProvider::new(),
            frame_provider: WindowsFrameTimingProvider::new(),
            game_resolver: GameResolver::new(),
            external: ExternalSensorBridge::start(),
            consumer_count: AtomicUsize::new(0),
            frame_running: false,
            sticky_game: None,
            last_snapshot: OverlayMetrics::default(),
            last_poll_time: None,
        }
    }

    pub fn add_consumer(&self) {
        let prev = self.consumer_count.fetch_add(1, Ordering::SeqCst);
        if prev == 0 {
            log::info!("[Overlay] First consumer registered: telemetry awakened");
        }
    }

    pub fn remove_consumer(&self) {
        let prev = self.consumer_count.fetch_sub(1, Ordering::SeqCst);
        if prev <= 1 {
            self.consumer_count.store(0, Ordering::SeqCst);
            log::info!("[Overlay] Zero consumers remaining: telemetry suspended (0% CPU)");
        }
    }

    pub fn has_active_consumers(&self) -> bool {
        self.consumer_count.load(Ordering::SeqCst) > 0
    }

    pub fn start_frame_timing(&mut self) {
        // Idempotent: restarting would wipe the frame history.
        if !self.frame_running {
            self.frame_provider.start();
            self.frame_running = true;
        }
    }

    pub fn stop_frame_timing(&mut self) {
        if self.frame_running {
            self.frame_provider.stop();
            self.frame_running = false;
        }
    }

    pub fn poll_metrics(
        &mut self,
        known_games: &[(String, String, Option<String>, Option<String>)],
    ) -> OverlayMetrics {
        // Only refresh CPU and Memory deltas (never reallocates System!)
        self.system.refresh_cpu_usage();
        self.system.refresh_memory();

        let external = self.external.latest();
        let cpu = self.cpu_provider.poll(&self.system, external.cpu_temp_c);
        let gpu = self.gpu_provider.poll();
        let mem = self.memory_provider.poll(&self.system);
        let net = self.network_provider.poll();
        let disk = self.storage_provider.poll();
        let bat = self.battery_provider.poll();

        // Game detection
        let fg_process = self.resolve_game_process(known_games);
        let fg_window = fg_process.as_ref().map(|p| p.window_handle);
        let fg_pid = fg_process.as_ref().map(|p| p.pid);
        let active_game = self.game_resolver.resolve(known_games, fg_process.as_ref());

        // Frame timing from the actual foreground game process and window.
        let frame_snapshot = self.frame_provider.poll(fg_window, fg_pid);

        self.last_poll_time = Some(Instant::now());

        let snapshot = OverlayMetrics {
            timestamp: chrono::Utc::now().timestamp_millis() as u64,
            fps: frame_snapshot.current_fps,
            frametime_ms: frame_snapshot.frametime_ms,
            fps_one_percent_low: frame_snapshot.one_percent_low,
            fps_point_one_percent_low: frame_snapshot.point_one_percent_low,
            frametime_history: frame_snapshot.history,

            cpu_usage: Some(cpu.usage),
            cpu_temp: cpu.temp_c,
            cpu_clock_ghz: Some(cpu.clock_ghz),
            cpu_power_w: cpu.power_w,
            cpu_cores: Some(cpu.cores),

            gpu_name: gpu.name,
            gpu_usage: gpu.usage,
            gpu_vram_used_bytes: gpu.vram_used_bytes,
            gpu_vram_total_bytes: gpu.vram_total_bytes,
            gpu_temp: gpu.temp_c,
            // NVML has no hotspot; the LibreHardwareMonitor bridge fills that gap.
            gpu_hotspot_temp: gpu.hotspot_c.or(external.gpu_hotspot_c),
            gpu_memory_temp: gpu.memory_temp_c.or(external.gpu_memory_temp_c),
            gpu_clock_mhz: gpu.clock_mhz,
            gpu_fan_percent: gpu.fan_percent,
            gpu_power_w: gpu.power_w,

            ram_used_bytes: Some(mem.used_bytes),
            ram_total_bytes: Some(mem.total_bytes),
            ram_available_bytes: Some(mem.available_bytes),

            disk_read_bps: disk.read_bps,
            disk_write_bps: disk.write_bps,

            network_download_bps: net.download_bps,
            network_upload_bps: net.upload_bps,
            ping_ms: net.ping_ms,

            battery_percent: bat.percent,
            battery_charging: bat.charging,

            game_title: active_game.as_ref().map(|g| g.title.clone()),
            session_seconds: active_game.as_ref().map(|g| g.session_duration_secs),
        };

        // Cache last snapshot
        self.last_snapshot = snapshot.clone();

        snapshot
    }

    /// The foreground process if (and only if) it looks like a game, else
    /// the last game that is still running.
    fn resolve_game_process(
        &mut self,
        known_games: &[(String, String, Option<String>, Option<String>)],
    ) -> Option<ForegroundProcess> {
        if let Some(fg) = ProcessScanner::get_foreground_process() {
            if GameResolver::is_game_like(known_games, &fg) {
                self.sticky_game = Some(fg.clone());
                return Some(fg);
            }
        }
        match &self.sticky_game {
            Some(p) if ProcessScanner::is_pid_alive(p.pid) => Some(p.clone()),
            _ => {
                self.sticky_game = None;
                None
            }
        }
    }

    #[allow(dead_code)]
    pub fn get_cached_snapshot(&self) -> OverlayMetrics {
        self.last_snapshot.clone()
    }

    pub fn get_provider_status(&self) -> TelemetryProviderStatus {
        TelemetryProviderStatus {
            cpu: true,
            gpu: true,
            memory: true,
            frame_timing: self.frame_provider.is_available(),
            storage: true,
            network: true,
            battery: true,
            active_game: true,
            frame_timing_error: self.frame_provider.last_error(),
            cpu_temp_source: self.cpu_provider.temp_source().map(str::to_string),
        }
    }
}

impl Default for TelemetryManager {
    fn default() -> Self {
        Self::new()
    }
}
