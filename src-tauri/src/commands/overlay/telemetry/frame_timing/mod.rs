#[cfg(target_os = "windows")]
pub mod etw;
pub mod provider;
pub mod statistics;
pub mod windows;

pub use provider::FrameTimingProvider;
pub use windows::WindowsFrameTimingProvider;
