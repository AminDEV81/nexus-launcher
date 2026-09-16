use crate::db::Database;
use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager, State};

/// Local backup: every user-data table serialized to a single JSON file.
///
/// The crash lesson from the removed Epic 15 feature was that an import
/// could leave the app permanently un-openable. This version is built
/// so that can't happen again:
///
/// - Imports run only from this explicit command — never from startup —
///   so a bad backup can't affect `Database::init` in any way.
/// - The file is fully parsed and shape-validated BEFORE the real
///   database is touched at all; a malformed backup errors out with a
///   descriptive message and changes nothing.
/// - The apply phase is one transaction: either everything is replaced
///   or nothing is.
/// - Table names come from this static list, never from the file, so
///   the payload can't redirect writes at other tables.
///
/// Column sets are read dynamically (`SELECT *`) instead of a hardcoded
/// list, so future migrations add columns to backups automatically and
/// old backups still import (missing columns fall back to defaults).
const BACKUP_VERSION: i64 = 1;

/// Order matters twice: it's the export key order AND the import insert
/// order — parents (`games`, `collections`, `tags`) before their FK
/// children, with `settings` last.
const TABLES: &[&str] = &[
    "games",
    "collections",
    "tags",
    "profiles",
    "collection_games",
    "game_tags",
    "playtime_sessions",
    "artwork_cache",
    "downloads",
    "game_save_locations",
    "profile_game_saves",
    "save_operations",
    "save_operation_locations",
    "settings",
];

#[derive(Serialize)]
pub struct ImportSummary {
    pub games: usize,
    pub collections: usize,
    pub tags: usize,
    pub playtime_sessions: usize,
}

fn read_table(conn: &rusqlite::Connection, table: &str) -> AppResult<Vec<Map<String, Value>>> {
    let mut stmt = conn
        .prepare(&format!("SELECT * FROM {table}"))
        .map_err(AppError::Database)?;
    let column_names: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|name| name.to_string())
        .collect();

    let rows = stmt
        .query_map([], |row| {
            let mut map = Map::new();
            for (index, name) in column_names.iter().enumerate() {
                let value = match row.get_ref(index)? {
                    rusqlite::types::ValueRef::Null => Value::Null,
                    rusqlite::types::ValueRef::Integer(n) => Value::Number(n.into()),
                    rusqlite::types::ValueRef::Real(f) => {
                        serde_json::Number::from_f64(f).map_or(Value::Null, Value::Number)
                    }
                    rusqlite::types::ValueRef::Text(t) => {
                        Value::String(String::from_utf8_lossy(t).into_owned())
                    }
                    // No BLOB columns exist in the backed-up tables.
                    rusqlite::types::ValueRef::Blob(_) => Value::Null,
                };
                map.insert(name.clone(), value);
            }
            Ok(map)
        })
        .map_err(AppError::Database)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(AppError::Database)?;

    Ok(rows)
}

/// json -> rusqlite value. Booleans don't exist in SQLite; our schema
/// stores them as 0/1 integers and serde_json round-trips that fine.
fn json_to_sql(value: &Value) -> AppResult<rusqlite::types::Value> {
    use rusqlite::types::Value as Sql;
    Ok(match value {
        Value::Null => Sql::Null,
        Value::Bool(b) => Sql::Integer(i64::from(*b)),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Sql::Integer(i)
            } else {
                Sql::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        Value::String(s) => Sql::Text(s.clone()),
        other => {
            return Err(AppError::Invalid(format!(
                "unsupported backup value: {other}"
            )))
        }
    })
}

#[tauri::command]
pub fn export_backup(db: State<'_, Database>, file_path: String) -> AppResult<usize> {
    let path = file_path.trim();
    if path.is_empty() {
        return Err(AppError::Invalid(
            "choose a file to export to first.".into(),
        ));
    }

    let conn = db.connection.lock().expect("db mutex poisoned");
    let mut backup = Map::new();
    backup.insert("version".into(), Value::Number(BACKUP_VERSION.into()));
    let mut total_rows = 0usize;
    for table in TABLES {
        let rows = read_table(&conn, table)?;
        total_rows += rows.len();
        backup.insert(
            (*table).into(),
            Value::Array(rows.into_iter().map(Value::Object).collect()),
        );
    }

    let json = serde_json::to_string(&Value::Object(backup))
        .map_err(|err| AppError::Other(format!("could not serialize backup: {err}")))?;
    // Write-then-rename so a crash mid-write can't leave a truncated
    // file behind at the chosen path.
    let temp_path = format!("{path}.tmp");
    std::fs::write(&temp_path, json)?;
    std::fs::rename(&temp_path, path)?;

    Ok(total_rows)
}

