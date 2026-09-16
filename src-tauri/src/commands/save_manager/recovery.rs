use crate::commands::save_manager::error::SaveResult;
use crate::commands::save_manager::fs_ops::{
    calculate_tree_hash, expand_save_path, get_nexus_profiles_root, remove_path_all_with_retry,
};
use crate::commands::save_manager::journal::JournalManager;
use crate::commands::save_manager::transaction::TransactionCoordinator;
use rusqlite::{params, Connection};
use std::path::PathBuf;

pub struct CrashRecoveryEngine;

impl CrashRecoveryEngine {
    /// Inspects and recovers all non-terminal journal operations at startup (Section 6).
    /// Safe to re-run an unbounded number of times (idempotent).
    pub fn recover_interrupted_operations(conn: &Connection) -> SaveResult<usize> {
        let active_ops = JournalManager::get_non_terminal_operations(conn)?;
        let count = active_ops.len();

        for op in active_ops {
            log::info!(
                "Recovering interrupted save operation: id={}, type={}, state={}",
                op.id, op.operation_type, op.state
            );

            let profile_id = op.profile_id.as_deref().unwrap_or("default");
            let game_id = op.game_id.as_deref().unwrap_or("unknown");

            let staging_root = get_nexus_profiles_root()
                .join(profile_id)
                .join("games")
                .join(game_id)
                .join("staging")
                .join(&op.id);

            match op.state.as_str() {
                "started" | "validated" | "preflight_verified" => {
                    // No filesystem mutation occurred. Discard operation record.
                    let _ = remove_path_all_with_retry(&staging_root);
                    JournalManager::update_operation_state(conn, &op.id, "rolled_back")?;
                }

                "snapshot_created" => {
                    // Re-hash or discard incomplete snapshot/staging.
                    let _ = remove_path_all_with_retry(&staging_root);
                    JournalManager::update_operation_state(conn, &op.id, "rolled_back")?;
                }

                "snapshot_verified" | "staging_created" | "staging_verified" => {
                    // Staging exists but OS save/current save was never touched.
                    let _ = remove_path_all_with_retry(&staging_root);
                    JournalManager::update_operation_state(conn, &op.id, "rolled_back")?;
                }

                "commit_started" => {
                    // Mutation was in flight. Restore all locations from backup.
                    let _ = TransactionCoordinator::rollback_operation(conn, &op.id);
                    let _ = remove_path_all_with_retry(&staging_root);
                    JournalManager::update_operation_state(conn, &op.id, "rolled_back")?;
                }

                "commit_completed" => {
                    // Check whether all locations match staged_hash
                    let locations = JournalManager::get_operation_locations(conn, &op.id)?;
                    let mut all_match = true;

                    for loc in &locations {
                        let target_path: Option<PathBuf> = conn
                            .query_row(
                                "SELECT path FROM game_save_locations WHERE id = ?1",
                                params![loc.location_id],
                                |row| {
                                    let p: String = row.get(0)?;
                                    Ok(expand_save_path(&p))
                                },
                            )
                            .ok();

                        if let Some(target) = target_path {
                            if let Ok(th) = calculate_tree_hash(&target) {
                                if let Some(ref staged_h) = loc.staged_hash {
                                    if staged_h != "empty" && &th.hash != staged_h {
                                        all_match = false;
                                        break;
                                    }
                                } else {
                                    all_match = false;
                                    break;
                                }
                            } else {
                                all_match = false;
                                break;
                            }
                        } else {
                            all_match = false;
                            break;
                        }
                    }

                    if all_match && !locations.is_empty() {
                        // Advance to completed
                        JournalManager::update_operation_state(conn, &op.id, "final_verified")?;
                        JournalManager::update_operation_state(conn, &op.id, "completed")?;

                        if let (Some(ref pid), Some(ref gid)) = (&op.profile_id, &op.game_id) {
                            let mut total_file_count = 0usize;
                            let mut total_size_bytes = 0u64;
                            let mut combined_hash = String::new();
                            let primary_path = TransactionCoordinator::get_profile_current_path(pid, gid, &locations[0].location_id);

                            for loc in &locations {
                                let profile_cur = TransactionCoordinator::get_profile_current_path(pid, gid, &loc.location_id);
                                if let Ok(th) = calculate_tree_hash(&profile_cur) {
                                    total_file_count += th.file_count;
                                    total_size_bytes += th.total_size;
                                    combined_hash.push_str(&th.hash);
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
                                    pid,
                                    gid,
                                    primary_path.to_string_lossy(),
                                    total_file_count as i64,
                                    total_size_bytes as i64,
                                    content_hash,
                                ],
                            );
                        }
                    } else {
                        // Inconsistency found -> rollback all
                        let _ = TransactionCoordinator::rollback_operation(conn, &op.id);
                        JournalManager::update_operation_state(conn, &op.id, "rolled_back")?;
                    }
                    let _ = remove_path_all_with_retry(&staging_root);
                }

                "rollback_required" => {
                    // Resume rollback
                    let _ = TransactionCoordinator::rollback_operation(conn, &op.id);
                    let _ = remove_path_all_with_retry(&staging_root);
                    JournalManager::update_operation_state(conn, &op.id, "rolled_back")?;
                }

                _ => {
                    // Any other state -> cleanup and mark recovered
                    let _ = remove_path_all_with_retry(&staging_root);
                    JournalManager::update_operation_state(conn, &op.id, "recovered")?;
                }
            }
        }

        Ok(count)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE save_operations (
                id TEXT PRIMARY KEY,
                schema_version INTEGER NOT NULL DEFAULT 1,
                operation_type TEXT NOT NULL,
                game_id TEXT,
                profile_id TEXT,
                state TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                error_code TEXT,
                error_message TEXT
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE save_operation_locations (
                operation_id TEXT NOT NULL,
                location_id TEXT NOT NULL,
                original_hash TEXT,
                staged_hash TEXT,
                final_hash TEXT,
                state TEXT NOT NULL,
                backup_path TEXT,
                staging_path TEXT,
                PRIMARY KEY (operation_id, location_id)
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE game_save_locations (
                id TEXT PRIMARY KEY,
                game_id TEXT NOT NULL,
                path TEXT NOT NULL,
                location_type TEXT NOT NULL,
                detection_source TEXT NOT NULL,
                confidence INTEGER NOT NULL,
                is_enabled INTEGER NOT NULL
            )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_recover_started_operation() {
        let conn = setup_test_db();
        let op_id = JournalManager::create_operation(&conn, "prepare_launch", Some("g1"), Some("p1")).unwrap();

        let count = CrashRecoveryEngine::recover_interrupted_operations(&conn).unwrap();
        assert_eq!(count, 1);

        let op = JournalManager::get_operation(&conn, &op_id).unwrap().unwrap();
        assert_eq!(op.state, "rolled_back");
    }
}

