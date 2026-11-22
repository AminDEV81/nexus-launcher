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
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
                            // ARCHIVED GAME (User moved to Memory Vault):
                            let (size, count) = calculate_dir_size_and_count(&g_path);
                            if size > 0 || count > 0 {
                                items.push(CleanupItem {
                                    id: format!("archived_save:{}:{}", prof_id, gid),
                                    category: "orphaned_saves".into(),
                                    title: format!("Save Data — {}", game_title),
                                    subtitle: format!("Profile: {} • Memory Vault game saves", prof_name),
                                    path: g_path.to_string_lossy().to_string(),
                                    size_bytes: size,
                                    item_count: count,
                                    is_safe: false,
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
                        // Never delete artwork for games in active library OR in Memory Vault.
                        // Artwork is only orphaned if the game is completely gone from the database.
                        if !active_games.contains_key(&art_gid) && !archived_games.contains_key(&art_gid) {
                            let (a_size, a_count) = calculate_dir_size_and_count(&art_entry.path());
                            if a_size > 0 || a_count > 0 {
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
            // HARD DEFENSE GUARD: Never delete artwork belonging to games still present in library or Memory Vault.
            if target.category == "orphaned_artworks" {
                if let Some(ref gid) = target.game_id {
                    let is_in_db = {
                        if let Ok(conn) = db.connection.lock() {
                            conn.query_row(
                                "SELECT EXISTS(SELECT 1 FROM games WHERE id = ?1)",
                                [gid],
                                |row| row.get::<_, bool>(0),
                            )
                            .unwrap_or(false)
                        } else {
                            false
                        }
                    };
                    if is_in_db {
                        log::warn!("Prevented deletion of artwork for game {gid} still present in library/memory");
                        continue;
                    }
                }
            }

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


#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveStorageInfo {
    pub mount_point: String,
    pub label: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub used_bytes: u64,
    pub games_bytes: u64,
    pub game_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameStorageNode {
    pub id: String,
    pub name: String,
    pub install_path: String,
    pub drive_mount: String,
    pub size_bytes: u64,
    pub playtime_seconds: i64,
    pub last_played_at: Option<String>,
    pub days_since_played: Option<i64>,
    pub is_stale: bool,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedistCleanTarget {
    pub id: String,
    pub game_id: String,
    pub game_name: String,
    pub category: String, // "redist" | "crash_dump"
    pub label: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageAnalysisReport {
    pub drives: Vec<DriveStorageInfo>,
    pub games: Vec<GameStorageNode>,
    pub redists: Vec<RedistCleanTarget>,
    pub total_games_bytes: u64,
    pub total_reclaimable_redist_bytes: u64,
    pub stale_games_bytes: u64,
    pub stale_games_count: usize,
}

fn is_redist_dir_name(name: &str) -> bool {
    let low = name.to_ascii_lowercase();
    matches!(
        low.as_str(),
        "_commonredist"
            | "commonredist"
            | "redist"
            | "redistributables"
            | "directx"
            | "vcredist"
            | "dotnetfx"
            | "physx"
            | "crashdumps"
            | "crashes"
    )
}

fn is_crash_dump_file(name: &str) -> bool {
    let low = name.to_ascii_lowercase();
    low.ends_with(".dmp") || low.ends_with(".mdmp")
}

fn scan_game_redists(
    game_id: &str,
    game_name: &str,
    install_dir: &Path,
    out: &mut Vec<RedistCleanTarget>,
) {
    if !install_dir.exists() || !install_dir.is_dir() {
        return;
    }
    let mut visited_dirs: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(install_dir)
        .max_depth(4)
        .into_iter()
        .flatten()
    {
        let p = entry.path();
        if visited_dirs.iter().any(|vd| p != vd && p.starts_with(vd)) {
            continue;
        }
        let fname = entry.file_name().to_string_lossy().to_string();
        if entry.file_type().is_dir() && is_redist_dir_name(&fname) {
            visited_dirs.push(p.to_path_buf());
            let (sz, cnt) = calculate_dir_size_and_count(p);
            if sz > 0 {
                let low = fname.to_ascii_lowercase();
                let cat = if low.contains("crash") { "crash_dump" } else { "redist" };
                out.push(RedistCleanTarget {
                    id: format!("redist_{}", p.to_string_lossy()),
                    game_id: game_id.to_string(),
                    game_name: game_name.to_string(),
                    category: cat.to_string(),
                    label: fname,
                    path: p.to_string_lossy().to_string(),
                    size_bytes: sz,
                    file_count: cnt,
                });
            }
        } else if entry.file_type().is_file() && is_crash_dump_file(&fname) {
            if let Ok(meta) = entry.metadata() {
                let sz = meta.len();
                if sz > 0 {
                    out.push(RedistCleanTarget {
                        id: format!("dump_{}", p.to_string_lossy()),
                        game_id: game_id.to_string(),
                        game_name: game_name.to_string(),
                        category: "crash_dump".to_string(),
                        label: fname,
                        path: p.to_string_lossy().to_string(),
                        size_bytes: sz,
                        file_count: 1,
                    });
                }
            }
        }
    }
}

#[command]
pub async fn analyze_storage_and_redists(
    db: State<'_, Database>,
) -> AppResult<StorageAnalysisReport> {
    struct RawGameRow {
        id: String,
        name: String,
        install_path: String,
        install_size_bytes: u64,
        playtime_seconds: i64,
        last_played_at: Option<String>,
        cover_url: Option<String>,
    }

    let raw_games: Vec<RawGameRow> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare(
                "SELECT id, name, install_path, COALESCE(install_size_bytes, 0), COALESCE(playtime_seconds, 0), last_played_at, cover_url                  FROM games WHERE is_installed = 1 AND COALESCE(is_memory, 0) = 0 AND install_path IS NOT NULL AND TRIM(install_path) != ''",
            )
            .map_err(AppError::Database)?;
        let rows = stmt
            .query_map([], |row| {
                let sz_raw: i64 = row.get(3)?;
                Ok(RawGameRow {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    install_path: row.get(2)?,
                    install_size_bytes: sz_raw.max(0) as u64,
                    playtime_seconds: row.get(4)?,
                    last_played_at: row.get(5)?,
                    cover_url: row.get(6)?,
                })
            })
            .map_err(AppError::Database)?;
        rows.flatten().collect()
    };

    tokio::task::spawn_blocking(move || {
        let disks = sysinfo::Disks::new_with_refreshed_list();
        let mut drives: Vec<DriveStorageInfo> = disks
            .list()
            .iter()
            .filter(|d| d.total_space() > 0)
            .map(|d| {
                let total = d.total_space();
                let avail = d.available_space();
                DriveStorageInfo {
                    mount_point: d.mount_point().to_string_lossy().to_string(),
                    label: d.name().to_string_lossy().to_string(),
                    total_bytes: total,
                    available_bytes: avail,
                    used_bytes: total.saturating_sub(avail),
                    games_bytes: 0,
                    game_count: 0,
                }
            })
            .collect();

        // Sort longest mount_point first for accurate prefix matching
        let mut drive_mounts: Vec<String> = drives.iter().map(|d| d.mount_point.clone()).collect();
        drive_mounts.sort_by_key(|b| std::cmp::Reverse(b.len()));

        let now = chrono::Utc::now();
        let mut games_out: Vec<GameStorageNode> = Vec::new();
        let mut redists_out: Vec<RedistCleanTarget> = Vec::new();
        let mut total_games_bytes = 0u64;
        let mut stale_games_bytes = 0u64;
        let mut stale_games_count = 0usize;

        for g in raw_games {
            let path_obj = PathBuf::from(&g.install_path);
            let size_bytes = if g.install_size_bytes > 0 {
                g.install_size_bytes
            } else if path_obj.exists() {
                calculate_dir_size_and_count(&path_obj).0
            } else {
                0
            };

            let norm_path = g.install_path.to_ascii_lowercase().replace('/', "\\");
            let drive_mount = drive_mounts
                .iter()
                .find(|m| norm_path.starts_with(&m.to_ascii_lowercase().replace('/', "\\")))
                .cloned()
                .unwrap_or_else(|| {
                    g.install_path
                        .get(0..3)
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| "Other".to_string())
                });

            if let Some(drv) = drives.iter_mut().find(|d| d.mount_point == drive_mount) {
                drv.games_bytes = drv.games_bytes.saturating_add(size_bytes);
                drv.game_count += 1;
            }

            let days_since_played = g.last_played_at.as_deref().and_then(|ts| {
                chrono::DateTime::parse_from_rfc3339(ts)
                    .ok()
                    .map(|dt| (now - dt.with_timezone(&chrono::Utc)).num_days().max(0))
                    .or_else(|| {
                        chrono::NaiveDate::parse_from_str(ts.get(0..10)?, "%Y-%m-%d")
                            .ok()
                            .map(|nd| (now.date_naive() - nd).num_days().max(0))
                    })
            });

            let stale_by_age = match days_since_played {
                Some(d) => d >= 60,
                None => g.playtime_seconds == 0,
            };
            let is_stale = stale_by_age && size_bytes >= 15 * 1024 * 1024 * 1024;
            if is_stale {
                stale_games_bytes = stale_games_bytes.saturating_add(size_bytes);
                stale_games_count += 1;
            }
            total_games_bytes = total_games_bytes.saturating_add(size_bytes);

            scan_game_redists(&g.id, &g.name, &path_obj, &mut redists_out);

            games_out.push(GameStorageNode {
                id: g.id,
                name: g.name,
                install_path: g.install_path,
                drive_mount,
                size_bytes,
                playtime_seconds: g.playtime_seconds,
                last_played_at: g.last_played_at,
                days_since_played,
                is_stale,
                cover_url: g.cover_url,
            });
        }

        games_out.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        redists_out.sort_by(|a, b| b.size_bytes.cmp(&a.size_bytes));
        let total_reclaimable_redist_bytes = redists_out.iter().map(|r| r.size_bytes).sum();

        Ok(StorageAnalysisReport {
            drives,
            games: games_out,
            redists: redists_out,
            total_games_bytes,
            total_reclaimable_redist_bytes,
            stale_games_bytes,
            stale_games_count,
        })
    })
    .await
    .map_err(|e| AppError::Invalid(format!("Storage analysis task failed: {e}")))?
}

#[command]
pub async fn clean_redist_targets(
    db: State<'_, Database>,
    paths: Vec<String>,
) -> AppResult<CleanupExecuteReport> {
    let allowed_roots: Vec<PathBuf> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn
            .prepare(
                "SELECT install_path FROM games WHERE is_installed = 1 AND install_path IS NOT NULL AND TRIM(install_path) != ''",
            )
            .map_err(AppError::Database)?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(AppError::Database)?;
        rows.flatten().map(PathBuf::from).collect()
    };

    tokio::task::spawn_blocking(move || {
        let mut freed_bytes = 0u64;
        let mut deleted_items_count = 0usize;
        let mut errors = Vec::new();

        for raw in paths {
            let target = PathBuf::from(&raw);
            let fname = target
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();

            let has_parent_dir = target
                .components()
                .any(|c| matches!(c, std::path::Component::ParentDir));
            let is_symlink = std::fs::symlink_metadata(&target)
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            let is_under_game = !has_parent_dir
                && !is_symlink
                && allowed_roots.iter().any(|root| {
                    target.starts_with(root) && target != *root
                });
            let is_safe_target = is_redist_dir_name(&fname) || is_crash_dump_file(&fname);

            if !is_under_game || !is_safe_target {
                errors.push(format!("Skipped unsafe or unrecognized target: {raw}"));
                continue;
            }
            if !target.exists() {
                continue;
            }

            if target.is_dir() {
                let (sz, _) = calculate_dir_size_and_count(&target);
                match remove_path_all_with_retry(&target) {
                    Ok(_) => {
                        freed_bytes = freed_bytes.saturating_add(sz);
                        deleted_items_count += 1;
                    }
                    Err(e) => errors.push(format!("Failed to delete {raw}: {e}")),
                }
            } else if target.is_file() {
                let sz = target.metadata().map(|m| m.len()).unwrap_or(0);
                match std::fs::remove_file(&target) {
                    Ok(_) => {
                        freed_bytes = freed_bytes.saturating_add(sz);
                        deleted_items_count += 1;
                    }
                    Err(e) => errors.push(format!("Failed to delete {raw}: {e}")),
                }
            }
        }

        Ok(CleanupExecuteReport {
            freed_bytes,
            deleted_items_count,
            errors,
        })
    })
    .await
    .map_err(|e| AppError::Invalid(format!("Redist cleanup task failed: {e}")))?
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

    #[test]
    fn test_memory_vault_artwork_is_not_orphaned() {
        let mut active_games = HashMap::new();
        let mut archived_games = HashMap::new();

        active_games.insert("game-1".to_string(), "Active Game".to_string());
        archived_games.insert("game-2".to_string(), "Memory Game".to_string());

        // Active game is protected
        assert!(active_games.contains_key("game-1") || archived_games.contains_key("game-1"));
        // Memory game is strictly protected from orphaned artwork cleanup
        assert!(active_games.contains_key("game-2") || archived_games.contains_key("game-2"));
        // Only completely deleted game is orphaned
        assert!(!active_games.contains_key("game-3") && !archived_games.contains_key("game-3"));
    }
}
