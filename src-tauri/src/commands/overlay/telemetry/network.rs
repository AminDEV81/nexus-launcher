use std::net::{SocketAddr, TcpStream};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use sysinfo::Networks;

pub struct NetworkMetrics {
    pub download_bps: Option<f32>,
    pub upload_bps: Option<f32>,
    pub ping_ms: Option<f32>,
}

pub struct NetworkTelemetryProvider {
    networks: Networks,
    last_poll_time: Option<Instant>,
    last_ping_time: Option<Instant>,
    /// Latest ping in tenths of a millisecond; `u32::MAX` = unreachable.
    /// Written by a short-lived probe thread so polling never blocks.
    ping_tenths: Arc<AtomicU32>,
    ping_in_flight: Arc<AtomicBool>,
}

impl NetworkTelemetryProvider {
    pub fn new() -> Self {
        Self {
            networks: Networks::new_with_refreshed_list(),
            last_poll_time: None,
            last_ping_time: None,
            ping_tenths: Arc::new(AtomicU32::new(u32::MAX)),
            ping_in_flight: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn poll(&mut self) -> NetworkMetrics {
        self.networks.refresh();
        let now = Instant::now();

        let elapsed_secs = self
            .last_poll_time
            .map(|t| now.duration_since(t).as_secs_f32())
            .unwrap_or(1.0);
        self.last_poll_time = Some(now);

        let mut total_rx = 0u64;
        let mut total_tx = 0u64;

        for (_name, net) in &self.networks {
            total_rx += net.received();
            total_tx += net.transmitted();
        }

        let download_bps = if elapsed_secs > 0.0 {
            Some(total_rx as f32 / elapsed_secs)
        } else {
            None
        };

        let upload_bps = if elapsed_secs > 0.0 {
            Some(total_tx as f32 / elapsed_secs)
        } else {
            None
        };

        // Ping probe every 3 seconds, off-thread: a TCP connect can take up
        // to its timeout and must not stall the telemetry lock.
        let due = self
            .last_ping_time
            .map(|t| t.elapsed() > Duration::from_secs(3))
            .unwrap_or(true);
        if due && !self.ping_in_flight.swap(true, Ordering::SeqCst) {
            self.last_ping_time = Some(now);
            let slot = self.ping_tenths.clone();
            let in_flight = self.ping_in_flight.clone();
            std::thread::spawn(move || {
                let tenths = Self::measure_ping()
                    .map(|ms| (ms * 10.0).round() as u32)
                    .unwrap_or(u32::MAX);
                slot.store(tenths, Ordering::SeqCst);
                in_flight.store(false, Ordering::SeqCst);
            });
        }

        let tenths = self.ping_tenths.load(Ordering::SeqCst);
        let ping_ms = if tenths == u32::MAX {
            None
        } else {
            Some(tenths as f32 / 10.0)
        };

        NetworkMetrics {
            download_bps,
            upload_bps,
            ping_ms,
        }
    }

    fn measure_ping() -> Option<f32> {
        let target: SocketAddr = "1.1.1.1:53".parse().ok()?;
        let start = Instant::now();
        if TcpStream::connect_timeout(&target, Duration::from_millis(400)).is_ok() {
            let elapsed_ms = start.elapsed().as_secs_f32() * 1000.0;
            Some((elapsed_ms * 10.0).round() / 10.0)
        } else {
            None
        }
    }
}

impl Default for NetworkTelemetryProvider {
    fn default() -> Self {
        Self::new()
    }
}