/// Parses + validates the file WITHOUT touching the database, returning
/// the per-table rows on success. Everything after this point can
/// assume well-shaped data.
/// One table's rows from a backup file, in import order.
type BackupTable = (&'static str, Vec<Map<String, Value>>);

fn load_and_validate(path: &str) -> AppResult<Vec<BackupTable>> {
    let raw = std::fs::read_to_string(path)
        .map_err(|err| AppError::Invalid(format!("could not read that file: {err}")))?;

    let parsed: Value = serde_json::from_str(&raw)
        .map_err(|err| AppError::Invalid(format!("not a valid backup file: {err}")))?;
    let Value::Object(root) = parsed else {
        return Err(AppError::Invalid("not a valid backup file.".into()));
    };

    let version = root
        .get("version")
        .and_then(Value::as_i64)
        .ok_or_else(|| AppError::Invalid("backup file has no version.".into()))?;
    if version != BACKUP_VERSION {
        return Err(AppError::Invalid(format!(
            "backup version {version} isn't supported by this app (expected {BACKUP_VERSION})."
        )));
    }

    let mut tables = Vec::new();
    for table in TABLES {
        let entries = match root.get(*table) {
            Some(e) => e,
            None => {
                // Older backups might omit newer tables like downloads or profiles
                tables.push((*table, Vec::new()));
                continue;
            }
        };
        let Value::Array(rows) = entries else {
            return Err(AppError::Invalid(format!(
                "backup section '{table}' is malformed."
            )));
        };

        let mut parsed_rows = Vec::with_capacity(rows.len());
        for row in rows {
            let Value::Object(map) = row else {
                return Err(AppError::Invalid(format!(
                    "backup section '{table}' contains a malformed row."
                )));
            };
            parsed_rows.push(map.clone());
        }
        tables.push((*table, parsed_rows));
    }

    // Minimal semantic check on the one table everything else hangs off.
    let game_rows = tables
        .iter()
        .find(|(table, _)| *table == "games")
        .map(|(_, rows)| rows)
        .expect("games validated above");
    for game in game_rows {
        let has_identity = game.get("id").is_some_and(Value::is_string)
            && game.get("name").is_some_and(Value::is_string);
        if !has_identity {
            return Err(AppError::Invalid(
                "backup contains a game row without an id or name.".into(),
            ));
        }
    }

    Ok(tables)
}

#[tauri::command]
pub fn import_backup(
    app: AppHandle,
    db: State<'_, Database>,
    file_path: String,
) -> AppResult<ImportSummary> {
    let path = file_path.trim();
    if path.is_empty() {
        return Err(AppError::Invalid("choose a backup file first.".into()));
    }

    // Phase 1: everything that can fail without side effects.
    let tables = load_and_validate(path)?;
    let count = |table: &str| {
        tables
            .iter()
            .find(|(name, _)| *name == table)
            .map_or(0, |(_, rows)| rows.len())
    };
    let summary = ImportSummary {
        games: count("games"),
        collections: count("collections"),
        tags: count("tags"),
        playtime_sessions: count("playtime_sessions"),
    };

    // Phase 2: replace everything in a single transaction.
    {
        let mut conn = db.connection.lock().expect("db mutex poisoned");
        let tx = conn.transaction()?;

        // Delete in reverse order so FK children are deleted before parents
        for (table, _) in tables.iter().rev() {
            tx.execute(&format!("DELETE FROM {table}"), [])?;
        }

        // Insert in forward order so FK parents are populated before children
        for (table, rows) in &tables {
            if rows.is_empty() {
                continue;
            }

            // Verify column names against table schema to eliminate any SQL injection risk
            let mut info_stmt = tx.prepare(&format!("PRAGMA table_info({table})"))?;
            let valid_cols: std::collections::HashSet<String> = info_stmt
                .query_map([], |r| r.get::<_, String>(1))?
                .filter_map(Result::ok)
                .collect();

            let columns: Vec<&str> = rows[0]
                .keys()
                .filter(|k| valid_cols.contains(k.as_str()))
                .map(String::as_str)
                .collect();

            if columns.is_empty() {
                continue;
            }

            let column_list = columns.join(", ");
            let placeholders = vec!["?"; columns.len()].join(", ");
            let insert = format!("INSERT INTO {table} ({column_list}) VALUES ({placeholders})");

            let mut stmt = tx.prepare(&insert)?;
            for row in rows {
                let values: Result<Vec<rusqlite::types::Value>, AppError> = columns
                    .iter()
                    .map(|column| json_to_sql(row.get(*column).unwrap_or(&Value::Null)))
                    .collect();
                let values = values?;
                stmt.execute(rusqlite::params_from_iter(values))?;
            }

            if *table == "profiles" {
                let profile_count: i64 = tx
                    .query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))
                    .unwrap_or(0);
                if profile_count == 0 {
                    let _ = tx.execute(
                        "INSERT INTO profiles (id, name, avatar, color, is_active) VALUES ('default', 'Player 1', 'gamepad', '#7c5cff', 1)",
                        [],
                    );
                }
            }
        }

        // Ensure at least one profile exists if imported backup had no profiles
        let profile_count: i64 = tx
            .query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))
            .unwrap_or(0);
        if profile_count == 0 {
            let _ = tx.execute(
                "INSERT INTO profiles (id, name, avatar, color, is_active) VALUES ('default', 'Player 1', 'gamepad', '#7c5cff', 1)",
                [],
            );
        }

        tx.commit()?;
    } // mutex released before the network phase.

    // Phase 3: artwork files weren't part of the JSON — re-download any
    // missing ones from their recorded source URLs in the background.
    // Custom user-picked artwork has no source URL and is skipped.
    tauri::async_runtime::spawn(reimport_artwork(app.clone()));

    Ok(summary)
}

