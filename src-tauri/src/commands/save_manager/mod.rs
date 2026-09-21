pub mod detector;
pub mod error;
pub mod fs_ops;
pub mod journal;
pub mod locks;
pub mod recovery;
pub mod session;
pub mod snapshots;
pub mod manifest;
pub mod transaction;

use crate::commands::save_manager::detector::{DetectedSaveLocation, SaveDetector};
use crate::commands::save_manager::error::SaveManagerError;
use crate::commands::save_manager::fs_ops::{expand_save_path, scan_path_file_stats};
use crate::commands::save_manager::journal::SaveOperation;
use crate::commands::save_manager::locks::SaveManagerLocks;
use crate::commands::save_manager::snapshots::{SaveSnapshot, SnapshotEngine};
use crate::commands::save_manager::transaction::TransactionCoordinator;
use crate::commands::save_manager::session::SessionManager;
use crate::db::Database;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::State;


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSaveLocationDto {
    pub id: String,
    pub game_id: String,
    pub path: String,
    pub resolved_path: String,
    pub location_type: String,
    pub detection_source: String,
    pub confidence: i64,
    pub is_enabled: bool,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameSaveDetails {
    pub game_id: String,
    pub profile_id: String,
    pub is_managed: bool,
    pub locations: Vec<GameSaveLocationDto>,
    pub file_count: i64,
    pub save_size_bytes: i64,
    pub content_hash: Option<String>,
    pub last_synced_at: Option<String>,
    pub state: String,
}

fn get_active_profile_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'active_profile_id'",
        [],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "default".to_string())
}

pub fn get_game_locations_dto_internal(
    conn: &Connection,
    game_id: &str,
) -> Result<Vec<GameSaveLocationDto>, rusqlite::Error> {
    let mut stmt = conn.prepare(
        "SELECT id, game_id, path, location_type, detection_source, confidence, is_enabled
         FROM game_save_locations WHERE game_id = ?1",
    )?;

    let loc_rows = stmt.query_map(params![game_id], |row| {
        let id: String = row.get(0)?;
        let gid: String = row.get(1)?;
        let raw_path: String = row.get(2)?;
        let location_type: String = row.get(3)?;
        let detection_source: String = row.get(4)?;
        let confidence: i64 = row.get(5)?;
        let is_enabled: bool = row.get(6)?;

        let resolved = expand_save_path(&raw_path);
        let exists = resolved.exists();

        Ok(GameSaveLocationDto {
            id,
            game_id: gid,
            path: raw_path,
            resolved_path: resolved.to_string_lossy().to_string(),
            location_type,
            detection_source,
            confidence,
            is_enabled,
            exists,
        })
    })?;

    let mut locations = Vec::new();
    for l in loc_rows {
        locations.push(l?);
    }
    Ok(locations)
}

fn normalize_path_for_compare(p: &std::path::Path) -> String {
    p.to_string_lossy()
        .trim()
        .trim_end_matches(['/', '\\'])
        .replace('/', "\\")
        .to_lowercase()
}

