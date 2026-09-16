pub mod backup;
pub mod booster;
pub mod collections;
pub mod download;
pub mod games;
pub mod hub;
pub mod import;
pub mod launch;
pub mod metadata;
pub mod profiles;
pub mod save_manager;
pub mod scan;
pub mod settings;
pub mod stats;
pub mod steam_price;
pub mod soundtrack;
pub mod system;
pub mod tags;

// As each Epic adds backend functionality, its commands get their own
// module here.
//
// Note: modules are `pub mod`, not re-exported with `pub use module::fn;`.
// `#[tauri::command]` generates hidden sibling items alongside each
// command function in its own module; a `pub use` of just the function
// name leaves those siblings behind, which is exactly what caused
// `generate_handler!` to fail to find them. Always register commands in
// `lib.rs` via their full path, e.g. `commands::system::health_check`.
