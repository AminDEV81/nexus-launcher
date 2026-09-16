use crate::commands::save_manager::detector::SaveDetector;
use crate::commands::save_manager::error::{SaveManagerError, SaveResult};
use crate::commands::save_manager::fs_ops::{
    calculate_tree_hash, copy_dir_recursive, expand_save_path, flush_file_or_dir_buffers,
    get_nexus_profiles_root, remove_path_all_with_retry, safe_replace_dir, scan_path_file_stats,
    verify_disk_space,
};
use crate::commands::save_manager::journal::JournalManager;
use crate::commands::save_manager::snapshots::SnapshotEngine;
use rusqlite::{params, Connection};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SaveLocationConfig {
    pub id: String,
    pub game_id: String,
    pub os_path: PathBuf,
    pub location_type: String,
    pub is_enabled: bool,
}

pub struct TransactionCoordinator;

impl TransactionCoordinator {
    /// Loads enabled save locations for a game where location_type = 'save'.
    pub fn get_enabled_save_locations(
        conn: &Connection,
        game_id: &str,
    ) -> SaveResult<Vec<SaveLocationConfig>> {
        let mut stmt = conn.prepare(
            "SELECT id, game_id, path, location_type, is_enabled
             FROM game_save_locations
             WHERE game_id = ?1 AND is_enabled = 1 AND location_type = 'save'
             ORDER BY id ASC",
        )?;

        let rows = stmt.query_map(params![game_id], |row| {
            let id: String = row.get(0)?;
            let gid: String = row.get(1)?;
            let raw_path: String = row.get(2)?;
            let location_type: String = row.get(3)?;
            let is_enabled: bool = row.get(4)?;

            Ok(SaveLocationConfig {
                id,
                game_id: gid,
                os_path: expand_save_path(&raw_path),
                location_type,
                is_enabled,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    /// Profile canonical path for a location:
    /// `%APPDATA%\Nexus\profiles\<profile_id>\games\<game_id>\current\<location_id>\`
    pub fn get_profile_current_path(profile_id: &str, game_id: &str, location_id: &str) -> PathBuf {
        get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("current")
            .join(location_id)
    }

    /// Transaction staging root path:
    /// `%APPDATA%\Nexus\profiles\<profile_id>\games\<game_id>\staging\<op_id>\`
    pub fn get_staging_root(
        profile_id: &str,
        game_id: &str,
        op_id: &str,
    ) -> PathBuf {
        get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("staging")
            .join(op_id)
    }

    /// Transaction staging path:
    /// `%APPDATA%\Nexus\profiles\<profile_id>\games\<game_id>\staging\<op_id>\<location_id>\`
    pub fn get_staging_path(
        profile_id: &str,
        game_id: &str,
        op_id: &str,
        location_id: &str,
    ) -> PathBuf {
        get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("staging")
            .join(op_id)
            .join(location_id)
    }

    /// Transaction backup path:
    /// `%APPDATA%\Nexus\profiles\<profile_id>\games\<game_id>\staging\<op_id>\backup_<location_id>\`
    pub fn get_backup_path(
        profile_id: &str,
        game_id: &str,
        op_id: &str,
        location_id: &str,
    ) -> PathBuf {
        get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("staging")
            .join(op_id)
            .join(format!("backup_{}", location_id))
    }

    /// PREPARE GAME SAVES (Launch Preparation Transaction).
    /// Prepares the active profile's verified save onto the OS save paths.
    /// All-or-nothing multi-location commit with rollback on failure.
    pub fn prepare_game_saves(
        conn: &Connection,
        profile_id: &str,
        game_id: &str,
    ) -> SaveResult<String> {
        let mut locations = Self::get_enabled_save_locations(conn, game_id)?;
        if locations.is_empty() {
            if let Ok(new_locs) = super::auto_configure_game_save(conn, game_id) {
                if new_locs.iter().any(|l| l.is_enabled && l.exists) {
                    locations = Self::get_enabled_save_locations(conn, game_id)?;
                }
            }
        }
        if locations.is_empty() {
            // Unmanaged game: no action needed
            return Ok(String::new());
        }

        let op_id = JournalManager::create_operation(conn, "prepare_launch", Some(game_id), Some(profile_id))?;
        JournalManager::update_operation_state(conn, &op_id, "validated")?;

        // 1. Pre-Existing Save Adoption & Protection for Default Profile:
        // Before staging or committing any launch (especially if launched by a secondary profile),
        // verify that the 'default' (main player) profile possesses the full saves from OS path.
        // If the OS path currently contains saves that are absent or larger than what 'default' has,
        // we copy them into 'default' first so the primary player never loses progress.
        for loc in &locations {
            let default_cur = Self::get_profile_current_path("default", game_id, &loc.id);
            if loc.os_path.exists() {
                if let Ok(os_th) = calculate_tree_hash(&loc.os_path) {
                    if os_th.file_count > 0 {
                        let cur_th = if default_cur.exists() {
                            calculate_tree_hash(&default_cur).unwrap_or(crate::commands::save_manager::fs_ops::TreeHashResult {
                                hash: String::new(),
                                total_size: 0,
                                file_count: 0,
                            })
                        } else {
                            crate::commands::save_manager::fs_ops::TreeHashResult {
                                hash: String::new(),
                                total_size: 0,
                                file_count: 0,
                            }
                        };

                        let is_secondary_fresh = profile_id != "default" && {
                            let prof_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);
                            !prof_cur.exists() || calculate_tree_hash(&prof_cur).map(|h| h.file_count == 0).unwrap_or(true)
                        };

                        let needs_adoption = cur_th.file_count == 0
                            || !default_cur.exists()
                            || (is_secondary_fresh && os_th.file_count >= cur_th.file_count);

                        if needs_adoption {
                            let _ = fs::create_dir_all(&default_cur);
                            let _ = copy_dir_recursive(&loc.os_path, &default_cur);
                            let _ = flush_file_or_dir_buffers(&default_cur);

                            let _ = conn.execute(
                                "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, state)
                                 VALUES ('default', ?1, ?2, datetime('now'), ?3, ?4, 'ready')
                                 ON CONFLICT(profile_id, game_id) DO UPDATE SET
                                 last_synced_at = datetime('now'),
                                 file_count = ?3,
                                 save_size_bytes = ?4,
                                 state = 'ready'",
                                params![
                                    game_id,
                                    default_cur.to_string_lossy(),
                                    os_th.file_count as i64,
                                    os_th.total_size as i64,
                                ],
                            );
                        }
                    }
                }
            }
        }

        // 2. Preflight & Snapshot:
        // Create safety snapshot of whatever is currently on OS path (or profile current)
        let mut snapshot_targets = Vec::new();
        for loc in &locations {
            let cur_th = calculate_tree_hash(&loc.os_path)?;
            snapshot_targets.push((loc.id.as_str(), loc.os_path.as_path(), cur_th.hash));
        }

        let ref_targets: Vec<(&str, &Path, &str)> = snapshot_targets
            .iter()
            .map(|(id, p, h)| (*id, *p, h.as_str()))
            .collect();

        JournalManager::update_operation_state(conn, &op_id, "preflight_verified")?;
        SnapshotEngine::create_snapshot(profile_id, game_id, "Pre-Launch Safety Snapshot", false, &ref_targets)?;
        JournalManager::update_operation_state(conn, &op_id, "snapshot_created")?;
        JournalManager::update_operation_state(conn, &op_id, "snapshot_verified")?;

        // 3. Staging:
        // Copy each location's profile current save to staging
        for (i, loc) in locations.iter().enumerate() {
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            let backup = Self::get_backup_path(profile_id, game_id, &op_id, &loc.id);

            let orig_hash = &snapshot_targets[i].2;
            JournalManager::add_location(
                conn,
                &op_id,
                &loc.id,
                Some(orig_hash),
                Some(&backup.to_string_lossy()),
                Some(&staging.to_string_lossy()),
            )?;

            if profile_cur.exists() {
                let th = calculate_tree_hash(&profile_cur)?;
                verify_disk_space(&staging, th.total_size)?;
                copy_dir_recursive(&profile_cur, &staging)?;
                flush_file_or_dir_buffers(&staging)?;

                let staged_th = calculate_tree_hash(&staging)?;
                if staged_th.hash != th.hash {
                    let err_msg = format!(
                        "Staged hash mismatch for location {}: expected {}, got {}",
                        loc.id, th.hash, staged_th.hash
                    );
                    let _ = JournalManager::update_operation_error(conn, &op_id, "STAGING_VERIFICATION_FAILED", &err_msg);
                    let _ = Self::rollback_operation(conn, &op_id);
                    let staging_root = Self::get_staging_root(profile_id, game_id, &op_id);
                    let _ = remove_path_all_with_retry(&staging_root);
                    return Err(SaveManagerError::StagingVerificationFailed(err_msg));
                }
                JournalManager::update_location_staged_hash(conn, &op_id, &loc.id, &staged_th.hash)?;
            } else {
                // Empty profile save -> ensure empty staging
                fs::create_dir_all(&staging)?;
                JournalManager::update_location_staged_hash(conn, &op_id, &loc.id, "empty")?;
            }
            JournalManager::update_location_state(conn, &op_id, &loc.id, "staged")?;
        }

        JournalManager::update_operation_state(conn, &op_id, "staging_created")?;
        JournalManager::update_operation_state(conn, &op_id, "staging_verified")?;

        // 4. Commit (All-or-Nothing across all locations):
        JournalManager::update_operation_state(conn, &op_id, "commit_started")?;

        let mut commit_failed = false;
        let mut commit_error_msg = String::new();

        for loc in &locations {
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            let backup = Self::get_backup_path(profile_id, game_id, &op_id, &loc.id);

            JournalManager::update_location_state(conn, &op_id, &loc.id, "commit_started")?;

            match safe_replace_dir(&staging, &loc.os_path, Some(&backup)) {
                Ok(_) => {
                    JournalManager::update_location_state(conn, &op_id, &loc.id, "committed")?;
                }
                Err(e) => {
                    commit_failed = true;
                    commit_error_msg = format!("Failed to commit location {}: {}", loc.id, e);
                    JournalManager::update_location_state(conn, &op_id, &loc.id, "failed")?;
                    break;
                }
            }
        }

        if commit_failed {
            JournalManager::update_operation_error(conn, &op_id, "COMMIT_FAILED", &commit_error_msg)?;
            Self::rollback_operation(conn, &op_id)?;
            return Err(SaveManagerError::CommitFailed(commit_error_msg));
        }

        JournalManager::update_operation_state(conn, &op_id, "commit_completed")?;

        // 5. Post-Commit Verification:
        for loc in &locations {
            let final_th = calculate_tree_hash(&loc.os_path)?;
            let staged_hash: Option<String> = conn
                .query_row(
                    "SELECT staged_hash FROM save_operation_locations WHERE operation_id = ?1 AND location_id = ?2",
                    params![op_id, loc.id],
                    |row| row.get(0),
                )
                .ok();

            if let Some(sh) = staged_hash {
                if sh != "empty" && final_th.hash != sh {
                    let err_msg = format!(
                        "Final verification failed for location {}: expected {}, got {}",
                        loc.id, sh, final_th.hash
                    );
                    JournalManager::update_operation_error(conn, &op_id, "FINAL_VERIFICATION_FAILED", &err_msg)?;
                    Self::rollback_operation(conn, &op_id)?;
                    return Err(SaveManagerError::FinalVerificationFailed(err_msg));
                }
            }
            JournalManager::update_location_final_hash(conn, &op_id, &loc.id, &final_th.hash)?;
            JournalManager::update_location_state(conn, &op_id, &loc.id, "final_verified")?;
        }

        JournalManager::update_operation_state(conn, &op_id, "final_verified")?;

        // 6. Cleanup Staging & Backup
        let staging_root = get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("staging")
            .join(&op_id);
        let _ = remove_path_all_with_retry(&staging_root);

        // 7. Update DB state
        let (file_count, save_size_bytes) = {
            let mut seen = std::collections::HashSet::new();
            let mut fc = 0i64;
            let mut sz = 0i64;
            for loc in &locations {
                let (c, s) = scan_path_file_stats(&loc.os_path, &mut seen);
                fc += c;
                sz += s;
            }
            (fc, sz)
        };

        conn.execute(
            "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, state)
             VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, 'ready')
             ON CONFLICT(profile_id, game_id) DO UPDATE SET
             last_synced_at = datetime('now'),
             file_count = ?4,
             save_size_bytes = ?5,
             state = 'ready'",
            params![
                profile_id,
                game_id,
                Self::get_profile_current_path(profile_id, game_id, &locations[0].id).to_string_lossy(),
                file_count,
                save_size_bytes,
            ],
        )?;

        JournalManager::update_operation_state(conn, &op_id, "completed")?;
        Ok(op_id)
    }

    /// POST-EXIT SYNCHRONIZATION TRANSACTION.
    /// Synchronizes resulting OS save back to the exact bound session profile.
    pub fn sync_game_saves_after_exit(
        conn: &Connection,
        profile_id: &str,
        game_id: &str,
    ) -> SaveResult<String> {
        let locations = Self::get_enabled_save_locations(conn, game_id)?;
        if locations.is_empty() {
            return Ok(String::new());
        }

        let op_id = JournalManager::create_operation(conn, "sync_exit", Some(game_id), Some(profile_id))?;
        JournalManager::update_operation_state(conn, &op_id, "validated")?;

        // 1. Check if OS saves have changed
        let mut any_changed = false;
        let mut os_hashes = Vec::new();

        for loc in &locations {
            let os_th = calculate_tree_hash(&loc.os_path)?;
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);
            let cur_th = calculate_tree_hash(&profile_cur)?;

            if os_th.hash != cur_th.hash {
                any_changed = true;
            }
            os_hashes.push((loc.id.clone(), os_th, cur_th));
        }

        if !any_changed {
            let total_file_count: usize = os_hashes.iter().map(|(_, th, _)| th.file_count).sum();
            let total_size_bytes: u64 = os_hashes.iter().map(|(_, th, _)| th.total_size).sum();

            // Unchanged: update timestamp, count, size, and complete
            conn.execute(
                "UPDATE profile_game_saves
                 SET last_synced_at = datetime('now'),
                     file_count = ?3,
                     save_size_bytes = ?4,
                     state = 'ready'
                 WHERE profile_id = ?1 AND game_id = ?2",
                params![profile_id, game_id, total_file_count as i64, total_size_bytes as i64],
            )?;
            JournalManager::update_operation_state(conn, &op_id, "completed")?;
            return Ok(op_id);
        }

        // 2. Preflight & Snapshot:
        JournalManager::update_operation_state(conn, &op_id, "preflight_verified")?;

        // Snapshot current verified profile saves before updating
        let mut snapshot_targets = Vec::new();
        for (i, loc) in locations.iter().enumerate() {
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);
            let cur_th = &os_hashes[i].2;
            snapshot_targets.push((loc.id.as_str(), profile_cur, cur_th.hash.clone()));
        }

        let ref_targets: Vec<(&str, &Path, &str)> = snapshot_targets
            .iter()
            .map(|(id, p, h)| (*id, p.as_path(), h.as_str()))
            .collect();

        SnapshotEngine::create_snapshot(profile_id, game_id, "Post-Exit Safety Snapshot", false, &ref_targets)?;
        JournalManager::update_operation_state(conn, &op_id, "snapshot_created")?;
        JournalManager::update_operation_state(conn, &op_id, "snapshot_verified")?;

        // 3. Staging:
        for (i, loc) in locations.iter().enumerate() {
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            let backup = Self::get_backup_path(profile_id, game_id, &op_id, &loc.id);
            let orig_hash = &os_hashes[i].2.hash;

            JournalManager::add_location(
                conn,
                &op_id,
                &loc.id,
                Some(orig_hash),
                Some(&backup.to_string_lossy()),
                Some(&staging.to_string_lossy()),
            )?;

            if loc.os_path.exists() {
                let os_th = &os_hashes[i].1;
                verify_disk_space(&staging, os_th.total_size)?;
                copy_dir_recursive(&loc.os_path, &staging)?;
                flush_file_or_dir_buffers(&staging)?;

                let staged_th = calculate_tree_hash(&staging)?;
                if staged_th.hash != os_th.hash {
                    let err_msg = format!(
                        "Staging verification failed for location {}: expected {}, got {}",
                        loc.id, os_th.hash, staged_th.hash
                    );
                    let _ = JournalManager::update_operation_error(conn, &op_id, "STAGING_VERIFICATION_FAILED", &err_msg);
                    let _ = Self::rollback_operation(conn, &op_id);
                    let staging_root = Self::get_staging_root(profile_id, game_id, &op_id);
                    let _ = remove_path_all_with_retry(&staging_root);
                    return Err(SaveManagerError::StagingVerificationFailed(err_msg));
                }
                JournalManager::update_location_staged_hash(conn, &op_id, &loc.id, &staged_th.hash)?;
            } else {
                fs::create_dir_all(&staging)?;
                JournalManager::update_location_staged_hash(conn, &op_id, &loc.id, "empty")?;
            }
            JournalManager::update_location_state(conn, &op_id, &loc.id, "staged")?;
        }

        JournalManager::update_operation_state(conn, &op_id, "staging_created")?;
        JournalManager::update_operation_state(conn, &op_id, "staging_verified")?;

        // 4. Commit to profile current save paths:
        JournalManager::update_operation_state(conn, &op_id, "commit_started")?;

        let mut commit_failed = false;
        let mut commit_error_msg = String::new();

        for loc in &locations {
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            let backup = Self::get_backup_path(profile_id, game_id, &op_id, &loc.id);
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);

            JournalManager::update_location_state(conn, &op_id, &loc.id, "commit_started")?;

            match safe_replace_dir(&staging, &profile_cur, Some(&backup)) {
                Ok(_) => {
                    JournalManager::update_location_state(conn, &op_id, &loc.id, "committed")?;
                }
                Err(e) => {
                    commit_failed = true;
                    commit_error_msg = format!("Failed to commit to profile {}: {}", loc.id, e);
                    JournalManager::update_location_state(conn, &op_id, &loc.id, "failed")?;
                    break;
                }
            }
        }

        if commit_failed {
            JournalManager::update_operation_error(conn, &op_id, "COMMIT_FAILED", &commit_error_msg)?;
            Self::rollback_operation(conn, &op_id)?;
            return Err(SaveManagerError::CommitFailed(commit_error_msg));
        }

        JournalManager::update_operation_state(conn, &op_id, "commit_completed")?;

        // 5. Post-commit verification:
        let mut total_file_count = 0usize;
        let mut total_size_bytes = 0u64;
        let mut combined_hash = String::new();

        for loc in &locations {
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);
            let cur_th = calculate_tree_hash(&profile_cur)?;
            let staged_hash: Option<String> = conn
                .query_row(
                    "SELECT staged_hash FROM save_operation_locations WHERE operation_id = ?1 AND location_id = ?2",
                    params![op_id, loc.id],
                    |row| row.get(0),
                )
                .ok();

            if let Some(sh) = staged_hash {
                if sh != "empty" && cur_th.hash != sh {
                    let err_msg = format!(
                        "Final verification failed for profile location {}: expected {}, got {}",
                        loc.id, sh, cur_th.hash
                    );
                    JournalManager::update_operation_error(conn, &op_id, "FINAL_VERIFICATION_FAILED", &err_msg)?;
                    Self::rollback_operation(conn, &op_id)?;
                    return Err(SaveManagerError::FinalVerificationFailed(err_msg));
                }
            }

            total_file_count += cur_th.file_count;
            total_size_bytes += cur_th.total_size;
            combined_hash.push_str(&cur_th.hash);

            JournalManager::update_location_final_hash(conn, &op_id, &loc.id, &cur_th.hash)?;
            JournalManager::update_location_state(conn, &op_id, &loc.id, "final_verified")?;
        }

