use super::models::{SoundtrackLocalFile, SoundtrackScanProgress};
use crate::db::Database;
use crate::error::AppResult;
use rusqlite::params;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;
use walkdir::WalkDir;

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus"];

fn normalize_name(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn scan_directories(
    app: AppHandle,
    db: tauri::State<'_, Database>,
    paths: Vec<PathBuf>,
) -> AppResult<Vec<SoundtrackLocalFile>> {
    // 1. Load library games for matching
    let games: Vec<(String, String, String)> = {
        let conn = db.connection.lock().expect("db mutex poisoned");
        let mut stmt = conn.prepare("SELECT id, name FROM games")?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let norm = normalize_name(&name);
            Ok((id, name, norm))
        })?;
        rows.filter_map(Result::ok).collect()
    };

    let mut found_files = Vec::new();

    for root in paths {
        if !root.exists() {
            continue;
        }

        for entry in WalkDir::new(&root)
            .follow_links(true)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() {
                continue;
            }

            let path = entry.path();
            let ext = match path.extension().and_then(|e| e.to_str()) {
                Some(e) => e.to_lowercase(),
                None => continue,
            };

            if !AUDIO_EXTENSIONS.contains(&ext.as_str()) {
                continue;
            }

            let file_size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
            let file_path_str = path.to_string_lossy().to_string();

            // Extract title and possible album/game from path
            let file_stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown");
            let mut title = file_stem.to_string();

            // Strip track number prefix if present, e.g. "01 - Title" or "01. Title"
            if let Some(pos) = title.find(" - ") {
                let prefix = &title[..pos];
                if prefix.chars().all(|c| c.is_numeric() || c == ' ') {
                    title = title[pos + 3..].trim().to_string();
                }
            } else if let Some(pos) = title.find(". ") {
                let prefix = &title[..pos];
                if prefix.chars().all(|c| c.is_numeric() || c == ' ') {
                    title = title[pos + 2..].trim().to_string();
                }
            }

            // Folder hierarchy: .../Game Name/Album Name/Track.ext
            let mut detected_album = None;
            let mut detected_game_id = None;

            if let Some(parent) = path.parent() {
                let folder_name = parent.file_name().and_then(|n| n.to_str()).unwrap_or("");
                detected_album = Some(folder_name.to_string());

                let norm_folder = normalize_name(folder_name);

                // Try to match parent folder to game name
                for (g_id, _g_name, g_norm) in &games {
                    if !g_norm.is_empty() && (norm_folder.contains(g_norm) || g_norm.contains(&norm_folder)) {
                        detected_game_id = Some(g_id.clone());
                        break;
                    }
                }

                // If not matched, try grandparent folder
                if detected_game_id.is_none() {
                    if let Some(grandparent) = parent.parent() {
                        let grand_folder = grandparent.file_name().and_then(|n| n.to_str()).unwrap_or("");
                        let norm_grand = normalize_name(grand_folder);
                        for (g_id, _g_name, g_norm) in &games {
                            if !g_norm.is_empty() && (norm_grand.contains(g_norm) || g_norm.contains(&norm_grand)) {
                                detected_game_id = Some(g_id.clone());
                                break;
                            }
                        }
                    }
                }
            }

            let local_file = SoundtrackLocalFile {
                id: Uuid::new_v4().to_string(),
                file_path: file_path_str,
                file_size,
                game_id: detected_game_id,
                album_id: None,
                track_id: None,
                title: Some(title),
                artist: None,
                album: detected_album,
                duration_ms: 0,
                format: Some(ext),
                scanned_at: chrono::Utc::now().to_rfc3339(),
            };

            found_files.push(local_file);
        }
    }

    // Persist to database
    {
        let conn = db.connection.lock().expect("db mutex poisoned");
        for file in &found_files {
            let _ = conn.execute(
                "INSERT INTO soundtrack_local_files (
                    id, file_path, file_size, game_id, album_id, track_id,
                    title, artist, album, duration_ms, format, scanned_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'))
                ON CONFLICT(file_path) DO UPDATE SET
                    file_size = excluded.file_size,
                    game_id = COALESCE(excluded.game_id, soundtrack_local_files.game_id),
                    title = excluded.title,
                    album = excluded.album,
                    scanned_at = datetime('now')",
                params![
                    file.id,
                    file.file_path,
                    file.file_size,
                    file.game_id,
                    file.album_id,
                    file.track_id,
                    file.title,
                    file.artist,
                    file.album,
                    file.duration_ms,
                    file.format,
                ],
            );
        }
    }

    let _ = app.emit(
        "soundtrack-scan-complete",
        SoundtrackScanProgress {
            current_path: "".into(),
            files_found: found_files.len(),
            files_processed: found_files.len(),
            is_complete: true,
        },
    );

    Ok(found_files)
}
