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
    "soundtrack_providers",
    "soundtrack_albums",
    "soundtrack_tracks",
    "soundtrack_game_links",
    "soundtrack_favorites",
    "soundtrack_play_history",
    "soundtrack_queue",
    "soundtrack_downloads",
    "soundtrack_local_files",
    "metadata_cache",
    "overlay_config",
];

#[derive(Serialize)]
pub struct BackupStats {
    pub games: usize,
    pub collections: usize,
    pub tags: usize,
    pub playtime_sessions: usize,
    pub profiles: usize,
    pub saves: usize,
    pub settings: usize,
    pub downloads: usize,
    pub soundtrack_albums: usize,
    pub soundtrack_tracks: usize,
    pub soundtrack_favorites: usize,
    pub artwork_cache: usize,
    pub metadata_cache: usize,
}

#[derive(Serialize)]
pub struct ImportSummary {
    pub games: usize,
    pub collections: usize,
    pub tags: usize,
    pub playtime_sessions: usize,
}

#[tauri::command]
pub fn get_backup_stats(db: State<'_, Database>) -> AppResult<BackupStats> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let count = |table: &str| -> usize {
        conn.query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get::<_, i64>(0))
            .map(|n| n.max(0) as usize)
            .unwrap_or(0)
    };

    Ok(BackupStats {
        games: count("games"),
        collections: count("collections"),
        tags: count("tags"),
        playtime_sessions: count("playtime_sessions"),
        profiles: count("profiles"),
        saves: count("profile_game_saves") + count("save_operations"),
        settings: count("settings"),
        downloads: count("downloads"),
        soundtrack_albums: count("soundtrack_albums"),
        soundtrack_tracks: count("soundtrack_tracks"),
        soundtrack_favorites: count("soundtrack_favorites"),
        artwork_cache: count("artwork_cache"),
        metadata_cache: count("metadata_cache"),
    })
}