/// Automatically detects save locations using the 19,250+ PC game manifest database and heuristics,
/// and registers the valid save path in `game_save_locations`.
pub fn auto_configure_game_save_with_options(
    conn: &Connection,
    game_id: &str,
    force: bool,
) -> Result<Vec<GameSaveLocationDto>, SaveManagerError> {
    let game_info: Option<(String, Option<u32>, Option<String>)> = conn
        .query_row(
            "SELECT name, steam_app_id, executable_path FROM games WHERE id = ?1",
            params![game_id],
            |row| {
                let s_id: Option<String> = row.get(1)?;
                let s_num = s_id.and_then(|s| s.parse::<u32>().ok());
                Ok((row.get(0)?, s_num, row.get(2)?))
            },
        )
        .ok();

    let (name, steam_app_id, exe_path_str) = match game_info {
        Some(info) => info,
        None => return Ok(Vec::new()),
    };

    let exe_path = exe_path_str.as_deref().map(std::path::Path::new);
    let candidates = SaveDetector::detect_save_locations(&name, steam_app_id, exe_path);

    let existing = get_game_locations_dto_internal(conn, game_id)
        .map_err(|e| SaveManagerError::DatabaseError(e.to_string()))?;

    // Check if we already have an enabled save location that either:
    // 1. Has real save files on disk, OR
    // 2. Has recorded profile saves (meaning it was already configured and saves exist in profile backups), OR
    // 3. Exists on disk and is not a config folder
    let has_valid_enabled_save = existing.iter().any(|l| {
        if !l.is_enabled || l.location_type != "save" {
            return false;
        }
        let p = expand_save_path(&l.path);
        let p_str = p.to_string_lossy().to_lowercase();
        if p_str.contains("\\config\\") || p_str.ends_with("\\config") {
            return false;
        }
        if SaveDetector::is_actual_save_dir(&p) {
            return true;
        }
        let has_recorded_saves: bool = conn
            .query_row(
                "SELECT COUNT(*) > 0 FROM profile_game_saves WHERE game_id = ?1 AND file_count > 0",
                params![game_id],
                |row| row.get(0),
            )
            .unwrap_or(false);

        if has_recorded_saves {
            return true;
        }

        p.exists()
    });

    if !force && has_valid_enabled_save {
        // Clean up any stale disabled heuristic entries or duplicate rows even when not forcing
        if let Some(enabled_loc) = existing.iter().find(|l| l.is_enabled && l.location_type == "save") {
            let enabled_norm = normalize_path_for_compare(&expand_save_path(&enabled_loc.path));
            let _ = conn.execute(
                "DELETE FROM game_save_locations WHERE game_id = ?1 AND id != ?2 AND detection_source = 'heuristic'",
                params![game_id, enabled_loc.id],
            );
            for l in &existing {
                if l.id != enabled_loc.id {
                    let l_norm = normalize_path_for_compare(&expand_save_path(&l.path));
                    if l_norm == enabled_norm || (l_norm.starts_with(&format!("{enabled_norm}\\")) && !crate::commands::save_manager::detector::SaveDetector::is_generic_root_path(&enabled_norm)) {
                        let _ = conn.execute("DELETE FROM game_save_locations WHERE id = ?1", params![l.id]);
                    }
                }
            }
        }
        return Ok(existing);
    }

    if candidates.is_empty() {
        if force {
            return Err(SaveManagerError::SavePathNotFound(
                "No save locations found in database for this game. You can add a custom path manually.".into(),
            ));
        }
        return Ok(existing);
    }

    // Filter out config candidates if any non-config candidate exists
    let non_config_candidates: Vec<_> = candidates
        .iter()
        .filter(|c| {
            c.location_type == "save"
                && !c.path.to_lowercase().contains("config")
                && !c.path.to_lowercase().ends_with(".ini")
        })
        .cloned()
        .collect();

    let candidate_pool = if !non_config_candidates.is_empty() {
        &non_config_candidates
    } else {
        &candidates
    };

    // Select the SINGLE best candidate:
    // 1. First choice: Candidate that exists on disk AND has actual save files
    // 2. Second choice: Candidate that exists on disk (folder or save path)
    // 3. Third choice: Highest confidence theoretical candidate (non-config preferred)
    let best_candidate = candidate_pool
        .iter()
        .find(|c| {
            let p = expand_save_path(&c.path);
            c.exists && SaveDetector::is_actual_save_dir(&p)
        })
        .or_else(|| {
            candidate_pool.iter().find(|c| {
                c.exists && !c.path.to_lowercase().contains("config")
            })
        })
        .or_else(|| candidate_pool.iter().find(|c| c.exists))
        .or_else(|| {
            candidate_pool
                .iter()
                .find(|c| c.confidence >= 80 && !c.path.to_lowercase().contains("config"))
        })
        .or_else(|| candidate_pool.iter().find(|c| c.confidence >= 75))
        .cloned();

    let cand = match best_candidate {
        Some(c) => c,
        None => {
            if force {
                return Err(SaveManagerError::SavePathNotFound(
                    "No valid save locations found in database for this game. You can add a custom path manually.".into(),
                ));
            }
            return Ok(existing);
        }
    };

    let cand_resolved = expand_save_path(&cand.path);
    let cand_exists = cand_resolved.exists();
    let cand_norm = normalize_path_for_compare(&cand_resolved);

    let already_registered = existing.iter().find(|l| {
        l.path.trim().eq_ignore_ascii_case(cand.path.trim())
            || normalize_path_for_compare(&expand_save_path(&l.path)) == cand_norm
    });

    let chosen_loc_id = match already_registered {
        Some(loc) => {
            // Already registered: update in place to ensure enabled and up-to-date
            let _ = conn.execute(
                "UPDATE game_save_locations SET is_enabled = 1, path = ?1, location_type = ?2, confidence = ?3 WHERE id = ?4",
                params![cand.path, cand.location_type, cand.confidence, loc.id],
            );
            loc.id.clone()
        }
        None => {
            // Check if there is an existing row for this game with the same normalized path before creating a new UUID
            let existing_db_id: Option<String> = existing
                .iter()
                .find(|l| normalize_path_for_compare(&expand_save_path(&l.path)) == cand_norm)
                .map(|l| l.id.clone());

            let loc_id = existing_db_id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let is_enabled = cand_exists || cand.confidence >= 85;

            conn.execute(
                "INSERT INTO game_save_locations (id, game_id, path, location_type, detection_source, confidence, is_enabled)
                 VALUES (?1, ?2, ?3, ?4, 'heuristic', ?5, ?6)
                 ON CONFLICT(id) DO UPDATE SET is_enabled = ?6, confidence = ?5, path = ?3, location_type = ?4",
                params![loc_id, game_id, cand.path, cand.location_type, cand.confidence, is_enabled],
            )
            .map_err(|e| SaveManagerError::DatabaseError(e.to_string()))?;

            loc_id
        }
    };

    // CRITICAL FIX: Clean up older heuristic paths and duplicates!
    // When a verified save location is applied from the database, older heuristic guesses
    // must be DELETED, NOT just disabled with is_enabled = 0.
    // This prevents duplicate and disabled entries from lingering in the UI and database.
    let _ = conn.execute(
        "DELETE FROM game_save_locations WHERE game_id = ?1 AND id != ?2 AND detection_source = 'heuristic'",
        params![game_id, chosen_loc_id],
    );

    // Also delete any other locations (including manual ones) that point to the exact same normalized path or redundant child subpath
    for l in &existing {
        if l.id != chosen_loc_id {
            let l_norm = normalize_path_for_compare(&expand_save_path(&l.path));
            if l_norm == cand_norm || (l_norm.starts_with(&format!("{cand_norm}\\")) && !crate::commands::save_manager::detector::SaveDetector::is_generic_root_path(&cand_norm)) {
                let _ = conn.execute("DELETE FROM game_save_locations WHERE id = ?1", params![l.id]);
            }
        }
    }

    let prof_id = get_active_profile_id(conn);
    compute_live_game_save_stats(conn, game_id, &prof_id);

    get_game_locations_dto_internal(conn, game_id)
        .map_err(|e| SaveManagerError::DatabaseError(e.to_string()))
}

