use crate::db::Database;
use crate::error::AppResult;
use std::collections::HashMap;
use tauri::State;

/// Reads one setting. Returns `None` (not an error) when the key has
/// never been set, so the frontend can fall back to a sensible default
/// (e.g. theme mode "dark") without special-casing a "not found" error.
#[tauri::command]
pub fn get_setting(db: State<'_, Database>, key: String) -> AppResult<Option<String>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let value = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| {
            row.get(0)
        })
        .ok();

    Ok(value)
}

#[tauri::command]
pub fn set_setting(db: State<'_, Database>, key: String, value: String) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        rusqlite::params![&key, &value],
    )?;

    if key == "metadata_provider_mode"
        || key == "nexus_cloud_gateway_url"
        || key == "public_proxy_url"
        || key.starts_with("igdb_")
    {
        let _ = conn.execute("DELETE FROM metadata_cache WHERE category = 'feed'", []);
    }

    Ok(())
}

/// Bulk read, used once at startup so the frontend can hydrate every
/// settings-backed store (theme, grid density, ...) in a single round
/// trip instead of one `get_setting` call per key.
#[tauri::command]
pub fn get_all_settings(db: State<'_, Database>) -> AppResult<HashMap<String, String>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let mut stmt = conn.prepare("SELECT key, value FROM settings")?;
    let map = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<HashMap<_, _>, _>>()?;

    Ok(map)
}
