use crate::commands::save_manager::error::{SaveManagerError, SaveResult};
use crate::commands::save_manager::fs_ops::{
    expand_save_path, scan_path_file_stats,
};
use crate::commands::save_manager::snapshots::SnapshotEngine;
use crate::commands::save_manager::transaction::TransactionCoordinator;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveArchiveLocationMeta {
    pub location_id: String,
    pub raw_path: String,
    pub location_type: String,
    pub archive_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveArchiveManifest {
    pub version: u32,
    pub game_id: String,
    pub game_name: String,
    pub profile_id: String,
    pub profile_name: String,
    pub created_at: String,
    pub app_version: String,
    pub file_count: usize,
    pub total_uncompressed_bytes: u64,
    pub locations: Vec<SaveArchiveLocationMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportSaveResult {
    pub output_path: String,
    pub file_count: usize,
    pub total_bytes: u64,
    pub archive_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreSaveResult {
    pub restored_files: usize,
    pub restored_bytes: u64,
    pub game_id: String,
    pub profile_id: String,
}

fn get_active_profile_id_internal(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'active_profile_id'",
        [],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "default".to_string())
}

pub fn compute_default_save_backup_path(
    game_title: &str,
    profile_name: &str,
) -> PathBuf {
    let base_dir = dirs::document_dir()
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("Nexus")
        .join("Backups")
        .join("Saves");

    let _ = fs::create_dir_all(&base_dir);

    let clean_game: String = game_title
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let clean_profile: String = profile_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();

    let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    let file_name = format!("{clean_game}_Save_{clean_profile}_{timestamp}.zip");

    base_dir.join(file_name)
}

/// Creates a compressed `.zip` archive containing the game's save files for a specific user profile.
pub fn export_save_to_zip(
    conn: &Connection,
    game_id: &str,
    profile_id: Option<&str>,
    dest_path: &Path,
) -> SaveResult<ExportSaveResult> {
    let active_prof = get_active_profile_id_internal(conn);
    let prof_id = profile_id.unwrap_or(&active_prof);

    // Get game title
    let game_title: String = conn
        .query_row("SELECT title FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
        .map_err(|_| SaveManagerError::Other(format!("Game not found: {game_id}")))?;

    // Get profile name
    let profile_name: String = conn
        .query_row("SELECT name FROM profiles WHERE id = ?1", params![prof_id], |r| r.get(0))
        .unwrap_or_else(|_| "Main Player".to_string());

    let enabled_locs = TransactionCoordinator::get_enabled_save_locations(conn, game_id)?;
    if enabled_locs.is_empty() {
        return Err(SaveManagerError::Other(
            "No configured save locations found for this game.".into(),
        ));
    }

    let is_active = prof_id == active_prof;
    let mut loc_sources: Vec<(String, String, String, PathBuf)> = Vec::new();
    let mut total_files_found = 0usize;
    let mut total_uncompressed_bytes = 0u64;

    for loc in &enabled_locs {
        let mut source_dir = if is_active {
            let os_path = expand_save_path(&loc.raw_path);
            if os_path.exists() {
                let mut seen = HashSet::new();
                let (fc, sz) = scan_path_file_stats(&os_path, &mut seen);
                if fc > 0 {
                    total_files_found += fc as usize;
                    total_uncompressed_bytes += sz as u64;
                    os_path
                } else {
                    let prof_cur = TransactionCoordinator::get_profile_current_path(prof_id, game_id, &loc.id);
                    if prof_cur.exists() {
                        let (pfc, psz) = scan_path_file_stats(&prof_cur, &mut seen);
                        total_files_found += pfc as usize;
                        total_uncompressed_bytes += psz as u64;
                    }
                    prof_cur
                }
            } else {
                let prof_cur = TransactionCoordinator::get_profile_current_path(prof_id, game_id, &loc.id);
                if prof_cur.exists() {
                    let mut seen = HashSet::new();
                    let (pfc, psz) = scan_path_file_stats(&prof_cur, &mut seen);
                    total_files_found += pfc as usize;
                    total_uncompressed_bytes += psz as u64;
                }
                prof_cur
            }
        } else {
            let prof_cur = TransactionCoordinator::get_profile_current_path(prof_id, game_id, &loc.id);
            if prof_cur.exists() {
                let mut seen = HashSet::new();
                let (pfc, psz) = scan_path_file_stats(&prof_cur, &mut seen);
                total_files_found += pfc as usize;
                total_uncompressed_bytes += psz as u64;
            }
            prof_cur
        };

        if !source_dir.exists() {
            // Also check raw os_path as fallback
            let fallback_os = expand_save_path(&loc.raw_path);
            if fallback_os.exists() {
                source_dir = fallback_os;
            }
        }

        loc_sources.push((
            loc.id.clone(),
            loc.raw_path.clone(),
            loc.location_type.clone(),
            source_dir,
        ));
    }

    if total_files_found == 0 {
        return Err(SaveManagerError::Other(
            format!("No save files found on disk for profile '{profile_name}'. Please launch and play the game to create a save first.")
        ));
    }

    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let file = File::create(dest_path).map_err(|e| {
        SaveManagerError::IoError(format!("Failed to create backup file {}: {e}", dest_path.display()))
    })?;

    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated);

    // Build Manifest
    let mut manifest_locations = Vec::new();
    for (id, raw, loc_type, _) in &loc_sources {
        manifest_locations.push(SaveArchiveLocationMeta {
            location_id: id.clone(),
            raw_path: raw.clone(),
            location_type: loc_type.clone(),
            archive_dir: format!("data/{id}"),
        });
    }

    let manifest = SaveArchiveManifest {
        version: 1,
        game_id: game_id.to_string(),
        game_name: game_title,
        profile_id: prof_id.to_string(),
        profile_name,
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: "Nexus Launcher 0.4.0".to_string(),
        file_count: total_files_found,
        total_uncompressed_bytes,
        locations: manifest_locations,
    };

    let manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|e| {
        SaveManagerError::Other(format!("Failed to serialize manifest: {e}"))
    })?;

    zip.start_file("manifest.json", options).map_err(|e| {
        SaveManagerError::Other(format!("Failed to write manifest to zip: {e}"))
    })?;
    zip.write_all(&manifest_bytes)?;

    let mut written_files = 0usize;
    let mut written_bytes = 0u64;

    for (loc_id, _, _, src_dir) in &loc_sources {
        if !src_dir.exists() {
            continue;
        }

        if src_dir.is_file() {
            let file_name = src_dir
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "save.dat".to_string());
            let entry_name = format!("data/{loc_id}/{file_name}");

            zip.start_file(&entry_name, options).map_err(|e| {
                SaveManagerError::Other(format!("Failed to add entry {entry_name}: {e}"))
            })?;

            let mut in_file = File::open(src_dir)?;
            let bytes = std::io::copy(&mut in_file, &mut zip)?;
            written_files += 1;
            written_bytes += bytes;
        } else {
            let walker = WalkDir::new(src_dir).into_iter();
            for entry in walker.filter_map(Result::ok) {
                let path = entry.path();
                let rel = match path.strip_prefix(src_dir) {
                    Ok(r) => r,
                    Err(_) => continue,
                };

                let rel_str = rel.to_string_lossy().replace('\\', "/");
                if rel_str.is_empty() {
                    continue;
                }

                let entry_name = format!("data/{loc_id}/{rel_str}");

                if entry.file_type().is_dir() {
                    let _ = zip.add_directory(format!("{entry_name}/"), options);
                } else {
                    zip.start_file(&entry_name, options).map_err(|e| {
                        SaveManagerError::Other(format!("Failed to add entry {entry_name}: {e}"))
                    })?;
                    let mut in_file = File::open(path)?;
                    let bytes = std::io::copy(&mut in_file, &mut zip)?;
                    written_files += 1;
                    written_bytes += bytes;
                }
            }
        }
    }

    zip.finish().map_err(|e| {
        SaveManagerError::Other(format!("Failed to finalize zip file: {e}"))
    })?;

    let archive_size_bytes = dest_path.metadata().map(|m| m.len()).unwrap_or(0);

    Ok(ExportSaveResult {
        output_path: dest_path.to_string_lossy().to_string(),
        file_count: written_files,
        total_bytes: written_bytes,
        archive_size_bytes,
    })
}