fn read_table(conn: &rusqlite::Connection, table: &str) -> AppResult<Vec<Map<String, Value>>> {
    let mut stmt = match conn.prepare(&format!("SELECT * FROM {table}")) {
        Ok(stmt) => stmt,
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.extended_code == rusqlite::ffi::SQLITE_ERROR =>
        {
            return Ok(Vec::new());
        }
        Err(err) => return Err(AppError::Database(err)),
    };
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
pub fn export_backup(
    db: State<'_, Database>,
    file_path: String,
    tables: Option<Vec<String>>,
) -> AppResult<usize> {
    let path = file_path.trim();
    if path.is_empty() {
        return Err(AppError::Invalid(
            "choose a file to export to first.".into(),
        ));
    }

    let target_tables: Vec<&'static str> = match &tables {
        Some(selected) => {
            let filtered: Vec<&'static str> = TABLES
                .iter()
                .copied()
                .filter(|t| selected.iter().any(|s| s == *t))
                .collect();
            if filtered.is_empty() {
                return Err(AppError::Invalid(
                    "at least one category must be selected for export.".into(),
                ));
            }
            filtered
        }
        None => TABLES.to_vec(),
    };

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let mut backup = Map::new();
    backup.insert("version".into(), Value::Number(BACKUP_VERSION.into()));
    let mut total_rows = 0usize;
    for table in target_tables {
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
/// Validates a game's `executable_path` and `install_path` during backup import:
/// - Allows legitimate game folders under `C:\Program Files (x86)\Steam\steamapps\common\<Game>`,
///   `C:\Program Files\Epic Games\<Game>`, `C:\GOG Games\<Game>`, `D:\Games\<Game>`, etc.
/// - Blocks OS system directories (`C:\Windows`, `System32`, `SysWOW64`), user `AppData` interpreters,
///   and shell/scripting binaries (`cmd.exe`, `powershell.exe`, `pwsh.exe`, `python.exe`, `node.exe`, etc.).
/// - Requires `executable_path` to reside inside a valid game-specific `install_path` directory on disk,
///   falling back to `find_best_exe(install_path, game_name)` if the `.exe` moved or needs re-detection.
fn validate_or_redetect_backup_game_exe(
    exe_str: &str,
    install_str: &str,
    game_name: &str,
) -> Option<String> {
    const BLOCKED_INTERPRETERS: &[&str] = &[
        "cmd",
        "powershell",
        "pwsh",
        "wscript",
        "cscript",
        "mshta",
        "rundll32",
        "regsvr32",
        "certutil",
        "bitsadmin",
        "msiexec",
        "python",
        "pythonw",
        "python3",
        "node",
        "deno",
        "bun",
        "bash",
        "sh",
        "wsl",
        " explorer",
        "explorer",
        "conhost",
        "taskmgr",
        "regedit",
    ];

    let is_safe_game_install_dir = |dir_raw: &str| -> Option<std::path::PathBuf> {
        let trimmed = dir_raw.trim();
        if trimmed.is_empty() {
            return None;
        }
        let p = std::path::Path::new(trimmed);
        if !p.is_absolute()
            || p.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::CurDir
                )
            })
            || !p.is_dir()
        {
            return None;
        }
        let normal_count = p
            .components()
            .filter(|c| matches!(c, std::path::Component::Normal(_)))
            .count();
        // Require at least 2 normal components (e.g. `D:\Games\Hades` or `C:\Program Files\Epic Games\Fortnite`),
        // so bare `C:\`, `C:\Program Files`, `C:\Program Files (x86)`, or `C:\Users` are never accepted.
        if normal_count < 2 {
            return None;
        }
        let norm = trimmed
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase();
        for forbidden_prefix in [
            "c:\\windows",
            "c:\\programdata",
            "/etc",
            "/usr",
            "/bin",
            "/sbin",
            "/lib",
        ] {
            if norm == forbidden_prefix || norm.starts_with(&format!("{forbidden_prefix}\\")) {
                return None;
            }
        }
        if let Some(home) = dirs::home_dir() {
            let home_norm = home
                .to_string_lossy()
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_lowercase();
            let appdata_norm = format!("{home_norm}\\appdata");
            if norm == home_norm
                || norm == appdata_norm
                || norm.starts_with(&format!("{appdata_norm}\\"))
            {
                return None;
            }
        }
        // Reject top-level Program Files / Steam roots unless pointing to a specific game subfolder
        if matches!(
            norm.as_str(),
            "c:\\program files"
                | "c:\\program files (x86)"
                | "c:\\program files (x86)\\steam"
                | "c:\\program files (x86)\\steam\\steamapps"
                | "c:\\program files (x86)\\steam\\steamapps\\common"
                | "c:\\program files\\epic games"
        ) {
            return None;
        }
        Some(p.to_path_buf())
    };

    let install_dir = is_safe_game_install_dir(install_str).or_else(|| {
        let ep = std::path::Path::new(exe_str.trim());
        ep.parent()
            .and_then(|parent| parent.to_str())
            .and_then(is_safe_game_install_dir)
    })?;

    if !exe_str.is_empty() {
        let exe_path = std::path::Path::new(exe_str);
        if exe_path.is_absolute()
            && !exe_path.components().any(|c| {
                matches!(
                    c,
                    std::path::Component::ParentDir | std::path::Component::CurDir
                )
            })
            && exe_path
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe"))
            && exe_path.is_file()
        {
            let stem = exe_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .trim()
                .to_ascii_lowercase();
            if !stem.is_empty() && !BLOCKED_INTERPRETERS.contains(&stem.as_str()) {
                let norm_exe = exe_str
                    .replace('/', "\\")
                    .trim_end_matches('\\')
                    .to_lowercase();
                let norm_inst = install_dir
                    .to_string_lossy()
                    .replace('/', "\\")
                    .trim_end_matches('\\')
                    .to_lowercase();
                if norm_exe.starts_with(&format!("{norm_inst}\\")) {
                    return Some(exe_str.to_string());
                }
            }
        }
    }

    // Fallback: if `install_path` is a valid existing game folder on disk, auto-detect the game `.exe` inside it
    crate::commands::download::find_best_exe(&install_dir, game_name)
}

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
                // Table not present in this backup file (selective backup or older version)
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

    if tables.is_empty() {
        return Err(AppError::Invalid(
            "backup file contains no recognized tables.".into(),
        ));
    }

    // Validate IDs against path traversal and validate save location paths before touching the DB
    for (table, rows) in &mut tables {
        if matches!(
            *table,
            "games" | "profiles" | "collections" | "tags" | "game_save_locations" | "save_operations"
        ) {
            for row in rows.iter() {
                if let Some(id_str) = row.get("id").and_then(Value::as_str) {
                    if !crate::commands::save_manager::fs_ops::is_valid_id_segment(id_str) {
                        return Err(AppError::Invalid(format!(
                            "backup section '{table}' contains an unsafe or malformed id: '{id_str}'"
                        )));
                    }
                }
            }
        }
        if *table == "games" {
            for game in rows.iter_mut() {
                let has_identity = game.get("id").is_some_and(Value::is_string)
                    && game.get("name").is_some_and(Value::is_string);
                if !has_identity {
                    return Err(AppError::Invalid(
                        "backup contains a game row without an id or name.".into(),
                    ));
                }
                // Strip arbitrary shell hooks AND launch_arguments from backup files to prevent RCE on Play
                // (e.g. pointing executable_path to an interpreter with malicious CLI flags).
                game.insert("pre_launch_command".to_string(), Value::Null);
                game.insert("post_launch_command".to_string(), Value::Null);
                game.insert("launch_arguments".to_string(), Value::Null);

                let game_name = game
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let inst_str = game
                    .get("install_path")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let exe_str = game
                    .get("executable_path")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .trim()
                    .to_string();

                let resolved_exe = validate_or_redetect_backup_game_exe(&exe_str, &inst_str, &game_name);
                match resolved_exe {
                    Some(valid_exe) => {
                        game.insert("executable_path".to_string(), Value::String(valid_exe));
                    }
                    None => {
                        game.insert("executable_path".to_string(), Value::Null);
                        if game.get("source").and_then(Value::as_str) != Some("steam") {
                            game.insert("is_installed".to_string(), Value::Number(0.into()));
                        }
                    }
                }
            }
        }
        if *table == "game_save_locations" {
            for loc in rows.iter() {
                if let Some(p) = loc.get("path").and_then(Value::as_str) {
                    if let Err(reason) =
                        crate::commands::save_manager::fs_ops::validate_safe_save_location_path(p)
                    {
                        return Err(AppError::Invalid(format!(
                            "backup contains an unsafe save location path '{p}': {reason}"
                        )));
                    }
                }
            }
        }
        if *table == "downloads" {
            for dl in rows.iter_mut() {
                if let Some(url) = dl.get("url").and_then(Value::as_str) {
                    if let Err(err) = crate::commands::download::validate_download_url(url) {
                        return Err(AppError::Invalid(format!(
                            "backup contains an unsafe download URL '{url}': {err}"
                        )));
                    }
                }
                let sp = dl.get("save_path").and_then(Value::as_str).unwrap_or("");
                if !sp.is_empty() && !crate::commands::download::is_safe_download_save_path(sp) {
                    return Err(AppError::Invalid(format!(
                        "backup contains an unsafe download save_path '{sp}'"
                    )));
                }
                let fp = dl.get("file_path").and_then(Value::as_str).unwrap_or("");
                if !fp.is_empty() && !crate::commands::download::is_safe_download_file_path(fp, sp) {
                    dl.insert("file_path".to_string(), Value::Null);
                }
            }
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
        let mut conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
    if tables.iter().any(|(t, _)| *t == "artwork_cache") {
        tauri::async_runtime::spawn(reimport_artwork(app.clone()));
    }

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

    let Ok(app_dir) = crate::paths::app_data_dir(&app) else {
        return;
    };
    let allowed_artwork_root = app_dir.join("artwork");
    let http = app.state::<crate::commands::metadata::HttpClient>();
    for (local_path, url) in urls {
        let parsed = match reqwest::Url::parse(&url) {
            Ok(parsed) => parsed,
            Err(_) => continue,
        };
        if !matches!(parsed.scheme(), "http" | "https") {
            continue;
        }
        let Some(host) = parsed.host_str() else {
            continue;
        };
        if crate::commands::profiles::is_blocked_host_or_ip(host) {
            log::warn!("blocked SSRF attempt in backup artwork restore: {url}");
            continue;
        }

        // Prevent arbitrary file write / path traversal from crafted backup JSON
        let target_path = std::path::Path::new(&local_path);
        if target_path
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
            || !target_path.starts_with(&allowed_artwork_root)
        {
            log::warn!("blocked out-of-bounds artwork restore path: {local_path}");
            continue;
        }
        let valid_ext = target_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|ext| {
                matches!(
                    ext.to_ascii_lowercase().as_str(),
                    "jpg" | "jpeg" | "png" | "webp" | "gif" | "ico" | "bmp" | "avif"
                )
            })
            .unwrap_or(false);
        if !valid_ext {
            log::warn!("blocked non-image extension in artwork restore: {local_path}");
            continue;
        }
        if let Some(parent) = target_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }

        match http.0.get(&url).send().await {
            Ok(response) if response.status().is_success() => match response.bytes().await {
                Ok(bytes) => {
                    if bytes.len() as u64 <= 25 * 1024 * 1024 {
                        if let Err(err) = std::fs::write(target_path, &bytes) {
                            log::warn!("could not restore artwork {local_path}: {err}");
                        }
                    }
                }
                Err(err) => log::warn!("artwork download failed: {err}"),
            },
            _ => log::warn!("artwork download failed for {url}"),
        }
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

    #[test]
    fn validation_accepts_selective_backup() {
        let dir = std::env::temp_dir().join("nexus-backup-test-selective");
        std::fs::create_dir_all(&dir).unwrap();

        let selective = dir.join("selective.json");
        let mut root = Map::new();
        root.insert("version".into(), Value::Number(1.into()));
        root.insert("settings".into(), Value::Array(vec![]));
        std::fs::write(&selective, Value::Object(root).to_string()).unwrap();

        let tables = load_and_validate(selective.to_str().unwrap()).unwrap();
        assert_eq!(tables.len(), 1);
        assert_eq!(tables[0].0, "settings");

        std::fs::remove_dir_all(&dir).ok();
    }
}
