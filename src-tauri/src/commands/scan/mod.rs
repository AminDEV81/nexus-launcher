mod amazon;
mod epic;
mod registry_stores;
mod steam;
mod xbox;

use crate::db::Database;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use uuid::Uuid;

/// A single game found by a store scanner, before the user has reviewed
/// or imported it. Deliberately similar to `commands::games::CreateGameInput`
/// but kept as its own type: this carries `source` and `steam_app_id`
/// (which manual add never sets) and everything is scanner-guessed, so
/// none of it should be mistaken for confirmed, user-provided data.
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

/// Runs every store scanner and returns the combined, de-duplicated
/// list for the user to review before anything is added — automatic
/// scan only ever *finds* games here; `import_scanned_games` is the
/// separate, explicit step that actually writes them to the library.
///
/// Each scanner degrades to an empty result if its store isn't
/// installed or its expected files/registry keys aren't present, so one
/// missing launcher never fails the whole scan.
#[tauri::command]
pub fn scan_all_stores(db: State<'_, Database>) -> AppResult<ScanResult> {
    let scans: [(&str, Vec<ScannedGame>); 8] = [
        ("steam", steam::scan_steam()),
        ("epic", epic::scan_epic()),
        ("gog", registry_stores::scan_gog()),
        ("ea", registry_stores::scan_ea()),
        ("ubisoft", registry_stores::scan_ubisoft()),
        ("battlenet", registry_stores::scan_battlenet()),
        ("amazon", amazon::scan_amazon()),
        ("xbox", xbox::scan_xbox()),
    ];

    let summaries = scans
        .iter()
        .map(|(source, games)| StoreScanSummary {
            source: (*source).into(),
            found: games.len(),
        })
        .collect();

    let mut games: Vec<ScannedGame> = scans.into_iter().flat_map(|(_, games)| games).collect();

    // Drop anything that's already in the library so re-running the scan
    // doesn't keep re-surfacing games the user already added (or already
    // dismissed on a previous scan).
    let conn = db.connection.lock().expect("db mutex poisoned");
    games.retain(|game| {
        let already_exists: bool = conn
            .query_row(
                "SELECT EXISTS(
                    SELECT 1 FROM games
                    WHERE (steam_app_id IS NOT NULL AND steam_app_id = ?1)
                       OR (executable_path IS NOT NULL AND executable_path = ?2)
                       OR (install_path IS NOT NULL AND install_path = ?3)
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

/// Writes the subset of scanned games the user chose to keep. Runs the
/// same de-duplication check as `scan_all_stores` (rather than trusting
/// the frontend's snapshot) since time may have passed between the scan
/// and the user clicking "Import" — e.g. they could have manually added
/// one of the same games in between via Epic 4's Add Game modal.
#[tauri::command]
pub fn import_scanned_games(
    app: AppHandle,
    db: State<'_, Database>,
    games: Vec<ScannedGame>,
) -> AppResult<usize> {
    let conn = db.connection.lock().expect("db mutex poisoned");
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
                       OR (executable_path IS NOT NULL AND executable_path = ?2)
                       OR (install_path IS NOT NULL AND install_path = ?3)
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