/// Inspects a `.zip` save archive and reads its metadata without extracting.
pub fn inspect_save_zip(archive_path: &Path) -> SaveResult<SaveArchiveManifest> {
    if !archive_path.exists() {
        return Err(SaveManagerError::SavePathNotFound(format!(
            "Backup file does not exist: {}",
            archive_path.display()
        )));
    }

    let file = File::open(archive_path).map_err(|e| {
        SaveManagerError::IoError(format!("Failed to open zip {}: {e}", archive_path.display()))
    })?;

    let mut zip = ZipArchive::new(file).map_err(|e| {
        SaveManagerError::Other(format!("Corrupt or invalid zip archive: {e}"))
    })?;

    // Attempt to read manifest.json
    if let Ok(mut entry) = zip.by_name("manifest.json") {
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_ok() {
            if let Ok(manifest) = serde_json::from_str::<SaveArchiveManifest>(&content) {
                return Ok(manifest);
            }
        }
    }

    // Fallback: build inspect metadata by analyzing entries in the archive
    let mut file_count = 0usize;
    let mut total_uncompressed_bytes = 0u64;

    for i in 0..zip.len() {
        if let Ok(entry) = zip.by_index(i) {
            if !entry.is_dir() && entry.name() != "manifest.json" {
                file_count += 1;
                total_uncompressed_bytes += entry.size();
            }
        }
    }

    let file_stem = archive_path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    Ok(SaveArchiveManifest {
        version: 1,
        game_id: String::new(),
        game_name: file_stem,
        profile_id: String::new(),
        profile_name: "Generic Backup".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        app_version: "Nexus Launcher".to_string(),
        file_count,
        total_uncompressed_bytes,
        locations: Vec::new(),
    })
}

