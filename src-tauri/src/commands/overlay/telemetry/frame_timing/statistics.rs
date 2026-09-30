use std::collections::VecDeque;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy)]
pub struct FrameSample {
    pub timestamp: Instant,
    pub frame_time_ms: f32,
}

#[derive(Debug)]
pub struct FrameHistoryEngine {
    samples: VecDeque<FrameSample>,
    window_duration: Duration,
    max_capacity: usize,
}

impl FrameHistoryEngine {
    pub fn new(window_seconds: u64, max_capacity: usize) -> Self {
        Self {
            samples: VecDeque::with_capacity(max_capacity.min(2048)),
            window_duration: Duration::from_secs(window_seconds),
            max_capacity,
        }
    }

    #[allow(dead_code)]
    pub fn push_sample(&mut self, frame_time_ms: f32) {
        self.push_sample_at(frame_time_ms, Instant::now());
    }

    /// Adds a frame time that happened at `at` (events arrive in batches, so
    /// the real timestamp matters for the sliding window).
    pub fn push_sample_at(&mut self, frame_time_ms: f32, at: Instant) {
        if !frame_time_ms.is_finite() || frame_time_ms <= 0.0 {
            return;
        }

        self.samples.push_back(FrameSample {
            timestamp: at,
            frame_time_ms,
        });

        // Evict samples outside the window or beyond max capacity
        let cutoff = at.checked_sub(self.window_duration).unwrap_or(at);
        while let Some(front) = self.samples.front() {
            if front.timestamp < cutoff || self.samples.len() > self.max_capacity {
                self.samples.pop_front();
            } else {
                break;
            }
        }
    }

    /// FPS over the frames presented within the last `window` (frames / time).
    /// `None` when nothing was presented recently (e.g. game paused).
    pub fn recent_fps(&self, window: Duration) -> Option<f32> {
        let cutoff = Instant::now().checked_sub(window)?;
        let (count, total_ms) = self
            .samples
            .iter()
            .rev()
            .take_while(|s| s.timestamp >= cutoff)
            .fold((0u32, 0.0f32), |(n, t), s| (n + 1, t + s.frame_time_ms));
        if count == 0 || total_ms <= 0.0 {
            return None;
        }
        Some((count as f32 * 1000.0 / total_ms).clamp(0.0, 9999.0))
    }

    /// Mean frame time of the frames presented within the last `window`.
    pub fn recent_frametime_ms(&self, window: Duration) -> Option<f32> {
        self.recent_fps(window).map(|fps| 1000.0 / fps)
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.samples.len()
    }

    #[allow(dead_code)]
    pub fn is_empty(&self) -> bool {
        self.samples.is_empty()
    }

    pub fn clear(&mut self) {
        self.samples.clear();
    }

    #[allow(dead_code)]
    pub fn current_fps(&self) -> Option<f32> {
        self.samples.back().map(|s| {
            if s.frame_time_ms > 0.0 {
                (1000.0 / s.frame_time_ms).clamp(0.0, 9999.0)
            } else {
                0.0
            }
        })
    }

    pub fn average_frametime_ms(&self) -> Option<f32> {
        if self.samples.is_empty() {
            return None;
        }
        let sum: f32 = self.samples.iter().map(|s| s.frame_time_ms).sum();
        Some(sum / self.samples.len() as f32)
    }

    pub fn average_fps(&self) -> Option<f32> {
        self.average_frametime_ms().and_then(|avg_ms| {
            if avg_ms > 0.0 {
                Some((1000.0 / avg_ms).clamp(0.0, 9999.0))
            } else {
                None
            }
        })
    }

    /// Computes duration-weighted 1% Low FPS.
    /// Sorts frame times in descending order (slowest/stuttering frames first).
    /// Accumulates until worst frames constitute 1% of total elapsed test time,
    /// then calculates the harmonic average FPS of those frames.
    pub fn compute_one_percent_low(&self) -> Option<f32> {
        self.compute_duration_weighted_low(0.01)
    }

    /// Computes duration-weighted 0.1% Low FPS.
    pub fn compute_point_one_percent_low(&self) -> Option<f32> {
        self.compute_duration_weighted_low(0.001)
    }

    fn compute_duration_weighted_low(&self, threshold_fraction: f32) -> Option<f32> {
        if self.samples.len() < 30 {
            // Need a minimum baseline of frames for statistical significance
            return None;
        }

        let mut sorted_times: Vec<f32> = self.samples.iter().map(|s| s.frame_time_ms).collect();
        // Sort descending (worst frames first)
        sorted_times.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));

        let total_time_ms: f32 = sorted_times.iter().sum();
        if total_time_ms <= 0.0 {
            return None;
        }

        let target_duration_ms = total_time_ms * threshold_fraction;
        let mut accum_duration_ms = 0.0f32;
        let mut count = 0usize;

        for &t in &sorted_times {
            accum_duration_ms += t;
            count += 1;
            if accum_duration_ms >= target_duration_ms {
                break;
            }
        }

        if count == 0 || accum_duration_ms <= 0.0 {
            return None;
        }

        // Harmonic mean FPS of the worst slice: count / (sum(t) in seconds)
        let low_fps = (count as f32 / (accum_duration_ms / 1000.0)).clamp(0.0, 9999.0);
        Some((low_fps * 10.0).round() / 10.0)
    }

    /// Returns the most recent N frame times for the frametime graph.
    pub fn get_recent_history(&self, count: usize) -> Vec<f32> {
        let n = self.samples.len();
        let skip = n.saturating_sub(count);
        self.samples.iter().skip(skip).map(|s| s.frame_time_ms).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_eviction() {
        let mut engine = FrameHistoryEngine::new(2, 100);
        for _ in 0..150 {
            engine.push_sample(16.6);
        }
        assert!(engine.len() <= 100);
    }

    #[test]
    fn test_frame_statistics_one_percent_low() {
        let mut engine = FrameHistoryEngine::new(10, 500);

        // 90 smooth 60fps frames (16.6ms) + 10 heavy stutter frames (100.0ms)
        for _ in 0..90 {
            engine.push_sample(16.6);
        }
        for _ in 0..10 {
            engine.push_sample(100.0);
        }

        let one_percent = engine.compute_one_percent_low();
        assert!(one_percent.is_some());
        let val = one_percent.unwrap();
        // Worst frames are 100ms, so 1% low should reflect ~10 FPS stutter
        assert!(val <= 15.0, "Expected low FPS due to 100ms spikes, got {val}");
    }

    #[test]
    fn test_frame_statistics_point_one_percent_low() {
        let mut engine = FrameHistoryEngine::new(10, 500);

        for _ in 0..100 {
            engine.push_sample(16.6);
        }
        engine.push_sample(200.0); // severe hitch

        let point_one = engine.compute_point_one_percent_low();
        assert!(point_one.is_some());
        let val = point_one.unwrap();
        assert!(val <= 10.0, "Expected 0.1% low to capture severe hitch, got {val}");
    }
}
