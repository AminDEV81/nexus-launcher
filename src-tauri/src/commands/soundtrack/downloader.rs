use crate::db::Database;
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use rusqlite::params;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use super::models::{DownloadCompletePayload, DownloadSoundtrackRequest, SoundtrackDownloadProgress};

const TICK_INTERVAL: Duration = Duration::from_millis(200);

pub struct ActiveDownloadTask {
    pub cancel: CancellationToken,
    pub delete_partial: AtomicBool,
}

#[derive(Default)]
pub struct SoundtrackDownloadState {
    pub active: Mutex<HashMap<String, Arc<ActiveDownloadTask>>>,
}

/// Sanitize filename/folder name to be safe on Windows/POSIX and prevent path traversal
#[allow(dead_code)]
pub fn sanitize_filename(name: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let sanitized: String = name
        .chars()
        .map(|c| if invalid.contains(&c) || c.is_control() { '_' } else { c })
        .collect();
    let trimmed = sanitized.trim().trim_matches('.');
    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

pub fn get_default_soundtrack_dir() -> PathBuf {
    if let Some(music_dir) = dirs::audio_dir() {
        music_dir.join("Nexus").join("Soundtracks")
    } else if let Some(home) = dirs::home_dir() {
        home.join("Music").join("Nexus").join("Soundtracks")
    } else {
        PathBuf::from("Soundtracks")
    }
}

fn is_within_soundtrack_root(target: &Path, allowed_root: &Path) -> bool {
    let norm_target = target
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    let norm_root = allowed_root
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    if norm_root.is_empty() || norm_target == norm_root {
        return false;
    }
    norm_target.starts_with(&norm_root) && norm_target[norm_root.len()..].starts_with('\\')
}

pub async fn start_download(
    app: AppHandle,
    db: tauri::State<'_, Database>,
    state: tauri::State<'_, SoundtrackDownloadState>,
    req: DownloadSoundtrackRequest,
) -> AppResult<()> {
    let trimmed_url = req.url.trim();
    let parsed_url = reqwest::Url::parse(trimmed_url)
        .map_err(|_| AppError::Invalid("Invalid soundtrack download URL.".into()))?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err(AppError::Invalid(
            "Soundtrack download URL must use http or https.".into(),
        ));
    }
    let Some(host) = parsed_url.host_str() else {
        return Err(AppError::Invalid("Soundtrack URL is missing a host.".into()));
    };
    if crate::commands::profiles::is_blocked_host_or_ip(host) {
        return Err(AppError::Invalid(
            "Private or local network URLs are not permitted.".into(),
        ));
    }

    let path = PathBuf::from(&req.target_path);
    if path
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err(AppError::Invalid(
            "Invalid target path: path traversal is not allowed.".into(),
        ));
    }
    let valid_audio_ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "mp3" | "flac" | "ogg" | "m4a" | "wav" | "opus" | "webm" | "aac"
            )
        })
        .unwrap_or(false);
    if !valid_audio_ext {
        return Err(AppError::Invalid(
            "Target soundtrack file must have a valid audio extension (.mp3, .flac, .m4a, .ogg, .wav, .opus).".into(),
        ));
    }

    // Verify target_path resides inside the configured soundtrack download directory
    let configured_root: PathBuf = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'soundtrack_download_dir'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(get_default_soundtrack_dir)
    };
    let default_root = get_default_soundtrack_dir();
    if !is_within_soundtrack_root(&path, &configured_root)
        && !is_within_soundtrack_root(&path, &default_root)
    {
        return Err(AppError::Invalid(
            "Target soundtrack path must reside inside the configured soundtrack download directory.".into(),
        ));
    }

    // Atomically check and register active download task
    let cancel = CancellationToken::new();
    let task_ref = Arc::new(ActiveDownloadTask {
        cancel: cancel.clone(),
        delete_partial: AtomicBool::new(false),
    });
    {
        let mut active_map = state.active.lock().unwrap_or_else(|e| e.into_inner());
        if active_map.contains_key(&req.download_id) {
            return Ok(());
        }
        active_map.insert(req.download_id.clone(), task_ref.clone());
    }

    // Ensure parent directory exists
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Upsert row in soundtrack_downloads
    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "INSERT INTO soundtrack_downloads (
                id, track_id, album_id, game_id, url, save_path,
                total_bytes, downloaded_bytes, status, speed_bps,
                created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, 'downloading', 0, datetime('now'), datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
                status = 'downloading',
                error_message = NULL,
                updated_at = datetime('now')",
            params![
                req.download_id,
                req.track_id,
                req.album_id,
                req.game_id,
                req.url,
                req.target_path
            ],
        )?;
    }

    let app_clone = app.clone();
    let download_id_clone = req.download_id.clone();
    let track_id_clone = req.track_id.clone();
    let album_id_clone = req.album_id.clone();
    let target_path_clone = req.target_path.clone();
    let url_clone = req.url.clone();

    tokio::spawn(async move {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300))
            .redirect(crate::commands::profiles::safe_ssrf_redirect_policy())
            .build()
            .unwrap_or_default();

        // Check if a partial file exists on disk so we can resume with HTTP Range
        let existing_bytes = fs::metadata(&target_path_clone)
            .map(|m| if m.is_file() { m.len() } else { 0 })
            .unwrap_or(0);

        let mut request_builder = client.get(&url_clone);
        if existing_bytes > 0 {
            request_builder = request_builder.header(
                reqwest::header::RANGE,
                format!("bytes={existing_bytes}-"),
            );
        }

        let resp_result = request_builder.send().await;
        let resp = match resp_result {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                let err_msg = format!("HTTP {}", r.status());
                fail_download(&app_clone, &download_id_clone, &target_path_clone, &err_msg).await;
                return;
            }
            Err(e) => {
                let err_msg = e.to_string();
                fail_download(&app_clone, &download_id_clone, &target_path_clone, &err_msg).await;
                return;
            }
        };

        let is_partial_content = resp.status().as_u16() == 206 && existing_bytes > 0;
        let (mut file, mut downloaded_bytes, total_bytes) = if is_partial_content {
            let content_len = resp.content_length().unwrap_or(0) as i64;
            let total = (existing_bytes as i64) + content_len;
            match OpenOptions::new().create(true).append(true).open(&target_path_clone) {
                Ok(f) => (f, existing_bytes as i64, total),
                Err(e) => {
                    fail_download(&app_clone, &download_id_clone, &target_path_clone, &format!("File open failed: {e}")).await;
                    return;
                }
            }
        } else {
            let total = resp.content_length().unwrap_or(0) as i64;
            match File::create(&target_path_clone) {
                Ok(f) => (f, 0i64, total),
                Err(e) => {
                    fail_download(&app_clone, &download_id_clone, &target_path_clone, &format!("File create failed: {e}")).await;
                    return;
                }
            }
        };

        let mut stream = resp.bytes_stream();
        let mut last_tick = Instant::now();
        let mut bytes_since_tick = 0i64;
        let mut current_speed = 0i64;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    drop(file);
                    let should_delete = task_ref.delete_partial.load(Ordering::SeqCst);
                    let final_status = if should_delete {
                        let _ = fs::remove_file(&target_path_clone);
                        "cancelled"
                    } else {
                        "paused"
                    };

                    if let Some(db_state) = app_clone.try_state::<Database>() {
                        let conn = db_state.connection.lock().unwrap_or_else(|e| e.into_inner());
                        if should_delete {
                            let _ = conn.execute(
                                "DELETE FROM soundtrack_downloads WHERE id = ?1",
                                params![&download_id_clone],
                            );
                        } else {
                            let _ = conn.execute(
                                "UPDATE soundtrack_downloads
                                 SET status = 'paused', downloaded_bytes = ?1, total_bytes = ?2, speed_bps = 0, updated_at = datetime('now')
                                 WHERE id = ?3",
                                params![downloaded_bytes, total_bytes, &download_id_clone],
                            );
                        }
                    }
                    if let Some(dl_state) = app_clone.try_state::<SoundtrackDownloadState>() {
                        let mut active = dl_state.active.lock().unwrap_or_else(|e| e.into_inner());
                        active.remove(&download_id_clone);
                    }
                    let _ = app_clone.emit("soundtrack-download-progress", SoundtrackDownloadProgress {
                        id: download_id_clone.clone(),
                        track_id: track_id_clone.clone(),
                        album_id: album_id_clone.clone(),
                        downloaded_bytes: if should_delete { 0 } else { downloaded_bytes },
                        total_bytes,
                        speed_bps: 0,
                        status: final_status.into(),
                        error_message: None,
                    });
                    return;
                }
                chunk_opt = stream.next() => {
                    match chunk_opt {
                        Some(Ok(chunk)) => {
                            if downloaded_bytes + (chunk.len() as i64) > 250 * 1024 * 1024 {
                                drop(file);
                                fail_download(&app_clone, &download_id_clone, &target_path_clone, "Soundtrack file exceeds 250 MB safety limit").await;
                                return;
                            }
                            if let Err(e) = file.write_all(&chunk) {
                                drop(file);
                                fail_download(&app_clone, &download_id_clone, &target_path_clone, &format!("Write failed: {e}")).await;
                                return;
                            }
                            let len = chunk.len() as i64;
                            downloaded_bytes += len;
                            bytes_since_tick += len;

                            let now = Instant::now();
                            if now.duration_since(last_tick) >= TICK_INTERVAL {
                                let elapsed = now.duration_since(last_tick).as_secs_f64();
                                if elapsed > 0.0 {
                                    current_speed = (bytes_since_tick as f64 / elapsed) as i64;
                                }
                                last_tick = now;
                                bytes_since_tick = 0;

                                let _ = app_clone.emit("soundtrack-download-progress", SoundtrackDownloadProgress {
                                    id: download_id_clone.clone(),
                                    track_id: track_id_clone.clone(),
                                    album_id: album_id_clone.clone(),
                                    downloaded_bytes,
                                    total_bytes,
                                    speed_bps: current_speed,
                                    status: "downloading".into(),
                                    error_message: None,
                                });
                            }
                        }
                        Some(Err(e)) => {
                            drop(file);
                            fail_download(&app_clone, &download_id_clone, &target_path_clone, &format!("Stream error: {e}")).await;
                            return;
                        }
                        None => {
                            // Download completed!
                            let _ = file.flush();
                            complete_download(
                                &app_clone,
                                &download_id_clone,
                                track_id_clone.as_deref(),
                                &target_path_clone,
                                downloaded_bytes,
                            ).await;
                            return;
                        }
                    }
                }
            }
        }
    });

    Ok(())
}