/// Restores save files from a `.zip` archive into the target game's configured save locations for a profile.
pub fn restore_save_from_zip(
    conn: &Connection,
    game_id: &str,
    profile_id: Option<&str>,
    archive_path: &Path,
) -> SaveResult<RestoreSaveResult> {
    if !archive_path.exists() {
        return Err(SaveManagerError::SavePathNotFound(format!(
            "Backup archive not found: {}",
            archive_path.display()
        )));
    }

    let active_prof = get_active_profile_id_internal(conn);
    let prof_id = profile_id.unwrap_or(&active_prof);

    // Verify game exists
    let _game_title: String = conn
        .query_row("SELECT title FROM games WHERE id = ?1", params![game_id], |r| r.get(0))
        .map_err(|_| SaveManagerError::Other(format!("Game not found: {game_id}")))?;

    let mut enabled_locs = TransactionCoordinator::get_enabled_save_locations(conn, game_id)?;

    let file = File::open(archive_path).map_err(|e| {
        SaveManagerError::IoError(format!("Failed to open zip archive: {e}"))
    })?;
    let mut zip = ZipArchive::new(file).map_err(|e| {
        SaveManagerError::Other(format!("Corrupt or invalid zip archive: {e}"))
    })?;

    // Try reading manifest from archive
    let manifest: Option<SaveArchiveManifest> = if let Ok(mut entry) = zip.by_name("manifest.json") {
        let mut content = String::new();
        if entry.read_to_string(&mut content).is_ok() {
            serde_json::from_str(&content).ok()
        } else {
            None
        }
    } else {
        None
    };

    // If game has no enabled save locations yet, try to auto-add from manifest
    if enabled_locs.is_empty() {
        if let Some(ref man) = manifest {
            for loc in &man.locations {
                let loc_id = uuid::Uuid::new_v4().to_string();
                let _ = conn.execute(
                    "INSERT INTO game_save_locations (id, game_id, path, location_type, detection_source, confidence, is_enabled)
                     VALUES (?1, ?2, ?3, ?4, 'manual', 100, 1)",
                    params![loc_id, game_id, loc.raw_path, loc.location_type],
                );
            }
            enabled_locs = TransactionCoordinator::get_enabled_save_locations(conn, game_id)?;
        }
    }

    if enabled_locs.is_empty() {
        return Err(SaveManagerError::Other(
            "Game has no configured save locations to restore into. Please add a save location first.".into(),
        ));
    }

    let is_active = prof_id == active_prof;

    // Build mapping: location_id -> target_dirs (we may write to both OS path and profile current path)
    let mut target_dirs: Vec<(String, Vec<PathBuf>)> = Vec::new();
    for loc in &enabled_locs {
        let mut dirs_for_loc = Vec::new();
        if is_active {
            let os_path = expand_save_path(&loc.raw_path);
            dirs_for_loc.push(os_path);
        }
        let prof_path = TransactionCoordinator::get_profile_current_path(prof_id, game_id, &loc.id);
        dirs_for_loc.push(prof_path);
        target_dirs.push((loc.id.clone(), dirs_for_loc));
    }

    // Safety snapshot before restore if existing files exist
    let mut snapshot_candidates: Vec<(&str, &Path, &str)> = Vec::new();
    for loc in &enabled_locs {
        let p = if is_active {
            expand_save_path(&loc.raw_path)
        } else {
            TransactionCoordinator::get_profile_current_path(prof_id, game_id, &loc.id)
        };
        if p.exists() {
            snapshot_candidates.push((&loc.id, Box::leak(Box::new(p)), ""));
        }
    }

    if !snapshot_candidates.is_empty() {
        let _ = SnapshotEngine::create_snapshot(
            prof_id,
            game_id,
            "Pre-restore automatic backup",
            false,
            &snapshot_candidates,
        );
    }

    let mut restored_files = 0usize;
    let mut restored_bytes = 0u64;

    for i in 0..zip.len() {
        let mut entry = zip.by_index(i).map_err(|e| {
            SaveManagerError::Other(format!("Failed reading zip entry #{i}: {e}"))
        })?;

        let entry_name = entry.name().to_string();
        if entry_name == "manifest.json" {
            continue;
        }

        // Determine destination targets
        let (loc_id_opt, rel_path) = if let Some(stripped) = entry_name.strip_prefix("data/") {
            if let Some((loc_id, sub)) = stripped.split_once('/') {
                (Some(loc_id.to_string()), PathBuf::from(sub))
            } else {
                (None, PathBuf::from(stripped))
            }
        } else {
            (None, PathBuf::from(&entry_name))
        };

        let matched_targets: Vec<PathBuf> = match loc_id_opt {
            Some(ref lid) => {
                target_dirs
                    .iter()
                    .find(|(id, _)| id == lid)
                    .map(|(_, paths)| paths.clone())
                    .unwrap_or_else(|| {
                        target_dirs.first().map(|(_, p)| p.clone()).unwrap_or_default()
                    })
            }
            None => {
                target_dirs.first().map(|(_, p)| p.clone()).unwrap_or_default()
            }
        };

        if matched_targets.is_empty() {
            continue;
        }

        if entry.is_dir() {
            for target_base in &matched_targets {
                let out_dir = target_base.join(&rel_path);
                if out_dir.starts_with(target_base) {
                    let _ = fs::create_dir_all(&out_dir);
                }
            }
        } else {
            let mut file_content = Vec::with_capacity(entry.size() as usize);
            entry.read_to_end(&mut file_content)?;

            for target_base in &matched_targets {
                let out_file = target_base.join(&rel_path);
                if !out_file.starts_with(target_base) {
                    continue; // Skip zip slip
                }

                if let Some(parent) = out_file.parent() {
                    let _ = fs::create_dir_all(parent);
                }

                let mut dst = File::create(&out_file)?;
                dst.write_all(&file_content)?;
            }

            restored_files += 1;
            restored_bytes += file_content.len() as u64;
        }
    }

    // Refresh and sync live stats in DB
    let primary_path = target_dirs
        .first()
        .and_then(|(_, p)| p.first())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_default();

    let _ = conn.execute(
        "INSERT INTO profile_game_saves (profile_id, game_id, current_path, file_count, save_size_bytes, state, last_synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'ready', datetime('now'))
         ON CONFLICT(profile_id, game_id) DO UPDATE SET
         current_path = ?3,
         file_count = ?4,
         save_size_bytes = ?5,
         state = 'ready',
         last_synced_at = datetime('now')",
        params![prof_id, game_id, primary_path, restored_files as i64, restored_bytes as i64],
    );

    Ok(RestoreSaveResult {
        restored_files,
        restored_bytes,
        game_id: game_id.to_string(),
        profile_id: prof_id.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_default_save_backup_path() {
        let path = compute_default_save_backup_path("Cyberpunk 2077", "Player 1");
        let path_str = path.to_string_lossy();
        assert!(path_str.contains("Cyberpunk_2077"));
        assert!(path_str.contains("Player_1"));
        assert!(path_str.ends_with(".zip"));
    }
}
