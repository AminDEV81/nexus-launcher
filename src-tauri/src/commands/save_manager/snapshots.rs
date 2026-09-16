use crate::commands::save_manager::error::{SaveManagerError, SaveResult};
use crate::commands::save_manager::fs_ops::{
    calculate_tree_hash, copy_dir_recursive, flush_file_or_dir_buffers,
    get_nexus_profiles_root, remove_path_all_with_retry, verify_disk_space,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotLocationMeta {
    pub location_id: String,
    pub original_path: String,
    pub hash: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveSnapshot {
    pub id: String,
    pub profile_id: String,
    pub game_id: String,
    pub created_at: String,
    pub label: String,
    pub total_size_bytes: u64,
    pub tree_hash: String,
    pub is_permanent: bool,
    pub locations: Vec<SnapshotLocationMeta>,
}

pub struct SnapshotEngine;

impl SnapshotEngine {
    pub fn get_snapshots_dir(profile_id: &str, game_id: &str) -> PathBuf {
        get_nexus_profiles_root()
            .join(profile_id)
            .join("games")
            .join(game_id)
            .join("snapshots")
    }

    pub fn get_snapshot_dir(profile_id: &str, game_id: &str, snapshot_id: &str) -> PathBuf {
        Self::get_snapshots_dir(profile_id, game_id).join(snapshot_id)
    }

    /// Creates and verifies a snapshot for all configured save locations of a game (Section 8).
    pub fn create_snapshot(
        profile_id: &str,
        game_id: &str,
        label: &str,
        is_permanent: bool,
        locations: &[(&str, &Path, &str)], // (location_id, src_path, expected_hash)
    ) -> SaveResult<SaveSnapshot> {
        let snapshot_id = uuid::Uuid::new_v4().to_string();
        let snap_dir = Self::get_snapshot_dir(profile_id, game_id, &snapshot_id);

        // Calculate required space
        let mut total_req_bytes = 0u64;
        for (_, src_path, _) in locations {
            if src_path.exists() {
                let th = calculate_tree_hash(src_path)?;
                total_req_bytes += th.total_size;
            }
        }

        // Preflight disk check
        verify_disk_space(&snap_dir, total_req_bytes)?;
        fs::create_dir_all(&snap_dir)?;

        let mut loc_metas = Vec::new();
        let mut combined_hash_input = String::new();
        let mut overall_size = 0u64;

        for (loc_id, src_path, expected_hash) in locations {
            let loc_dest = snap_dir.join(loc_id);
            if src_path.exists() {
                copy_dir_recursive(src_path, &loc_dest)?;
                flush_file_or_dir_buffers(&loc_dest)?;

                let snap_th = calculate_tree_hash(&loc_dest)?;
                if &snap_th.hash != expected_hash {
                    let _ = remove_path_all_with_retry(&snap_dir);
                    return Err(SaveManagerError::SnapshotVerificationFailed(format!(
                        "Snapshot verification failed for location {}: expected {}, got {}",
                        loc_id, expected_hash, snap_th.hash
                    )));
                }

                combined_hash_input.push_str(&format!("{}:{}:{}\n", loc_id, snap_th.total_size, snap_th.hash));
                overall_size += snap_th.total_size;

                loc_metas.push(SnapshotLocationMeta {
                    location_id: loc_id.to_string(),
                    original_path: src_path.to_string_lossy().to_string(),
                    hash: snap_th.hash,
                    size_bytes: snap_th.total_size,
                });
            } else {
                // Empty location
                loc_metas.push(SnapshotLocationMeta {
                    location_id: loc_id.to_string(),
                    original_path: src_path.to_string_lossy().to_string(),
                    hash: "empty".to_string(),
                    size_bytes: 0,
                });
            }
        }

        let overall_hash = if combined_hash_input.is_empty() {
            "empty".to_string()
        } else {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(combined_hash_input.as_bytes());
            hex::encode(hasher.finalize())
        };

        let now = chrono::Utc::now().to_rfc3339();
        let snapshot = SaveSnapshot {
            id: snapshot_id,
            profile_id: profile_id.to_string(),
            game_id: game_id.to_string(),
            created_at: now,
            label: label.to_string(),
            total_size_bytes: overall_size,
            tree_hash: overall_hash,
            is_permanent,
            locations: loc_metas,
        };

        // Write snapshot.json manifest
        let meta_file = snap_dir.join("snapshot.json");
        let json_data = serde_json::to_string_pretty(&snapshot)
            .map_err(|e| SaveManagerError::IoError(e.to_string()))?;
        let mut f = File::create(&meta_file)?;
        f.write_all(json_data.as_bytes())?;
        f.sync_all()?;

        Ok(snapshot)
    }

    /// Lists all snapshots for a given (profile_id, game_id) ordered from newest to oldest.
    pub fn list_snapshots(profile_id: &str, game_id: &str) -> SaveResult<Vec<SaveSnapshot>> {
        let snap_root = Self::get_snapshots_dir(profile_id, game_id);
        if !snap_root.exists() {
            return Ok(Vec::new());
        }

        let mut snapshots = Vec::new();
        for entry in fs::read_dir(&snap_root)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                let meta_file = path.join("snapshot.json");
                if meta_file.exists() {
                    if let Ok(content) = fs::read_to_string(&meta_file) {
                        if let Ok(snap) = serde_json::from_str::<SaveSnapshot>(&content) {
                            snapshots.push(snap);
                        }
                    }
                }
            }
        }

        // Sort descending by created_at
        snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(snapshots)
    }

    /// Lists all snapshots for a game across ALL profiles ordered from newest to oldest.
    pub fn list_all_snapshots(game_id: &str) -> SaveResult<Vec<SaveSnapshot>> {
        let prof_root = get_nexus_profiles_root();
        if !prof_root.exists() {
            return Ok(Vec::new());
        }

        let mut snapshots = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();

        if let Ok(entries) = fs::read_dir(&prof_root) {
            for entry in entries.flatten() {
                let pid = entry.file_name().to_string_lossy().to_string();
                if let Ok(list) = Self::list_snapshots(&pid, game_id) {
                    for s in list {
                        if seen_ids.insert(s.id.clone()) {
                            snapshots.push(s);
                        }
                    }
                }
            }
        }

        snapshots.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(snapshots)
    }

    /// Applies snapshot retention and size guard policies (Section 8).
    /// Retention count from settings.snapshot_retention_count (default 10).
    /// Size threshold from settings.snapshot_size_threshold_bytes (default 2GB).
    /// Never prunes permanent snapshots.
    /// Pruning floor: 3 retained snapshots minimum.
    pub fn prune_snapshots(
        conn: &Connection,
        profile_id: &str,
        game_id: &str,
    ) -> SaveResult<()> {
        let retention_count: usize = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'snapshot_retention_count'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(10);

        let size_threshold_bytes: u64 = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'snapshot_size_threshold_bytes'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(2 * 1024 * 1024 * 1024); // 2GB

        let snapshots = Self::list_snapshots(profile_id, game_id)?;
        if snapshots.is_empty() {
            return Ok(());
        }

        let mut non_permanent: Vec<&SaveSnapshot> = snapshots
            .iter()
            .filter(|s| !s.is_permanent)
            .collect();

        // 1. Retention count pruning (keep newest `retention_count`)
        if non_permanent.len() > retention_count {
            let to_remove = &non_permanent[retention_count..];
            for snap in to_remove {
                let snap_dir = Self::get_snapshot_dir(profile_id, game_id, &snap.id);
                let _ = remove_path_all_with_retry(&snap_dir);
            }
            non_permanent.truncate(retention_count);
        }

        // 2. Size guard pruning down to floor of 3
        let current_snapshots = Self::list_snapshots(profile_id, game_id)?;
        let mut total_size: u64 = current_snapshots.iter().map(|s| s.total_size_bytes).sum();

        if total_size > size_threshold_bytes {
            let mut prunable: Vec<&SaveSnapshot> = current_snapshots
                .iter()
                .filter(|s| !s.is_permanent)
                .collect();
            // Oldest are at the end (descending created_at)
            while prunable.len() > 3 && total_size > size_threshold_bytes {
                if let Some(oldest) = prunable.pop() {
                    let snap_dir = Self::get_snapshot_dir(profile_id, game_id, &oldest.id);
                    let _ = remove_path_all_with_retry(&snap_dir);
                    total_size = total_size.saturating_sub(oldest.total_size_bytes);
                } else {
                    break;
                }
            }

            if total_size > size_threshold_bytes {
                log::warn!(
                    "Snapshot size ({} bytes) still exceeds threshold ({} bytes) after pruning to floor of 3 for ({}, {})",
                    total_size, size_threshold_bytes, profile_id, game_id
                );
            }
        }

        Ok(())
    }

    /// Deletes a snapshot by ID if not marked permanent.
    pub fn delete_snapshot(
        profile_id: &str,
        game_id: &str,
        snapshot_id: &str,
    ) -> SaveResult<()> {
        let mut snap_dir = Self::get_snapshot_dir(profile_id, game_id, snapshot_id);
        if !snap_dir.exists() {
            let prof_root = get_nexus_profiles_root();
            if let Ok(entries) = fs::read_dir(&prof_root) {
                for entry in entries.flatten() {
                    let candidate = entry.path().join("games").join(game_id).join("snapshots").join(snapshot_id);
                    if candidate.exists() {
                        snap_dir = candidate;
                        break;
                    }
                }
            }
        }
        let meta_file = snap_dir.join("snapshot.json");
        if meta_file.exists() {
            if let Ok(content) = fs::read_to_string(&meta_file) {
                if let Ok(snap) = serde_json::from_str::<SaveSnapshot>(&content) {
                    if snap.is_permanent {
                        return Err(SaveManagerError::IoError(
                            "Cannot delete a permanent snapshot".to_string(),
                        ));
                    }
                }
            }
        }

        remove_path_all_with_retry(&snap_dir)
    }
}
