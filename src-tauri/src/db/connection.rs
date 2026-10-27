use crate::error::AppResult;
use rusqlite::Connection;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
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

        // Wait up to 5s if SQLite is momentarily busy (e.g. WAL checkpointing)
        connection.busy_timeout(Duration::from_secs(5))?;

        // Sensible defaults for a local desktop app: WAL improves
        // read/write concurrency between the UI thread and background
        // tasks (e.g. metadata downloads writing while the grid reads).
        // synchronous=NORMAL in WAL mode ensures crash safety without forcing
        // physical disk platter flushes (FlushFileBuffers) on every write, preventing 100% HDD spikes.
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        connection.pragma_update(None, "temp_store", "MEMORY")?;
        connection.pragma_update(None, "cache_size", "-32000")?;
        connection.pragma_update(None, "wal_autocheckpoint", "1000")?;
        // Disable foreign keys during migration execution so table recreations
        // (RENAME -> CREATE -> INSERT -> DROP) run safely without constraint conflicts.
        connection.pragma_update(None, "foreign_keys", "OFF")?;

        super::migrations::run(&mut connection, Some(&db_path))?;

        // Clean up any orphaned child rows before enabling foreign keys
        // so that foreign key integrity checks pass cleanly.
        let _ = connection.execute_batch(
            "DELETE FROM save_operation_locations WHERE location_id NOT IN (SELECT id FROM game_save_locations) OR operation_id NOT IN (SELECT id FROM save_operations);
             DELETE FROM collection_games WHERE game_id NOT IN (SELECT id FROM games) OR collection_id NOT IN (SELECT id FROM collections);
             DELETE FROM game_tags WHERE game_id NOT IN (SELECT id FROM games) OR tag_id NOT IN (SELECT id FROM tags);
             DELETE FROM artwork_cache WHERE game_id NOT IN (SELECT id FROM games);
             DELETE FROM playtime_sessions WHERE COALESCE(duration_seconds, 0) <= 0;",
        );

        if let Ok(mut fk_stmt) = connection.prepare("PRAGMA foreign_key_check") {
            let violations: usize = fk_stmt
                .query_map([], |_row| Ok(()))
                .map(|rows| rows.count())
                .unwrap_or(0);
            if violations > 0 {
                log::warn!("Detected {} SQLite foreign key violation(s) after migration", violations);
            }
        }

        connection.pragma_update(None, "foreign_keys", "ON")?;
        let _ = connection.pragma_update(None, "mmap_size", "67108864");

        // Ensure composite indexes exist on hot-path columns for fast low-end PC filtering & sorting
        let _ = connection.execute_batch(
            "CREATE INDEX IF NOT EXISTS idx_games_library_filter ON games(is_wishlist, is_memory, is_installed);
             CREATE INDEX IF NOT EXISTS idx_games_sort_order ON games(sort_order, name);
             CREATE INDEX IF NOT EXISTS idx_playtime_sessions_profile_started ON playtime_sessions(profile_id, started_at);
             CREATE INDEX IF NOT EXISTS idx_metadata_cache_cat_updated ON metadata_cache(category, updated_at);",
        );

        Ok(Self {
            connection: Mutex::new(connection),
        })
    }
}

fn resolve_db_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("nexus.db")
}
