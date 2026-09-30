pub mod commands;
pub mod config;
pub mod game_detection;
pub mod hotkey;
pub mod telemetry;
pub mod watcher;
pub mod window;

pub use commands::*;
pub use hotkey::GlobalHotkeyManager;
pub use watcher::AutoGameWatcher;
