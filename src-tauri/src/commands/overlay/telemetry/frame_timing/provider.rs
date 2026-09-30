#[derive(Debug, Clone, Default)]
#[allow(dead_code)]
pub struct FrameTimingSnapshot {
    pub current_fps: Option<f32>,
    pub average_fps: Option<f32>,
    pub frametime_ms: Option<f32>,
    pub one_percent_low: Option<f32>,
    pub point_one_percent_low: Option<f32>,
    pub history: Vec<f32>,
}

pub trait FrameTimingProvider: Send + Sync {
    fn start(&mut self);
    fn stop(&mut self);
    fn poll(&mut self, active_window: Option<isize>, active_pid: Option<u32>) -> FrameTimingSnapshot;
    fn is_available(&self) -> bool;
    /// Why frame timing is unavailable (e.g. missing admin rights), if known.
    fn last_error(&self) -> Option<String> {
        None
    }
}