pub fn auto_configure_game_save(
    conn: &Connection,
    game_id: &str,
) -> Result<Vec<GameSaveLocationDto>, SaveManagerError> {
    auto_configure_game_save_with_options(conn, game_id, false)
}

/// Scans the physical save locations on disk (or profile storage if inactive) and updates `profile_game_saves`.
pub fn compute_live_game_save_stats(
    conn: &Connection,
    game_id: &str,
    profile_id: &str,
) -> (i64, i64, String) {
    let locations = get_game_locations_dto_internal(conn, game_id).unwrap_or_default();
    let enabled_save_locs: Vec<_> = locations
        .into_iter()
        .filter(|l| l.is_enabled && l.location_type == "save")
        .collect();

    let active_profile_id = get_active_profile_id(conn);
    let is_active = active_profile_id == profile_id;

    let mut seen_files = HashSet::new();
    let mut total_files = 0i64;
    let mut total_bytes = 0i64;

    for loc in &enabled_save_locs {
        if is_active {
            let os_path = expand_save_path(&loc.path);
            let (fc, sz) = if os_path.exists() {
                scan_path_file_stats(&os_path, &mut seen_files)
            } else {
                (0, 0)
            };

            if fc > 0 {
                total_files += fc;
                total_bytes += sz;
            } else {
                let prof_cur = TransactionCoordinator::get_profile_current_path(profile_id, game_id, &loc.id);
                if prof_cur.exists() {
                    let (pfc, psz) = scan_path_file_stats(&prof_cur, &mut seen_files);
                    total_files += pfc;
                    total_bytes += psz;
                }
            }
        } else {
            let prof_cur = TransactionCoordinator::get_profile_current_path(profile_id, game_id, &loc.id);
            if prof_cur.exists() {
                let (fc, sz) = scan_path_file_stats(&prof_cur, &mut seen_files);
                total_files += fc;
                total_bytes += sz;
            }
        }
    }

    let is_managed = !enabled_save_locs.is_empty();
    let default_state = if total_files > 0 {
        "ready"
    } else if is_managed {
        "empty"
    } else {
        "unknown"
    };

    let primary_path = if let Some(first) = enabled_save_locs.first() {
        TransactionCoordinator::get_profile_current_path(profile_id, game_id, &first.id)
            .to_string_lossy()
            .to_string()
    } else {
        String::new()
    };

    if !primary_path.is_empty() {
        let _ = conn.execute(
            "INSERT INTO profile_game_saves (profile_id, game_id, current_path, file_count, save_size_bytes, state)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(profile_id, game_id) DO UPDATE SET
             current_path = ?3,
             file_count = ?4,
             save_size_bytes = ?5,
             state = CASE
                 WHEN profile_game_saves.state IN ('unknown', 'empty') AND ?4 > 0 THEN 'ready'
                 WHEN profile_game_saves.state = 'ready' AND ?4 = 0 THEN 'empty'
                 ELSE profile_game_saves.state
             END",
            params![
                profile_id,
                game_id,
                primary_path,
                total_files,
                total_bytes,
                default_state
            ],
        );
    } else {
        let _ = conn.execute(
            "UPDATE profile_game_saves SET file_count = 0, save_size_bytes = 0, state = 'empty'
             WHERE profile_id = ?1 AND game_id = ?2",
            params![profile_id, game_id],
        );
    }

    (total_files, total_bytes, default_state.to_string())
}

