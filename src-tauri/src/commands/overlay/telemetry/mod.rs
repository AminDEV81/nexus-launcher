pub mod battery;
pub mod cpu;
pub mod external_sensors;
pub mod frame_timing;
pub mod gpu;
pub mod manager;
pub mod memory;
pub mod network;
#[cfg(target_os = "windows")]
pub mod pdh;
pub mod snapshot;
pub mod storage;
#[cfg(target_os = "windows")]
pub mod thermal;

pub use manager::TelemetryManager;
pub use snapshot::{OverlayMetrics, TelemetryProviderStatus};
