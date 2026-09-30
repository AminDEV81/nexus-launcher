use super::provider::{FrameTimingProvider, FrameTimingSnapshot};
use super::statistics::FrameHistoryEngine;
#[cfg(target_os = "windows")]
use std::time::{Duration, Instant};

/// Frame timing from real Present() events (ETW, like PresentMon).
///
/// The old implementation counted DWM composition frames, which for a
/// fullscreen / independent-flip game is unrelated to the game's frame
/// rate (it mostly counted the overlay's own redraws). Without an ETW
/// session (no admin rights, unsupported OS) this reports *no* FPS rather
/// than a wrong one.
pub struct WindowsFrameTimingProvider {
    engine: FrameHistoryEngine,
    is_running: bool,
    error: Option<String>,
    #[cfg(target_os = "windows")]
    monitor: Option<super::etw::EtwPresentMonitor>,
    #[cfg(target_os = "windows")]
    tracked_pid: Option<u32>,
    #[cfg(target_os = "windows")]
    last_present_secs: Option<f64>,
}

impl WindowsFrameTimingProvider {
    pub fn new() -> Self {
        Self {
            engine: FrameHistoryEngine::new(10, 2000),
            is_running: false,
            error: None,
            #[cfg(target_os = "windows")]
            monitor: None,
            #[cfg(target_os = "windows")]
            tracked_pid: None,
            #[cfg(target_os = "windows")]
            last_present_secs: None,
        }
    }

    /// Pulls new Present events for the game and turns them into frame times.
    #[cfg(target_os = "windows")]
    fn ingest(&mut self, pid: u32) {
        let Some(monitor) = self.monitor.as_ref() else {
            return;
        };

        if self.tracked_pid != Some(pid) {
            self.tracked_pid = Some(pid);
            self.last_present_secs = None;
            self.engine.clear();
        }

        let now_secs = monitor.now_secs();
        let now = Instant::now();

        for event in monitor.drain(pid) {
            if let Some(last) = self.last_present_secs {
                let dt_ms = (event.time_secs - last) * 1000.0;
                // Ignore gaps (loading screens, pause) and duplicate timestamps.
                if dt_ms > 0.05 && dt_ms < 1000.0 {
                    let age = Duration::from_secs_f64((now_secs - event.time_secs).max(0.0));
                    let at = now.checked_sub(age).unwrap_or(now);
                    self.engine.push_sample_at(dt_ms as f32, at);
                }
            }
            self.last_present_secs = Some(event.time_secs);
        }
    }

    #[cfg(not(target_os = "windows"))]
    fn ingest(&mut self, _pid: u32) {}
}

impl Default for WindowsFrameTimingProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl FrameTimingProvider for WindowsFrameTimingProvider {
    fn start(&mut self) {
        self.is_running = true;
        self.engine.clear();

        #[cfg(target_os = "windows")]
        if self.monitor.is_none() {
            match super::etw::EtwPresentMonitor::start() {
                Ok(monitor) => {
                    log::info!("[Overlay] ETW frame timing session started");
                    self.monitor = Some(monitor);
                    self.error = None;
                }
                Err(e) => {
                    log::warn!("[Overlay] Frame timing unavailable: {e}");
                    self.error = Some(e);
                }
            }
        }
    }

    fn stop(&mut self) {
        self.is_running = false;
        self.engine.clear();
        #[cfg(target_os = "windows")]
        {
            // Dropping the monitor stops the ETW session.
            self.monitor = None;
            self.tracked_pid = None;
            self.last_present_secs = None;
        }
    }

    fn is_available(&self) -> bool {
        #[cfg(target_os = "windows")]
        {
            self.monitor.is_some()
        }
        #[cfg(not(target_os = "windows"))]
        {
            false
        }
    }

    fn last_error(&self) -> Option<String> {
        self.error.clone()
    }

    fn poll(&mut self, active_window: Option<isize>, active_pid: Option<u32>) -> FrameTimingSnapshot {
        if !self.is_running {
            return FrameTimingSnapshot::default();
        }

        // No game in front: never report a made-up frame rate.
        let (Some(_), Some(pid)) = (active_window, active_pid) else {
            self.engine.clear();
            return FrameTimingSnapshot::default();
        };

        self.ingest(pid);

        let window = std::time::Duration::from_millis(1000);
        FrameTimingSnapshot {
            current_fps: self.engine.recent_fps(window),
            average_fps: self.engine.average_fps(),
            frametime_ms: self.engine.recent_frametime_ms(window),
            one_percent_low: self.engine.compute_one_percent_low(),
            point_one_percent_low: self.engine.compute_point_one_percent_low(),
            history: self.engine.get_recent_history(60),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_game_means_no_fps() {
        let mut provider = WindowsFrameTimingProvider::new();
        provider.start();
        let snap = provider.poll(None, None);
        assert_eq!(snap.current_fps, None);
        assert_eq!(snap.frametime_ms, None);
        provider.stop();
    }

    #[test]
    fn recent_fps_uses_real_frame_spacing() {
        let mut engine = FrameHistoryEngine::new(10, 1000);
        for _ in 0..30 {
            engine.push_sample(1000.0 / 144.0);
        }
        let fps = engine.recent_fps(std::time::Duration::from_secs(1)).unwrap();
        assert!((fps - 144.0).abs() < 0.5);
    }
}