/// Refreshes save statistics for all profiles across all games with configured save locations.
/// Throttled: this walks every profile's entire save tree on disk, so running it on
/// every `list_profiles` call (startup, after each switch/create/delete) blocks the
/// DB mutex for seconds with large libraries. 30s is plenty fresh for UI counters.
pub fn refresh_all_profiles_save_stats(conn: &Connection) {
    use std::sync::atomic::{AtomicU64, Ordering};
    static LAST_RUN_MS: AtomicU64 = AtomicU64::new(0);
    // ponytail: 30s throttle instead of change-detection — good enough for save-size counters
    const THROTTLE_MS: u64 = 30_000;

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let last = LAST_RUN_MS.load(Ordering::Relaxed);
    if now_ms.saturating_sub(last) < THROTTLE_MS {
        return;
    }
    LAST_RUN_MS.store(now_ms, Ordering::Relaxed);

    let profiles: Vec<String> = match conn.prepare("SELECT id FROM profiles") {
        Ok(mut stmt) => stmt
            .query_map([], |r| r.get(0))
            .ok()
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default(),
        Err(_) => return,
    };

    let games: Vec<String> = match conn.prepare(
        "SELECT DISTINCT game_id FROM game_save_locations WHERE is_enabled = 1 AND location_type = 'save'"
    ) {
        Ok(mut stmt) => stmt
            .query_map([], |r| r.get(0))
            .ok()
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default(),
        Err(_) => return,
    };

    for gid in &games {
        for pid in &profiles {
            compute_live_game_save_stats(conn, gid, pid);
        }
    }
}

