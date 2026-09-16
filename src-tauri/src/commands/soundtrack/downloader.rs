use crate::db::Database;
use crate::error::AppResult;
use futures_util::StreamExt;
use rusqlite::params;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio_util::sync::CancellationToken;

use super::models::{DownloadCompletePayload, DownloadSoundtrackRequest, SoundtrackDownloadProgress};

const TICK_INTERVAL: Duration = Duration::from_millis(200);

pub struct ActiveDownloadTask {
    pub cancel: CancellationToken,
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

pub async fn start_download(
    app: AppHandle,
    db: tauri::State<'_, Database>,
    state: tauri::State<'_, SoundtrackDownloadState>,
    req: DownloadSoundtrackRequest,
) -> AppResult<()> {
    // Check if already active
    {
        let active_map = state.active.lock().unwrap();
        if active_map.contains_key(&req.download_id) {
            return Ok(());
        }
    }

    let cancel = CancellationToken::new();
    let task_ref = Arc::new(ActiveDownloadTask {
        cancel: cancel.clone(),
    });

    {
        let mut active_map = state.active.lock().unwrap();
        active_map.insert(req.download_id.clone(), task_ref);
    }

    // Ensure parent directory exists
    let path = PathBuf::from(&req.target_path);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    // Upsert row in soundtrack_downloads
    {
        let conn = db.connection.lock().expect("db mutex poisoned");
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
            .build()
            .unwrap_or_default();

        let resp_result = client.get(&url_clone).send().await;
        let resp = match resp_result {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                let err_msg = format!("HTTP {}", r.status());
                fail_download(&app_clone, &download_id_clone, &err_msg).await;
                return;
            }
            Err(e) => {
                let err_msg = e.to_string();
                fail_download(&app_clone, &download_id_clone, &err_msg).await;
                return;
            }
        };

        let total_bytes = resp.content_length().unwrap_or(0) as i64;
        let mut stream = resp.bytes_stream();

        let mut file = match File::create(&target_path_clone) {
            Ok(f) => f,
            Err(e) => {
                fail_download(&app_clone, &download_id_clone, &format!("File create failed: {e}")).await;
                return;
            }
        };

        let mut downloaded_bytes = 0i64;
        let mut last_tick = Instant::now();
        let mut bytes_since_tick = 0i64;
        let mut current_speed = 0i64;

        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    // Download paused or cancelled
                    let _ = app_clone.emit("soundtrack-download-progress", SoundtrackDownloadProgress {
                        id: download_id_clone.clone(),
                        track_id: track_id_clone.clone(),
                        album_id: album_id_clone.clone(),
                        downloaded_bytes,
                        total_bytes,
                        speed_bps: 0,
                        status: "paused".into(),
                        error_message: None,
                    });
                    return;
                }
                chunk_opt = stream.next() => {
                    match chunk_opt {
                        Some(Ok(chunk)) => {
                            if let Err(e) = file.write_all(&chunk) {
                                fail_download(&app_clone, &download_id_clone, &format!("Write failed: {e}")).await;
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
                            fail_download(&app_clone, &download_id_clone, &format!("Stream error: {e}")).await;
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

async fn fail_download(app: &AppHandle, download_id: &str, error: &str) {
    if let Some(db) = app.try_state::<Database>() {
        if let Ok(conn) = db.connection.lock() {
            let _ = conn.execute(
                "UPDATE soundtrack_downloads
                 SET status = 'failed', error_message = ?1, updated_at = datetime('now')
                 WHERE id = ?2",
                params![error, download_id],
            );
        }
    }
    if let Some(state) = app.try_state::<SoundtrackDownloadState>() {
        let mut active = state.active.lock().unwrap();
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
        if let Ok(conn) = db.connection.lock() {
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
    }

    if let Some(state) = app.try_state::<SoundtrackDownloadState>() {
        let mut active = state.active.lock().unwrap();
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
    let mut active = state.active.lock().unwrap();
    if let Some(task) = active.remove(download_id) {
        task.cancel.cancel();
        true
    } else {
        false
    }
}
