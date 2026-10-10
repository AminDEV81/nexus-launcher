use crate::commands::save_manager::fs_ops::{get_nexus_profiles_root, remove_path_all_with_retry};
use crate::db::Database;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{command, AppHandle, State};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupItem {
    pub id: String,
    pub category: String, // "orphaned_saves" | "save_snapshots" | "orphaned_artworks" | "legacy_appdata" | "staging_cache"
    pub title: String,
    pub subtitle: String,
    pub path: String,
    pub size_bytes: u64,
    pub item_count: usize,
    pub is_safe: bool,
    pub game_id: Option<String>,
    pub profile_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupScanReport {
    pub items: Vec<CleanupItem>,
    pub total_reclaimable_bytes: u64,
    pub total_items_count: usize,
    pub live_saves_protected_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CleanupExecuteReport {
    pub freed_bytes: u64,
    pub deleted_items_count: usize,
    pub errors: Vec<String>,
}

fn calculate_dir_size_and_count(dir: &Path) -> (u64, usize) {
    if !dir.exists() {
        return (0, 0);
    }
    let mut total_size = 0u64;
    let mut count = 0usize;
    for entry in WalkDir::new(dir).into_iter().flatten() {
        if entry.file_type().is_file() {
            if let Ok(meta) = entry.metadata() {
                total_size += meta.len();
                count += 1;
            }
        }
    }
    (total_size, count)
}

#[command]
pub async fn scan_cleanup_targets(
    app: AppHandle,
    db: State<'_, Database>,
) -> AppResult<CleanupScanReport> {
    let (active_games, archived_games, profile_names) = {
        let conn = db.connection.lock().expect("db mutex poisoned");
        let mut active = HashMap::new();
        let mut archived = HashMap::new();
        let mut stmt = conn
            .prepare("SELECT id, name, is_memory FROM games")
            .map_err(AppError::Database)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                ))
            })
            .map_err(AppError::Database)?;
        for r in rows.flatten() {
            let (id, name, is_memory) = r;
            if is_memory {
                archived.insert(id, name);
            } else {
                active.insert(id, name);
            }
        }

        let mut pnames = HashMap::new();
        if let Ok(mut p_stmt) = conn.prepare("SELECT id, name FROM profiles") {
            if let Ok(p_rows) = p_stmt.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))) {
                for r in p_rows.flatten() {
                    pnames.insert(r.0, r.1);
                }
            }
        }

        (active, archived, pnames)
    };

    let mut items = Vec::new();
    let mut live_saves_protected_bytes = 0u64;

    // 1. Scan Nexus profiles root
    let profiles_root = get_nexus_profiles_root();
    if profiles_root.exists() {
        if let Ok(prof_entries) = std::fs::read_dir(&profiles_root) {
            for prof_entry in prof_entries.flatten() {
                if !prof_entry.path().is_dir() {
                    continue;
                }
                let prof_id = prof_entry.file_name().to_string_lossy().to_string();
                let prof_name = profile_names
                    .get(&prof_id)
                    .cloned()
                    .unwrap_or_else(|| prof_id.clone());

                let games_dir = prof_entry.path().join("games");
                if !games_dir.exists() {
                    continue;
                }

                if let Ok(game_entries) = std::fs::read_dir(&games_dir) {
                    for g_entry in game_entries.flatten() {
                        if !g_entry.path().is_dir() {
                            continue;
                        }
                        let gid = g_entry.file_name().to_string_lossy().to_string();
                        let g_path = g_entry.path();

                        if let Some(game_title) = active_games.get(&gid) {
                            // ACTIVE LIBRARY GAME:
                            // a) Account for live protected saves in `current` (NEVER deleted)
                            let curr_dir = g_path.join("current");
                            if curr_dir.exists() {
                                let (c_size, _) = calculate_dir_size_and_count(&curr_dir);
                                live_saves_protected_bytes += c_size;
                            }

                            // b) Check historical `snapshots`
                            let snap_dir = g_path.join("snapshots");
                            if snap_dir.exists() {
                                let (s_size, s_count) = calculate_dir_size_and_count(&snap_dir);
                                if s_size > 0 {
                                    items.push(CleanupItem {
                                        id: format!("snapshots:{}:{}", prof_id, gid),
                                        category: "save_snapshots".into(),
                                        title: format!("{} Snapshots", game_title),
                                        subtitle: format!("Profile: {} • Backup snapshot history (active save safe)", prof_name),
                                        path: snap_dir.to_string_lossy().to_string(),
                                        size_bytes: s_size,
                                        item_count: s_count,
                                        is_safe: true,
                                        game_id: Some(gid.clone()),
                                        profile_id: Some(prof_id.clone()),
                                    });
                                }
                            }

                            // c) Check `staging` scratch directory
                            let stg_dir = g_path.join("staging");
                            if stg_dir.exists() {
                                let (stg_size, stg_count) = calculate_dir_size_and_count(&stg_dir);
                                if stg_size > 0 {
                                    items.push(CleanupItem {
                                        id: format!("staging:{}:{}", prof_id, gid),
                                        category: "staging_cache".into(),
                                        title: format!("{} Staging Scratch", game_title),
                                        subtitle: format!("Profile: {} • Temporary swap scratch buffers", prof_name),
                                        path: stg_dir.to_string_lossy().to_string(),
                                        size_bytes: stg_size,
                                        item_count: stg_count,
                                        is_safe: true,
                                        game_id: Some(gid.clone()),
                                        profile_id: Some(prof_id.clone()),
                                    });
                                }
                            }
                        } else if let Some(game_title) = archived_games.get(&gid) {
                            // ARCHIVED GAME (User removed from Library):
                            let (size, count) = calculate_dir_size_and_count(&g_path);
                            if size > 0 || count > 0 {
                                items.push(CleanupItem {
                                    id: format!("archived_save:{}:{}", prof_id, gid),
                                    category: "orphaned_saves".into(),
                                    title: format!("Save Data — {}", game_title),
                                    subtitle: format!("Profile: {} • Removed from library (Archived)", prof_name),
                                    path: g_path.to_string_lossy().to_string(),
                                    size_bytes: size,
                                    item_count: count,
                                    is_safe: true,
                                    game_id: Some(gid.clone()),
                                    profile_id: Some(prof_id.clone()),
                                });
                            }
                        } else {
                            // ORPHANED GAME (Game record was permanently purged from database):
                            let (size, count) = calculate_dir_size_and_count(&g_path);
                            if size > 0 || count > 0 {
                                items.push(CleanupItem {
                                    id: format!("orphaned_game:{}:{}", prof_id, gid),
                                    category: "orphaned_saves".into(),
                                    title: format!("Orphaned Save Data ({})", gid.chars().take(8).collect::<String>()),
                                    subtitle: format!("Profile: {} • Unused saves from permanently deleted game", prof_name),
                                    path: g_path.to_string_lossy().to_string(),
                                    size_bytes: size,
                                    item_count: count,
                                    is_safe: true,
                                    game_id: Some(gid.clone()),
                                    profile_id: Some(prof_id.clone()),
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    // 2. Scan artworks in `{app_data_dir}/artwork`
    if let Ok(app_dir) = crate::paths::app_data_dir(&app) {
        let artwork_root = app_dir.join("artwork");
        if artwork_root.exists() {
            if let Ok(art_entries) = std::fs::read_dir(&artwork_root) {
                for art_entry in art_entries.flatten() {
                    if art_entry.path().is_dir() {
                        let art_gid = art_entry.file_name().to_string_lossy().to_string();
                        // If it's in active_games, keep it (active library game).
                        if !active_games.contains_key(&art_gid) {
                            let (a_size, a_count) = calculate_dir_size_and_count(&art_entry.path());
                            if a_size > 0 || a_count > 0 {
                                if let Some(game_title) = archived_games.get(&art_gid) {
                                    items.push(CleanupItem {
                                        id: format!("archived_art:{}", art_gid),
                                        category: "orphaned_artworks".into(),
                                        title: format!("Artwork Cache — {}", game_title),
                                        subtitle: "Cached posters & banners for game removed from library".into(),
                                        path: art_entry.path().to_string_lossy().to_string(),
                                        size_bytes: a_size,
                                        item_count: a_count,
                                        is_safe: true,
                                        game_id: Some(art_gid),
                                        profile_id: None,
                                    });
                                } else {
                                    items.push(CleanupItem {
                                        id: format!("orphaned_art:{}", art_gid),
                                        category: "orphaned_artworks".into(),
                                        title: format!("Orphaned Artwork ({})", art_gid.chars().take(8).collect::<String>()),
                                        subtitle: "Cached images for permanently deleted game".into(),
                                        path: art_entry.path().to_string_lossy().to_string(),
                                        size_bytes: a_size,
                                        item_count: a_count,
                                        is_safe: true,
                                        game_id: Some(art_gid),
                                        profile_id: None,
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        // Check `.pending-import`
        let pending_import = app_dir.join(".pending-import");
        if pending_import.exists() {
            let (p_size, p_count) = calculate_dir_size_and_count(&pending_import);
            if p_size > 0 || p_count > 0 {
                items.push(CleanupItem {
                    id: "pending_import:cache".into(),
                    category: "staging_cache".into(),
                    title: "Pending Import Cache".into(),
                    subtitle: "Temporary database swap files from backup imports".into(),
                    path: pending_import.to_string_lossy().to_string(),
                    size_bytes: p_size,
                    item_count: p_count,
                    is_safe: true,
                    game_id: None,
                    profile_id: None,
                });
            }
        }
    }

    // 3. Scan legacy launcher directory `%APPDATA%\nexus-desktop-game-launcher`
    if let Some(appdata_roaming) = dirs::data_dir() {
        let legacy_dir = appdata_roaming.join("nexus-desktop-game-launcher");
        if legacy_dir.exists() {
            let (leg_size, leg_count) = calculate_dir_size_and_count(&legacy_dir);
            if leg_size > 0 || leg_count > 0 {
                items.push(CleanupItem {
                    id: "legacy_appdata:nexus-desktop-game-launcher".into(),
                    category: "legacy_appdata".into(),
                    title: "Legacy Nexus AppData".into(),
                    subtitle: "Obsolete configuration and temporary files from older launcher releases".into(),
                    path: legacy_dir.to_string_lossy().to_string(),
                    size_bytes: leg_size,
                    item_count: leg_count,
                    is_safe: true,
                    game_id: None,
                    profile_id: None,
                });
            }
        }
    }

    // Sort items by size descending
    items.sort_by_key(|b| std::cmp::Reverse(b.size_bytes));

    let total_reclaimable_bytes: u64 = items.iter().map(|i| i.size_bytes).sum();
    let total_items_count: usize = items.len();

    Ok(CleanupScanReport {
        items,
        total_reclaimable_bytes,
        total_items_count,
        live_saves_protected_bytes,
    })
}

#[command]
pub async fn execute_cleanup(
    app: AppHandle,
    db: State<'_, Database>,
    item_ids: Vec<String>,
) -> AppResult<CleanupExecuteReport> {
    // Re-scan to resolve real paths securely to prevent arbitrary path traversal attacks
    let scan_report = scan_cleanup_targets(app, db.clone()).await?;
    let targets_map: HashMap<String, CleanupItem> = scan_report
        .items
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect();

    let mut freed_bytes = 0u64;
    let mut deleted_items_count = 0usize;
    let mut errors = Vec::new();

    for id in item_ids {
        if let Some(target) = targets_map.get(&id) {
            let path = PathBuf::from(&target.path);
            if path.exists() {
                match remove_path_all_with_retry(&path) {
                    Ok(_) => {
                        freed_bytes += target.size_bytes;
                        deleted_items_count += 1;
                        // If it was a snapshots or staging folder, recreate the empty directory so save engine doesn't panic
                        if target.category == "save_snapshots" || target.category == "staging_cache" {
                            let _ = std::fs::create_dir_all(&path);
                        }

                        // Clean database references if applicable
                        if let Some(ref gid) = target.game_id {
                            if let Ok(conn) = db.connection.lock() {
                                if target.category == "orphaned_artworks" {
                                    let _ = conn.execute("DELETE FROM artwork_cache WHERE game_id = ?1", [gid]);
                                } else if target.category == "orphaned_saves" {
                                    if let Some(ref pid) = target.profile_id {
                                        let _ = conn.execute(
                                            "DELETE FROM profile_game_saves WHERE game_id = ?1 AND profile_id = ?2",
                                            [gid, pid],
                                        );
                                    } else {
                                        let _ = conn.execute(
                                            "DELETE FROM profile_game_saves WHERE game_id = ?1",
                                            [gid],
                                        );
                                    }
                                }
                            }
                        }
                    }
                    Err(err) => {
                        errors.push(format!("Failed to clean {}: {}", target.title, err));
                    }
                }
            }
        }
    }

    Ok(CleanupExecuteReport {
        freed_bytes,
        deleted_items_count,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_dir_size_and_count() {
        let temp = std::env::temp_dir().join("nexus_cleanup_test_dir");
        let _ = std::fs::remove_dir_all(&temp);
        std::fs::create_dir_all(&temp).unwrap();
        std::fs::write(temp.join("file1.bin"), [0u8; 1024]).unwrap();
        std::fs::write(temp.join("file2.bin"), [0u8; 2048]).unwrap();

        let (size, count) = calculate_dir_size_and_count(&temp);
        assert_eq!(count, 2);
        assert_eq!(size, 3072);

        let _ = std::fs::remove_dir_all(&temp);
    }
}