/// Scans `game_save_locations` across all games to remove obsolete disabled heuristic rows and duplicate paths.
pub fn clean_all_duplicate_save_locations(conn: &Connection) {
    let games: Vec<String> = match conn.prepare("SELECT DISTINCT game_id FROM game_save_locations") {
        Ok(mut stmt) => stmt
            .query_map([], |r| r.get(0))
            .ok()
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default(),
        Err(_) => return,
    };

    for gid in games {
        let locations = match get_game_locations_dto_internal(conn, &gid) {
            Ok(locs) => locs,
            Err(_) => continue,
        };

        let enabled_save = locations.iter().find(|l| l.is_enabled && l.location_type == "save");
        if let Some(active) = enabled_save {
            // Delete older disabled heuristic locations
            let _ = conn.execute(
                "DELETE FROM game_save_locations WHERE game_id = ?1 AND id != ?2 AND detection_source = 'heuristic'",
                params![gid, active.id],
            );
        }

        // Deduplicate rows with the same normalized path or redundant child subpath
        let mut seen_norm = HashSet::new();
        for loc in &locations {
            let norm = normalize_path_for_compare(&expand_save_path(&loc.path));
            if !seen_norm.insert(norm.clone()) {
                let _ = conn.execute("DELETE FROM game_save_locations WHERE id = ?1", params![loc.id]);
            }
        }
    }
}

/// Auto-configures save locations for all installed games currently lacking valid save locations.
pub fn auto_configure_all_installed_games(conn: &Connection) -> usize {
    clean_all_duplicate_save_locations(conn);
    let mut configured_count = 0;
    let mut stmt = match conn.prepare("SELECT id FROM games WHERE is_installed = 1") {
        Ok(s) => s,
        Err(_) => return 0,
    };

    let game_ids: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .ok()
        .map(|rows| rows.filter_map(Result::ok).collect())
        .unwrap_or_default();

    for gid in game_ids {
        let existing = get_game_locations_dto_internal(conn, &gid).unwrap_or_default();
        let has_enabled_save = existing.iter().any(|l| l.is_enabled && l.location_type == "save");

        if !has_enabled_save {
            if let Ok(new_locs) = auto_configure_game_save(conn, &gid) {
                if new_locs.iter().any(|l| l.is_enabled) {
                    configured_count += 1;
                }
            }
        }
    }

    refresh_all_profiles_save_stats(conn);

    configured_count
}

#[tauri::command]
pub async fn get_game_save_details(
    db: State<'_, Database>,
    game_id: String,
    profile_id: Option<String>,
) -> Result<GameSaveDetails, String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let prof_id = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    // Fetch locations directly from database without silently re-inserting deleted ones
    let locations = get_game_locations_dto_internal(&conn, &game_id)
        .map_err(|e| e.to_string())?;

    let is_managed = locations.iter().any(|l| l.is_enabled && l.location_type == "save");

    // Compute live stats from physical disk and sync to DB
    let (live_files, live_bytes, live_state) = compute_live_game_save_stats(&conn, &game_id, &prof_id);

    // Fetch profile_game_saves stats
    let save_meta = conn
        .query_row(
            "SELECT content_hash, last_synced_at, state
             FROM profile_game_saves WHERE profile_id = ?1 AND game_id = ?2",
            params![prof_id, game_id],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .ok();

    let (content_hash, last_synced_at, state) = match save_meta {
        Some((ch, ls, st)) => (ch, ls, st),
        None => (None, None, live_state),
    };

    Ok(GameSaveDetails {
        game_id,
        profile_id: prof_id,
        is_managed,
        locations,
        file_count: live_files,
        save_size_bytes: live_bytes,
        content_hash,
        last_synced_at,
        state,
    })
}

#[tauri::command]
pub async fn apply_save_locations_from_database(
    db: State<'_, Database>,
    game_id: String,
) -> Result<GameSaveDetails, String> {
    {
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        auto_configure_game_save_with_options(&conn, &game_id, true)
            .map_err(|e| e.to_string())?;
        clean_all_duplicate_save_locations(&conn);
    }
    get_game_save_details(db, game_id, None).await
}

#[tauri::command]
pub async fn auto_detect_save_locations_for_game(
    db: State<'_, Database>,
    game_id: String,
) -> Result<GameSaveDetails, String> {
    {
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        let _ = auto_configure_game_save(&conn, &game_id);
    }
    get_game_save_details(db, game_id, None).await
}