async fn reimport_artwork(app: AppHandle) {
    let urls: Vec<(String, String)> = {
        let db = app.state::<Database>();
        let Ok(conn) = db.connection.lock() else {
            return;
        };
        let Ok(mut stmt) = conn.prepare(
            "SELECT local_path, source_url FROM artwork_cache WHERE source_url IS NOT NULL",
        ) else {
            return;
        };
        let Ok(rows) = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }) else {
            return;
        };
        rows.filter_map(|row| row.ok())
            .filter(|(local, _)| !std::path::Path::new(local).exists())
            .collect()
    };

    if urls.is_empty() {
        return;
    }
    log::info!("re-importing {} artwork files from source URLs", urls.len());

    let http = app.state::<crate::commands::metadata::HttpClient>();
    for (local_path, url) in urls {
        let parsed = match reqwest::Url::parse(&url) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };
        if !matches!(parsed.scheme(), "http" | "https") {
            continue;
        }
        match http.0.get(&url).send().await {
            Ok(response) if response.status().is_success() => match response.bytes().await {
                Ok(bytes) => {
                    if bytes.len() as u64 <= 25 * 1024 * 1024 {
                        if let Err(err) = std::fs::write(&local_path, &bytes) {
                            log::warn!("could not restore artwork {local_path}: {err}");
                        }
                    }
                }
                Err(err) => log::warn!("artwork download failed: {err}"),
            },
            _ => log::warn!("artwork download failed for {url}"),
        }
        // Sequential on purpose — a restored library can reference a
        // few hundred images and they're not worth a rate-limit hit.
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    let _ = app.emit("backup-artwork-restored", ());
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The validation phase is the crash-lesson safety net — it must
    /// reject garbage *before* anything touches the database.
    #[test]
    fn validation_rejects_malformed_files() {
        let dir = std::env::temp_dir().join("nexus-backup-test");
        std::fs::create_dir_all(&dir).unwrap();

        let bad = dir.join("bad.json");
        std::fs::write(&bad, "{ not json").unwrap();
        assert!(load_and_validate(bad.to_str().unwrap()).is_err());

        let wrong_version = dir.join("version.json");
        std::fs::write(&wrong_version, r#"{"version": 99}"#).unwrap();
        assert!(load_and_validate(wrong_version.to_str().unwrap()).is_err());

        let empty_ok = dir.join("empty-ok.json");
        let mut root = Map::new();
        root.insert("version".into(), Value::Number(1.into()));
        for table in TABLES {
            root.insert((*table).into(), Value::Array(vec![]));
        }
        std::fs::write(&empty_ok, Value::Object(root).to_string()).unwrap();
        let tables = load_and_validate(empty_ok.to_str().unwrap()).unwrap();
        assert_eq!(tables.len(), TABLES.len());

        std::fs::remove_dir_all(&dir).ok();
    }
}