async fn fail_download(app: &AppHandle, download_id: &str, target_path: &str, error: &str) {
    let _ = fs::remove_file(target_path);
    if let Some(db) = app.try_state::<Database>() {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "UPDATE soundtrack_downloads
             SET status = 'failed', error_message = ?1, downloaded_bytes = 0, speed_bps = 0, updated_at = datetime('now')
             WHERE id = ?2",
            params![error, download_id],
        );
    }
    if let Some(state) = app.try_state::<SoundtrackDownloadState>() {
        let mut active = state.active.lock().unwrap_or_else(|e| e.into_inner());
        active.remove(download_id);
    }
    let _ = app.emit(
        "soundtrack-download-error",
        SoundtrackDownloadProgress {
            id: download_id.to_string(),
            track_id: None,
            album_id: None,
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bps: 0,
            status: "failed".into(),
            error_message: Some(error.to_string()),
        },
    );
}

async fn complete_download(
    app: &AppHandle,
    download_id: &str,
    track_id: Option<&str>,
    local_path: &str,
    total_bytes: i64,
) {
    if let Some(db) = app.try_state::<Database>() {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "UPDATE soundtrack_downloads
             SET status = 'completed', downloaded_bytes = ?1, total_bytes = ?1, speed_bps = 0, updated_at = datetime('now')
             WHERE id = ?2",
            params![total_bytes, download_id],
        );

        // If a track was attached, update its local_path so it can play offline immediately
        if let Some(t_id) = track_id {
            let _ = conn.execute(
                "UPDATE soundtrack_tracks SET local_path = ?1 WHERE id = ?2",
                params![local_path, t_id],
            );
        }
    }

    if let Some(state) = app.try_state::<SoundtrackDownloadState>() {
        let mut active = state.active.lock().unwrap_or_else(|e| e.into_inner());
        active.remove(download_id);
    }

    let _ = app.emit(
        "soundtrack-download-complete",
        DownloadCompletePayload {
            id: download_id.to_string(),
            track_id: track_id.map(ToString::to_string),
            local_path: local_path.to_string(),
        },
    );
}

pub fn cancel_download(state: &SoundtrackDownloadState, download_id: &str) -> bool {
    let mut active = state.active.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(task) = active.remove(download_id) {
        task.delete_partial.store(true, Ordering::SeqCst);
        task.cancel.cancel();
        true
    } else {
        false
    }
}