        JournalManager::update_operation_state(conn, &op_id, "final_verified")?;

        // 6. Cleanup Staging & Prune Snapshots
        let staging_root = get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("staging")
            .join(&op_id);
        let _ = remove_path_all_with_retry(&staging_root);
        let _ = SnapshotEngine::prune_snapshots(conn, profile_id, game_id);

        // 7. Update DB metadata
        let content_hash = if combined_hash.is_empty() {
            "empty".to_string()
        } else {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(combined_hash.as_bytes());
            hex::encode(hasher.finalize())
        };

        conn.execute(
            "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, content_hash, state)
             VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, ?6, 'ready')
             ON CONFLICT(profile_id, game_id) DO UPDATE SET
             last_synced_at = datetime('now'),
             file_count = ?4,
             save_size_bytes = ?5,
             content_hash = ?6,
             state = 'ready'",
            params![
                profile_id,
                game_id,
                Self::get_profile_current_path(profile_id, game_id, &locations[0].id).to_string_lossy(),
                total_file_count as i64,
                total_size_bytes as i64,
                content_hash
            ],
        )?;

        JournalManager::update_operation_state(conn, &op_id, "completed")?;
        Ok(op_id)
    }

    /// Rollback Engine: Restores ALL locations from backup directories.
    pub fn rollback_operation(conn: &Connection, op_id: &str) -> SaveResult<()> {
        JournalManager::update_operation_state(conn, op_id, "rollback_required")?;
        let locations = JournalManager::get_operation_locations(conn, op_id)?;

        // Journal ops whose commit targets the PROFILE dir (sync_exit,
        // restore_snapshot) must roll back to the profile dir, not the OS
        // path — restoring the OS path here would overwrite fresh game
        // progress with stale profile data.
        let (op_type, profile_id, game_id): (String, Option<String>, Option<String>) = conn
            .query_row(
                "SELECT operation_type, profile_id, game_id FROM save_operations WHERE id = ?1",
                params![op_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                    ))
                },
            )
            .unwrap_or_default();

        let mut rollback_errors = Vec::new();

        for loc in locations {
            if let Some(backup_path_str) = loc.backup_path {
                let backup_path = PathBuf::from(&backup_path_str);
                if backup_path.exists() {
                    let target_path: Option<PathBuf> =
                        if op_type == "sync_exit" || op_type == "restore_snapshot" {
                            profile_id.as_deref().zip(game_id.as_deref()).map(|(pid, gid)| {
                                TransactionCoordinator::get_profile_current_path(pid, gid, &loc.location_id)
                            })
                        } else {
                        conn.query_row(
                            "SELECT path FROM game_save_locations WHERE id = ?1",
                            params![loc.location_id],
                            |row| {
                                let p: String = row.get(0)?;
                                Ok(expand_save_path(&p))
                            },
                        )
                        .ok()
                    };

                    if let Some(target) = target_path {
                        if let Err(e) = safe_replace_dir(&backup_path, &target, None) {
                            rollback_errors.push(format!(
                                "Failed to restore location {} from backup {}: {}",
                                loc.location_id, backup_path_str, e
                            ));
                        } else {
                            let _ = JournalManager::update_location_state(
                                conn,
                                op_id,
                                &loc.location_id,
                                "rolled_back",
                            );
                        }
                    }
                }
            }
        }

        if !rollback_errors.is_empty() {
            let msg = rollback_errors.join("; ");
            JournalManager::update_operation_error(conn, op_id, "ROLLBACK_FAILED", &msg)?;
            return Err(SaveManagerError::RollbackFailed(msg));
        }

        JournalManager::update_operation_state(conn, op_id, "rolled_back")?;
        Ok(())
    }

    /// Restores a snapshot into profile current save (and if active, OS save).
    pub fn restore_snapshot(
        conn: &Connection,
        profile_id: &str,
        game_id: &str,
        snapshot_id: &str,
    ) -> SaveResult<String> {
        let mut snap_dir = SnapshotEngine::get_snapshot_dir(profile_id, game_id, snapshot_id);
        if !snap_dir.exists() {
            let prof_root = get_nexus_profiles_root();
            if let Ok(entries) = fs::read_dir(&prof_root) {
                for entry in entries.flatten() {
                    let candidate = entry
                        .path()
                        .join("games")
                        .join(game_id)
                        .join("snapshots")
                        .join(snapshot_id);
                    if candidate.exists() {
                        snap_dir = candidate;
                        break;
                    }
                }
            }
        }

        if !snap_dir.exists() {
            return Err(SaveManagerError::SnapshotFailed(format!(
                "Snapshot {} not found for game {}",
                snapshot_id, game_id
            )));
        }

        let meta_file = snap_dir.join("snapshot.json");
        let snap_meta: Option<crate::commands::save_manager::snapshots::SaveSnapshot> = if meta_file.exists() {
            fs::read_to_string(&meta_file).ok().and_then(|c| serde_json::from_str(&c).ok())
        } else {
            None
        };

        let op_id = JournalManager::create_operation(conn, "restore_snapshot", Some(game_id), Some(profile_id))?;
        let locations = Self::get_enabled_save_locations(conn, game_id)?;

        // Preflight safety snapshot of existing profile current saves
        let mut cur_targets = Vec::new();
        for loc in &locations {
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);
            let th = calculate_tree_hash(&profile_cur)?;
            cur_targets.push((loc.id.as_str(), profile_cur, th.hash));
        }
        let ref_targets: Vec<(&str, &Path, &str)> = cur_targets
            .iter()
            .map(|(id, p, h)| (*id, p.as_path(), h.as_str()))
            .collect();
        SnapshotEngine::create_snapshot(profile_id, game_id, "Pre-Restore Safety Snapshot", false, &ref_targets)?;

        // Staging from snapshot
        for loc in &locations {
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            let backup = Self::get_backup_path(profile_id, game_id, &op_id, &loc.id);

            JournalManager::add_location(
                conn,
                &op_id,
                &loc.id,
                None,
                Some(&backup.to_string_lossy()),
                Some(&staging.to_string_lossy()),
            )?;

            // Robust matching of snapshot location:
            let mut src_loc: Option<PathBuf> = None;

            // 1. Direct location ID match
            let direct = snap_dir.join(&loc.id);
            if direct.exists() {
                src_loc = Some(direct);
            }

            // 2. Match via snapshot.json original_path
            if src_loc.is_none() {
                if let Some(ref meta) = snap_meta {
                    for loc_meta in &meta.locations {
                        let orig_expanded = expand_save_path(&loc_meta.original_path);
                        if orig_expanded == loc.os_path
                            || orig_expanded
                                .to_string_lossy()
                                .eq_ignore_ascii_case(&loc.os_path.to_string_lossy())
                        {
                            let p = snap_dir.join(&loc_meta.location_id);
                            if p.exists() {
                                src_loc = Some(p);
                                break;
                            }
                        }
                    }
                }
            }

            // 3. Fallback: Check any directory inside snap_dir that contains save files
            if src_loc.is_none() {
                if let Ok(entries) = fs::read_dir(&snap_dir) {
                    let subdirs: Vec<_> = entries
                        .flatten()
                        .filter(|e| e.path().is_dir())
                        .map(|e| e.path())
                        .collect();
                    if subdirs.len() == 1 {
                        src_loc = Some(subdirs[0].clone());
                    } else {
                        for d in subdirs {
                            if SaveDetector::dir_has_files(&d) {
                                src_loc = Some(d);
                                break;
                            }
                        }
                    }
                }
            }

            if let Some(ref s) = src_loc {
                if s.exists() {
                    copy_dir_recursive(s, &staging)?;
                    flush_file_or_dir_buffers(&staging)?;
                }
            }
        }

        // FAIL-SAFE CHECK: Abort if snapshot had data but staging extracted 0 files
        let expected_size = snap_meta.as_ref().map(|m| m.total_size_bytes).unwrap_or(0);
        let mut staging_has_files = false;
        for loc in &locations {
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            if staging.exists() && (staging.is_file() || SaveDetector::dir_has_files(&staging)) {
                staging_has_files = true;
                break;
            }
        }

        if expected_size > 0 && !staging_has_files {
            let staging_root = Self::get_staging_root(profile_id, game_id, &op_id);
            let _ = remove_path_all_with_retry(&staging_root);
            return Err(SaveManagerError::SnapshotFailed(
                "Failed to map snapshot contents to save location. Aborted to prevent data loss.".into(),
            ));
        }

        // Commit staging to profile current
        JournalManager::update_operation_state(conn, &op_id, "commit_started")?;

        let active_id: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'active_profile_id'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "default".to_string());

        let mut total_files = 0usize;
        let mut total_size = 0u64;
        let mut combined_hash = String::new();

        for loc in &locations {
            let staging = Self::get_staging_path(profile_id, game_id, &op_id, &loc.id);
            let backup = Self::get_backup_path(profile_id, game_id, &op_id, &loc.id);
            let profile_cur = Self::get_profile_current_path(profile_id, game_id, &loc.id);

            safe_replace_dir(&staging, &profile_cur, Some(&backup))?;

            if profile_cur.exists() {
                let th = calculate_tree_hash(&profile_cur)?;
                total_files += th.file_count;
                total_size += th.total_size;
                combined_hash.push_str(&th.hash);
            }

            // If the restored profile is currently active in Nexus, commit directly to OS path as well
            if profile_id == active_id {
                if loc.os_path.exists() {
                    remove_path_all_with_retry(&loc.os_path)?;
                }
                if loc.os_path.is_file() || (profile_cur.is_file() && !loc.os_path.exists()) {
                    if let Some(parent) = loc.os_path.parent() {
                        fs::create_dir_all(parent)?;
                    }
                } else {
                    fs::create_dir_all(&loc.os_path)?;
                }
                copy_dir_recursive(&profile_cur, &loc.os_path)?;
                flush_file_or_dir_buffers(&loc.os_path)?;
            }
        }

        let content_hash = if combined_hash.is_empty() {
            "empty".to_string()
        } else {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(combined_hash.as_bytes());
            hex::encode(hasher.finalize())
        };

        if !locations.is_empty() {
            let _ = conn.execute(
                "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, content_hash, state)
                 VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, ?6, 'ready')
                 ON CONFLICT(profile_id, game_id) DO UPDATE SET
                 last_synced_at = datetime('now'),
                 file_count = ?4,
                 save_size_bytes = ?5,
                 content_hash = ?6,
                 state = 'ready'",
                params![
                    profile_id,
                    game_id,
                    Self::get_profile_current_path(profile_id, game_id, &locations[0].id).to_string_lossy(),
                    total_files as i64,
                    total_size as i64,
                    content_hash,
                ],
            );
        }

        JournalManager::update_operation_state(conn, &op_id, "completed")?;
        Ok(op_id)
    }

    /// Clones canonical save from source profile to target profile.
    pub fn clone_save(
        conn: &Connection,
        src_profile_id: &str,
        dst_profile_id: &str,
        game_id: &str,
    ) -> SaveResult<String> {
        if src_profile_id == dst_profile_id {
            return Err(SaveManagerError::InvalidProfile(
                "Cannot clone saves to the same profile".into(),
            ));
        }

        let op_id = JournalManager::create_operation(conn, "clone_save", Some(game_id), Some(dst_profile_id))?;
        let locations = Self::get_enabled_save_locations(conn, game_id)?;

        let active_id: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'active_profile_id'",
                [],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "default".to_string());

        let mut total_files = 0;
        let mut total_size = 0;
        let mut combined_hash = String::new();

        for loc in &locations {
            let src_cur = Self::get_profile_current_path(src_profile_id, game_id, &loc.id);
            let dst_cur = Self::get_profile_current_path(dst_profile_id, game_id, &loc.id);

            if src_cur.exists() {
                let th = calculate_tree_hash(&src_cur)?;
                verify_disk_space(&dst_cur, th.total_size)?;
                copy_dir_recursive(&src_cur, &dst_cur)?;
                flush_file_or_dir_buffers(&dst_cur)?;
                total_files += th.file_count;
                total_size += th.total_size;
                combined_hash.push_str(&th.hash);

                // If cloned destination is currently active, mirror to OS save path as well
                if dst_profile_id == active_id {
                    if loc.os_path.exists() {
                        remove_path_all_with_retry(&loc.os_path)?;
                    }
                    if loc.os_path.is_file() || (dst_cur.is_file() && !loc.os_path.exists()) {
                        if let Some(parent) = loc.os_path.parent() {
                            fs::create_dir_all(parent)?;
                        }
                    } else {
                        fs::create_dir_all(&loc.os_path)?;
                    }
                    copy_dir_recursive(&dst_cur, &loc.os_path)?;
                    flush_file_or_dir_buffers(&loc.os_path)?;
                }
            }
        }

        let content_hash = if combined_hash.is_empty() {
            "empty".to_string()
        } else {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(combined_hash.as_bytes());
            hex::encode(hasher.finalize())
        };

        if !locations.is_empty() {
            conn.execute(
                "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, content_hash, state)
                 VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, ?6, 'ready')
                 ON CONFLICT(profile_id, game_id) DO UPDATE SET
                 last_synced_at = datetime('now'),
                 file_count = ?4,
                 save_size_bytes = ?5,
                 content_hash = ?6,
                 state = 'ready'",
                params![
                    dst_profile_id,
                    game_id,
                    Self::get_profile_current_path(dst_profile_id, game_id, &locations[0].id).to_string_lossy(),
                    total_files as i64,
                    total_size as i64,
                    content_hash
                ],
            )?;
        }

        JournalManager::update_operation_state(conn, &op_id, "completed")?;
        Ok(op_id)
    }

    /// Synchronizes all managed games from the old active profile to the new active profile on disk.
    /// When switching profiles, safely saves whatever is on disk to old_profile_id,
    /// Efficiently swaps disk saves between profiles for games that have isolated saves in Nexus.
    /// Does not touch or wipe games that only exist on disk and were never played by the target profile.
    pub fn swap_all_games_to_profile(
        conn: &Connection,
        old_profile_id: &str,
        new_profile_id: &str,
    ) -> SaveResult<()> {
        if old_profile_id == new_profile_id {
            return Ok(());
        }

        // Swap games where at least one profile has recorded saves OR enabled save locations exist
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT game_id FROM profile_game_saves
                 WHERE file_count > 0 AND (profile_id = ?1 OR profile_id = ?2)
                 UNION
                 SELECT DISTINCT game_id FROM game_save_locations
                 WHERE is_enabled = 1 AND location_type = 'save'",
            )
            .map_err(|e| SaveManagerError::DatabaseError(e.to_string()))?;

        let game_ids: Vec<String> = stmt
            .query_map(params![old_profile_id, new_profile_id], |row| row.get(0))
            .map_err(|e| SaveManagerError::DatabaseError(e.to_string()))?
            .filter_map(Result::ok)
            .collect();

        for gid in game_ids {
            let locations = Self::get_enabled_save_locations(conn, &gid)?;
            for loc in locations {
                let old_prof_cur = Self::get_profile_current_path(old_profile_id, &gid, &loc.id);
                let new_prof_cur = Self::get_profile_current_path(new_profile_id, &gid, &loc.id);

                // 1. Back up current disk saves into old_profile's path
                if loc.os_path.exists() {
                    let has_os_files = if loc.os_path.is_file() {
                        true
                    } else if loc.os_path.is_dir() {
                        match fs::read_dir(&loc.os_path) {
                            Ok(mut r) => r.next().is_some(),
                            Err(_) => false,
                        }
                    } else {
                        false
                    };

                    if has_os_files {
                        if loc.os_path.is_file() {
                            if let Some(parent) = old_prof_cur.parent() {
                                let _ = fs::create_dir_all(parent);
                            }
                        } else {
                            let _ = fs::create_dir_all(&old_prof_cur);
                        }
                        let _ = copy_dir_recursive(&loc.os_path, &old_prof_cur);

                        let mut seen = HashSet::new();
                        let (fc, sz) = scan_path_file_stats(&old_prof_cur, &mut seen);
                        let _ = conn.execute(
                            "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, state)
                             VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, 'ready')
                             ON CONFLICT(profile_id, game_id) DO UPDATE SET
                             last_synced_at = datetime('now'),
                             file_count = ?4,
                             save_size_bytes = ?5,
                             state = 'ready'",
                            params![
                                old_profile_id,
                                gid,
                                old_prof_cur.to_string_lossy(),
                                fc,
                                sz,
                            ],
                        );
                    }
                }

                // Robust lookup of new_prof_cur:
                // If new_prof_cur does not exist or has no files, check if there are saves in an alternate current location
                let actual_new_cur = if new_prof_cur.exists() && (new_prof_cur.is_file() || SaveDetector::dir_has_files(&new_prof_cur)) {
                    new_prof_cur.clone()
                } else {
                    let recorded_path: Option<String> = conn
                        .query_row(
                            "SELECT current_path FROM profile_game_saves WHERE profile_id = ?1 AND game_id = ?2 AND file_count > 0",
                            params![new_profile_id, gid],
                            |row| row.get(0),
                        )
                        .ok();

                    let found_alt = recorded_path
                        .map(PathBuf::from)
                        .filter(|p| {
                            let p_str = p.to_string_lossy();
                            (p_str.contains(&format!("profiles/{new_profile_id}"))
                                || p_str.contains(&format!("profiles\\{new_profile_id}")))
                                && p.exists()
                                && (p.is_file() || SaveDetector::dir_has_files(p))
                        })
                        .or_else(|| {
                            let cur_parent = new_prof_cur.parent()?;
                            if let Ok(entries) = fs::read_dir(cur_parent) {
                                for entry in entries.flatten() {
                                    let ep = entry.path();
                                    if ep != new_prof_cur && ep.is_dir() && SaveDetector::dir_has_files(&ep) {
                                        return Some(ep);
                                    }
                                }
                            }
                            None
                        });

                    if let Some(ref alt) = found_alt {
                        let _ = fs::create_dir_all(&new_prof_cur);
                        let _ = copy_dir_recursive(alt, &new_prof_cur);
                        let _ = flush_file_or_dir_buffers(&new_prof_cur);
                    }
                    new_prof_cur.clone()
                };

                // 2. Put new_profile's saves onto loc.os_path.
                // If new_profile does not have saves for this game, clear loc.os_path
                // so the new profile starts clean and does NOT inherit old_profile's saves!
                let has_new_files = if actual_new_cur.exists() {
                    if actual_new_cur.is_file() {
                        true
                    } else if actual_new_cur.is_dir() {
                        match fs::read_dir(&actual_new_cur) {
                            Ok(mut r) => r.next().is_some(),
                            Err(_) => false,
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                if has_new_files {
                    if loc.os_path.exists() {
                        remove_path_all_with_retry(&loc.os_path)?;
                    }

                    if loc.os_path.is_file() || (actual_new_cur.is_file() && !loc.os_path.exists()) {
                        if let Some(parent) = loc.os_path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }
                    } else {
                        let _ = fs::create_dir_all(&loc.os_path);
                    }
                    let _ = copy_dir_recursive(&actual_new_cur, &loc.os_path);

                    let mut seen = HashSet::new();
                    let (fc, sz) = scan_path_file_stats(&actual_new_cur, &mut seen);
                    let _ = conn.execute(
                        "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, state)
                         VALUES (?1, ?2, ?3, datetime('now'), ?4, ?5, 'ready')
                         ON CONFLICT(profile_id, game_id) DO UPDATE SET
                         last_synced_at = datetime('now'),
                         file_count = ?4,
                         save_size_bytes = ?5,
                         state = 'ready'",
                        params![
                            new_profile_id,
                            gid,
                            new_prof_cur.to_string_lossy(),
                            fc,
                            sz,
                        ],
                    );
                } else {
                    // Target profile has no saves for this game:
                    // DO NOT wipe the disk! Keep existing saves safe and intact.
                    // If target profile actually launches this game later, prepare_game_saves
                    // will safely back up current progress to default, snapshot, and isolate cleanly.
                    let _ = conn.execute(
                        "INSERT INTO profile_game_saves (profile_id, game_id, current_path, last_synced_at, file_count, save_size_bytes, state)
                         VALUES (?1, ?2, ?3, datetime('now'), 0, 0, 'empty')
                         ON CONFLICT(profile_id, game_id) DO UPDATE SET
                         last_synced_at = datetime('now'),
                         file_count = 0,
                         save_size_bytes = 0,
                         state = 'empty'",
                        params![
                            new_profile_id,
                            gid,
                            new_prof_cur.to_string_lossy(),
                        ],
                    );
                }
            }
        }

        Ok(())
    }
}
