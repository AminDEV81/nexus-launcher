use crate::error::AppResult;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;

/// Wraps the single SQLite connection used by the whole app.
///
/// A single-writer Mutex is intentional here: this is a local desktop app
/// with one user, one process, and a lightweight write volume (library
/// edits, playtime ticks). A connection pool would add complexity without
/// a real benefit at this scale.
pub struct Database {
    pub connection: Mutex<Connection>,
}

impl Database {
    /// Opens (or creates) the SQLite file inside the app's data directory
    /// and runs any pending migrations.
    pub fn init(app_handle: &AppHandle) -> AppResult<Self> {
        let data_dir = crate::paths::app_data_dir(app_handle)?;
        std::fs::create_dir_all(&data_dir)?;

        let db_path = resolve_db_path(&data_dir);
        let mut connection = Connection::open(&db_path)?;

        // Sensible defaults for a local desktop app: WAL improves
        // read/write concurrency between the UI thread and background
        // tasks (e.g. metadata downloads writing while the grid reads).
        // synchronous=FULL is mandatory for transaction durability.
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        // Disable foreign keys during migration execution so table recreations
        // (RENAME -> CREATE -> INSERT -> DROP) run safely without constraint conflicts.
        connection.pragma_update(None, "foreign_keys", "OFF")?;

        super::migrations::run(&mut connection)?;

        // Clean up any orphaned save_operation_locations before enabling foreign keys
        // so that foreign key integrity checks pass cleanly.
        let _ = connection.execute(
            "DELETE FROM save_operation_locations WHERE location_id NOT IN (SELECT id FROM game_save_locations) OR operation_id NOT IN (SELECT id FROM save_operations)",
            [],
        );

        connection.pragma_update(None, "foreign_keys", "ON")?;

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
}

fn resolve_db_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("nexus.db")
}