#[tauri::command]
pub async fn detect_game_saves(
    db: State<'_, Database>,
    game_id: String,
    game_title: String,
    steam_app_id: Option<u32>,
) -> Result<Vec<DetectedSaveLocation>, String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let exe_path_str: Option<String> = conn
        .query_row(
            "SELECT executable_path FROM games WHERE id = ?1",
            params![game_id],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let exe_path = exe_path_str.as_deref().map(std::path::Path::new);
    let candidates = SaveDetector::detect_save_locations(&game_title, steam_app_id, exe_path);
    Ok(candidates)
}

#[tauri::command]
pub async fn configure_save_location(
    db: State<'_, Database>,
    game_id: String,
    path: String,
    location_type: String,
    is_enabled: bool,
) -> Result<(), String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let trimmed_path = path.trim().to_string();
    if trimmed_path.is_empty() {
        return Err("Save path cannot be empty".into());
    }

    let norm_target = normalize_path_for_compare(&expand_save_path(&trimmed_path));
    let existing_locations = get_game_locations_dto_internal(&conn, &game_id)
        .map_err(|e| e.to_string())?;

    if let Some(existing) = existing_locations.iter().find(|l| {
        l.path.trim().eq_ignore_ascii_case(&trimmed_path)
            || normalize_path_for_compare(&expand_save_path(&l.path)) == norm_target
    }) {
        conn.execute(
            "UPDATE game_save_locations SET is_enabled = ?1, location_type = ?2, path = ?3 WHERE id = ?4",
            params![is_enabled, location_type, trimmed_path, existing.id],
        )
        .map_err(|e| e.to_string())?;

        // Delete any duplicate rows with the same normalized path
        for other in existing_locations.iter().filter(|l| l.id != existing.id) {
            if normalize_path_for_compare(&expand_save_path(&other.path)) == norm_target {
                let _ = conn.execute("DELETE FROM game_save_locations WHERE id = ?1", params![other.id]);
            }
        }

        let prof_id = get_active_profile_id(&conn);
        compute_live_game_save_stats(&conn, &game_id, &prof_id);
        return Ok(());
    }

    let loc_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO game_save_locations (id, game_id, path, location_type, detection_source, confidence, is_enabled)
         VALUES (?1, ?2, ?3, ?4, 'manual', 100, ?5)",
        params![loc_id, game_id, trimmed_path, location_type, is_enabled],
    )
    .map_err(|e| e.to_string())?;

    for other in existing_locations.iter() {
        if normalize_path_for_compare(&expand_save_path(&other.path)) == norm_target {
            let _ = conn.execute("DELETE FROM game_save_locations WHERE id = ?1", params![other.id]);
        }
    }

    let prof_id = get_active_profile_id(&conn);
    compute_live_game_save_stats(&conn, &game_id, &prof_id);

    Ok(())
}

