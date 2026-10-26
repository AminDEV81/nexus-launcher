mod amazon;
mod cracked;
mod epic;
mod registry_stores;
mod steam;
mod xbox;

use crate::db::Database;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::{AppHandle, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScannedGame {
    pub name: String,
    pub source: String,
    pub executable_path: Option<String>,
    pub install_path: Option<String>,
    pub install_size_bytes: Option<i64>,
    pub steam_app_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct StoreScanSummary {
    pub source: String,
    pub found: usize,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub games: Vec<ScannedGame>,
    pub summaries: Vec<StoreScanSummary>,
}

fn normalize_path_key(raw: &str) -> String {
    raw.trim()
        .to_lowercase()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_string()
}

/// Runs every official store scanner PLUS the Cracked / Repack / Standalone scanner
/// and returns the combined, de-duplicated list for the user to review.
#[tauri::command]
pub fn scan_all_stores(db: State<'_, Database>) -> AppResult<ScanResult> {
    let scans: [(&str, Vec<ScannedGame>); 9] = [
        ("steam", steam::scan_steam()),
        ("epic", epic::scan_epic()),
        ("gog", registry_stores::scan_gog()),
        ("ea", registry_stores::scan_ea()),
        ("ubisoft", registry_stores::scan_ubisoft()),
        ("battlenet", registry_stores::scan_battlenet()),
        ("amazon", amazon::scan_amazon()),
        ("xbox", xbox::scan_xbox()),
        ("cracked", cracked::scan_cracked_and_standalone()),
    ];

    let summaries = scans
        .iter()
        .map(|(source, games)| StoreScanSummary {
            source: (*source).into(),
            found: games.len(),
        })
        .collect();

    let mut games: Vec<ScannedGame> = Vec::new();
    let mut seen_install_paths: HashSet<String> = HashSet::new();
    let mut seen_exe_paths: HashSet<String> = HashSet::new();

    for (_, store_games) in scans {
        for game in store_games {
            if let Some(ref ip) = game.install_path {
                let key = normalize_path_key(ip);
                if !key.is_empty() && !seen_install_paths.insert(key) {
                    continue;
                }
            }
            if let Some(ref ep) = game.executable_path {
                let key = normalize_path_key(ep);
                if !key.is_empty() && !seen_exe_paths.insert(key) {
                    continue;
                }
            }
            games.push(game);
        }
    }

    // Drop anything that's already in the library so re-running the scan
    // doesn't keep re-surfacing games the user already added.
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    games.retain(|game| {
        let already_exists: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM games
                    WHERE (steam_app_id IS NOT NULL AND steam_app_id = ?1)
                       OR (executable_path IS NOT NULL AND LOWER(REPLACE(executable_path, '/', '\\')) = LOWER(REPLACE(?2, '/', '\\')))
                       OR (install_path IS NOT NULL AND LOWER(REPLACE(install_path, '/', '\\')) = LOWER(REPLACE(?3, '/', '\\')))
                )",
                rusqlite::params![
                    &game.steam_app_id,
                    &game.executable_path,
                    &game.install_path
                ],
                |row| row.get(0),
            )
            .unwrap_or(false);
        !already_exists
    });

    Ok(ScanResult { games, summaries })
}

#[tauri::command]
pub fn import_scanned_games(
    app: AppHandle,
    db: State<'_, Database>,
    games: Vec<ScannedGame>,
) -> AppResult<usize> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let mut imported = 0;
    let mut imported_games: Vec<(String, String)> = Vec::new();

    for game in games {
        if game.name.trim().is_empty() {
            continue;
        }

        let already_exists: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM games
                    WHERE (steam_app_id IS NOT NULL AND steam_app_id = ?1)
                       OR (executable_path IS NOT NULL AND LOWER(REPLACE(executable_path, '/', '\\')) = LOWER(REPLACE(?2, '/', '\\')))
                       OR (install_path IS NOT NULL AND LOWER(REPLACE(install_path, '/', '\\')) = LOWER(REPLACE(?3, '/', '\\')))
                )",
                rusqlite::params![
                    &game.steam_app_id,
                    &game.executable_path,
                    &game.install_path
                ],
                |row| row.get(0),
            )
            .unwrap_or(false);
        if already_exists {
            continue;
        }

        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO games (id, name, executable_path, install_path, install_size_bytes, source, steam_app_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                &id,
                &game.name,
                &game.executable_path,
                &game.install_path,
                &game.install_size_bytes,
                &game.source,
                &game.steam_app_id,
            ],
        )?;
        let _ = crate::commands::save_manager::auto_configure_game_save(&conn, &id);
        imported += 1;
        imported_games.push((id, game.name));
    }

    crate::commands::metadata::spawn_auto_fetch_queue(app, imported_games);

    Ok(imported)
}
