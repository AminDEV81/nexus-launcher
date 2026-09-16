pub mod db;
pub mod downloader;
pub mod models;
pub mod scanner;
pub mod youtube;

pub use downloader::SoundtrackDownloadState;
pub use models::*;

use crate::db::Database;
use crate::error::AppResult;
use rusqlite::params;
use std::path::PathBuf;
use tauri::{AppHandle, State};

#[tauri::command]
pub fn soundtrack_resolve_game(
    game_id: String,
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackAlbumWithTracks>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_albums_for_game(&conn, &game_id)
}

#[tauri::command]
pub fn soundtrack_get_album(
    album_id: String,
    db: State<'_, Database>,
) -> AppResult<Option<SoundtrackAlbumWithTracks>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_album(&conn, &album_id)
}

#[tauri::command]
pub fn soundtrack_get_all_albums(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackAlbum>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_all_albums(&conn)
}

#[tauri::command]
pub fn soundtrack_save_album(
    album: SoundtrackAlbum,
    tracks: Vec<SoundtrackTrack>,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::save_album(&conn, &album, &tracks)
}

#[tauri::command]
pub fn soundtrack_toggle_favorite(
    target_type: String,
    target_id: String,
    db: State<'_, Database>,
) -> AppResult<bool> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::toggle_favorite(&conn, &target_type, &target_id)
}

#[tauri::command]
pub fn soundtrack_get_favorites(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackFavorite>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_favorites(&conn)
}

#[tauri::command]
pub fn soundtrack_record_play(
    track_id: String,
    album_id: Option<String>,
    game_id: Option<String>,
    duration_played_ms: i64,
    completed: bool,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::record_play(
        &conn,
        &track_id,
        album_id.as_deref(),
        game_id.as_deref(),
        duration_played_ms,
        completed,
    )
}

#[tauri::command]
pub fn soundtrack_get_history(
    limit: Option<u32>,
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackPlayHistory>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_play_history(&conn, limit.unwrap_or(50))
}

#[tauri::command]
pub fn soundtrack_cache_get(
    key: String,
    db: State<'_, Database>,
) -> AppResult<Option<String>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_cache(&conn, &key)
}

#[tauri::command]
pub fn soundtrack_cache_set(
    key: String,
    data_json: String,
    ttl_secs: u64,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::set_cache(&conn, &key, &data_json, ttl_secs)
}

#[tauri::command]
pub async fn soundtrack_download(
    req: DownloadSoundtrackRequest,
    app: AppHandle,
    db: State<'_, Database>,
    state: State<'_, SoundtrackDownloadState>,
) -> AppResult<()> {
    downloader::start_download(app, db, state, req).await
}

#[tauri::command]
pub fn soundtrack_cancel_download(
    download_id: String,
    state: State<'_, SoundtrackDownloadState>,
) -> AppResult<bool> {
    Ok(downloader::cancel_download(&state, &download_id))
}

#[tauri::command]
pub fn soundtrack_get_downloads(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackDownload>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_downloads(&conn)
}

#[tauri::command]
pub fn soundtrack_get_download_directory(
    db: State<'_, Database>,
) -> AppResult<String> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let custom: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'soundtrack_download_dir'",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(dir) = custom {
        if !dir.is_empty() {
            return Ok(dir);
        }
    }

    Ok(downloader::get_default_soundtrack_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub fn soundtrack_set_download_directory(
    path: String,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('soundtrack_download_dir', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![path],
    )?;
    Ok(())
}

#[tauri::command]
pub fn soundtrack_scan_library(
    paths: Option<Vec<String>>,
    app: AppHandle,
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackLocalFile>> {
    let scan_paths = match paths {
        Some(p) if !p.is_empty() => p.into_iter().map(PathBuf::from).collect(),
        _ => {
            let mut defaults = Vec::new();
            defaults.push(downloader::get_default_soundtrack_dir());
            if let Some(music_dir) = dirs::audio_dir() {
                defaults.push(music_dir);
            }
            defaults
        }
    };

    scanner::scan_directories(app, db, scan_paths)
}

#[tauri::command]
pub fn soundtrack_get_local_files(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackLocalFile>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    db::get_local_files(&conn)
}

#[tauri::command]
pub async fn soundtrack_search_youtube(
    query: String,
    limit: Option<usize>,
) -> AppResult<Vec<youtube::YouTubeTrackResult>> {
    youtube::search_youtube_tracks(&query, limit.unwrap_or(5)).await
}

#[tauri::command]
pub async fn soundtrack_http_get(
    url: String,
    headers: Option<std::collections::HashMap<String, String>>,
) -> AppResult<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    let mut req = client.get(&url).header(
        reqwest::header::USER_AGENT,
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    );

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            req = req.header(k, v);
        }
    }

    let res = req
        .send()
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    if !res.status().is_success() {
        return Err(crate::error::AppError::Other(format!(
            "HTTP {} for {}",
            res.status(),
            url
        )));
    }

    let text = res
        .text()
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))?;

    Ok(text)
}

