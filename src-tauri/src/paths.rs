use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

/// Marker file that switches the app into portable mode — same
/// convention many portable Windows apps use. If this file sits next to
/// the executable, the database and artwork cache live in that same
/// folder instead of the OS's per-user app-data directory, so the whole
/// install can be copied to a USB drive or another machine and just
/// keep working, with nothing left behind in `%APPDATA%`.
const PORTABLE_MARKER: &str = "portable.txt";

/// Resolves where the app's data (SQLite database, artwork cache)
/// should live — the executable's directory if `portable.txt` sits next
/// to it, the OS's normal per-user app-data directory otherwise.
/// Everything that used to call `app.path().app_data_dir()` directly
/// (`db::connection::resolve_db_path`,
/// `commands::metadata::artwork::artwork_dir`) goes through this
/// instead, so portable mode only has to be implemented in one place.
///
/// The asset protocol's scope (`tauri.conf.json`) allow-lists both
/// `$APPDATA/artwork/**` and `$EXE/artwork/**` for the same reason —
/// `$EXE` is one of Tauri's built-in scope variables and resolves to
/// this same executable directory at request time, so cover art loads
/// correctly regardless of which mode produced the path.
pub fn app_data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    if let Some(dir) = portable_dir() {
        return Ok(dir);
    }
    app.path()
        .app_data_dir()
        .map_err(|_| AppError::AppDataDirUnavailable)
}

fn portable_dir() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    exe_dir.join(PORTABLE_MARKER).is_file().then_some(exe_dir)
}

/// Surfaced to Settings > Backup purely as an FYI ("Portable mode is
/// active because portable.txt exists next to the executable") — not
/// something togglable from inside the app. Creating or deleting that
/// file is a deliberate, outside-the-app action, the same as any other
/// portable Windows application.
#[tauri::command]
pub fn is_portable_mode() -> bool {
    portable_dir().is_some()
}