#[tauri::command]
pub async fn remove_save_location(
    db: State<'_, Database>,
    location_id: String,
) -> Result<(), String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;

    let game_id = conn.query_row(
        "SELECT game_id FROM game_save_locations WHERE id = ?1",
        params![location_id],
        |r| r.get::<_, String>(0),
    ).ok();

    // Delete foreign key references in operation journal to prevent FK constraint failure
    conn.execute(
        "DELETE FROM save_operation_locations WHERE location_id = ?1",
        params![location_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM game_save_locations WHERE id = ?1",
        params![location_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(gid) = game_id {
        let prof_id = get_active_profile_id(&conn);
        compute_live_game_save_stats(&conn, &gid, &prof_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn toggle_save_location(
    db: State<'_, Database>,
    location_id: String,
    is_enabled: bool,
) -> Result<(), String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;

    let game_id = conn.query_row(
        "SELECT game_id FROM game_save_locations WHERE id = ?1",
        params![location_id],
        |r| r.get::<_, String>(0),
    ).ok();

    conn.execute(
        "UPDATE game_save_locations SET is_enabled = ?1 WHERE id = ?2",
        params![is_enabled, location_id],
    )
    .map_err(|e| e.to_string())?;

    if let Some(gid) = game_id {
        let prof_id = get_active_profile_id(&conn);
        compute_live_game_save_stats(&conn, &gid, &prof_id);
    }

    Ok(())
}

#[tauri::command]
pub async fn list_save_snapshots(
    _db: State<'_, Database>,
    game_id: String,
    profile_id: Option<String>,
) -> Result<Vec<SaveSnapshot>, String> {
    // profile_id honored when given; otherwise scan across all profiles
    match profile_id {
        Some(pid) => {
            SnapshotEngine::list_snapshots(&pid, &game_id).map_err(|e| e.to_string())
        }
        None => SnapshotEngine::list_all_snapshots(&game_id).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn restore_save_snapshot(
    db: State<'_, Database>,
    locks: State<'_, SaveManagerLocks>,
    session_mgr: State<'_, SessionManager>,
    game_id: String,
    profile_id: Option<String>,
    snapshot_id: String,
) -> Result<String, String> {
    let (_global, _game) = locks.acquire_game_transaction_locks(&game_id).await;

    if session_mgr.get_session_by_game(&game_id).is_some() {
        return Err(SaveManagerError::GameRunning("Cannot restore snapshot while game is running".into()).to_string());
    }

    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let prof_id = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    TransactionCoordinator::restore_snapshot(&conn, &prof_id, &game_id, &snapshot_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_save_snapshot(
    db: State<'_, Database>,
    game_id: String,
    profile_id: Option<String>,
    snapshot_id: String,
) -> Result<(), String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let prof_id = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    SnapshotEngine::delete_snapshot(&prof_id, &game_id, &snapshot_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clone_profile_save(
    db: State<'_, Database>,
    locks: State<'_, SaveManagerLocks>,
    game_id: String,
    src_profile_id: String,
    dst_profile_id: String,
) -> Result<String, String> {
    let (_global, _game) = locks.acquire_game_transaction_locks(&game_id).await;
    let conn = db.connection.lock().map_err(|e| e.to_string())?;

    TransactionCoordinator::clone_save(&conn, &src_profile_id, &dst_profile_id, &game_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_save_folder(path: String) -> Result<(), String> {
    let resolved = expand_save_path(&path);
    let target_dir = if resolved.is_file() {
        resolved.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| resolved.clone())
    } else if let Some(ext) = resolved.extension() {
        if !ext.is_empty() {
            resolved.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| resolved.clone())
        } else {
            resolved.clone()
        }
    } else {
        resolved.clone()
    };

    if !target_dir.exists() {
        let _ = std::fs::create_dir_all(&target_dir);
    }

    #[cfg(windows)]
    {
        if resolved.is_file() && resolved.exists() {
            let _ = std::process::Command::new("explorer")
                .arg(format!("/select,\"{}\"", resolved.display()))
                .spawn();
        } else {
            let _ = std::process::Command::new("explorer")
                .arg(&target_dir)
                .spawn();
        }
    }

    #[cfg(not(windows))]
    {
        let _ = std::process::Command::new("xdg-open")
            .arg(&target_dir)
            .spawn();
    }

    Ok(())
}

#[tauri::command]
pub async fn list_save_operations(
    db: State<'_, Database>,
    game_id: Option<String>,
    profile_id: Option<String>,
) -> Result<Vec<SaveOperation>, String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let mut sql = "SELECT id, schema_version, operation_type, game_id, profile_id, state, started_at, completed_at, error_code, error_message FROM save_operations WHERE 1=1".to_string();
    let mut params_vec: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(ref gid) = game_id {
        sql.push_str(" AND game_id = ?");
        params_vec.push(gid.clone().into());
    }
    if let Some(ref pid) = profile_id {
        sql.push_str(" AND profile_id = ?");
        params_vec.push(pid.clone().into());
    }
    sql.push_str(" ORDER BY started_at DESC LIMIT 50");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_slice: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|v| v as &dyn rusqlite::ToSql).collect();

    let rows = stmt
        .query_map(params_slice.as_slice(), |row| {
            Ok(SaveOperation {
                id: row.get(0)?,
                schema_version: row.get(1)?,
                operation_type: row.get(2)?,
                game_id: row.get(3)?,
                profile_id: row.get(4)?,
                state: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
                error_code: row.get(8)?,
                error_message: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut ops = Vec::new();
    for r in rows {
        ops.push(r.map_err(|e| e.to_string())?);
    }
    Ok(ops)
}
