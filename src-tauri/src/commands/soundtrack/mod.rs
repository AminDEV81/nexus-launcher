pub mod db;
pub mod downloader;
pub mod models;
pub mod scanner;
pub mod youtube;

pub use downloader::SoundtrackDownloadState;
pub use models::*;

use crate::commands::metadata::HttpClient;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use rusqlite::params;
use std::net::IpAddr;
use std::path::PathBuf;
use tauri::{AppHandle, State};

/// Maximum response body size (5 MB) accepted by `soundtrack_http_get`.
const MAX_HTTP_TEXT_BYTES: usize = 5 * 1024 * 1024;

/// Allowed external domains for `soundtrack_http_get` metadata/HTML scraping.
const ALLOWED_SOUNDTRACK_HOSTS: &[&str] = &[
    "downloads.khinsider.com",
    "vgmtreasurechest.com",
    "vgmsite.com",
    "vgmdownloads.com",
    "itunes.apple.com",
    "mzstatic.com",
    "deezer.com",
    "dzcdn.net",
    "musicbrainz.org",
    "coverartarchive.org",
    "archive.org",
    "audius.co",
    "store.steampowered.com",
    "steamstatic.com",
    "piped.private.coffee",
    "kavin.rocks",
    "piped.video",
];

fn validate_soundtrack_url(raw_url: &str) -> AppResult<reqwest::Url> {
    let parsed = reqwest::Url::parse(raw_url.trim())
        .map_err(|_| AppError::Invalid("Invalid soundtrack URL.".into()))?;

    let scheme = parsed.scheme();
    if scheme != "https" && scheme != "http" {
        return Err(AppError::Invalid(
            "Only http and https URLs are permitted.".into(),
        ));
    }

    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::Invalid("URL is missing a host.".into()))?
        .to_ascii_lowercase();

    if crate::commands::profiles::is_blocked_host_or_ip(&host) || host == "localhost" || host.ends_with(".local") || host.ends_with(".internal") {
        return Err(AppError::Invalid(
            "Local network URLs are not permitted.".into(),
        ));
    }

    if let Ok(ip) = host.trim_matches(['[', ']']).parse::<IpAddr>() {
        let is_private_or_local = match ip {
            IpAddr::V4(v4) => {
                v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
            }
            IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
        };
        if is_private_or_local {
            return Err(AppError::Invalid(
                "Private or loopback IP addresses are not permitted.".into(),
            ));
        }
    }

    let host_allowed = ALLOWED_SOUNDTRACK_HOSTS
        .iter()
        .any(|allowed| host == *allowed || host.ends_with(&format!(".{allowed}")));

    if !host_allowed {
        return Err(AppError::Invalid(format!(
            "Host '{host}' is not in the soundtrack provider allowlist."
        )));
    }

    Ok(parsed)
}

#[tauri::command]
pub fn soundtrack_resolve_game(
    game_id: String,
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackAlbumWithTracks>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::get_albums_for_game(&conn, &game_id)
}

#[tauri::command]
pub fn soundtrack_clear_game(
    game_id: String,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::clear_game_soundtracks(&conn, &game_id)
}

#[tauri::command]
pub fn soundtrack_get_album(
    album_id: String,
    db: State<'_, Database>,
) -> AppResult<Option<SoundtrackAlbumWithTracks>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::get_album(&conn, &album_id)
}

#[tauri::command]
pub fn soundtrack_get_all_albums(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackAlbum>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::get_all_albums(&conn)
}

#[tauri::command]
pub fn soundtrack_save_album(
    album: SoundtrackAlbum,
    tracks: Vec<SoundtrackTrack>,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::save_album(&conn, &album, &tracks)
}

#[tauri::command]
pub fn soundtrack_toggle_favorite(
    target_type: String,
    target_id: String,
    db: State<'_, Database>,
) -> AppResult<bool> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::toggle_favorite(&conn, &target_type, &target_id)
}

#[tauri::command]
pub fn soundtrack_get_favorites(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackFavorite>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::get_play_history(&conn, limit.unwrap_or(50))
}

#[tauri::command]
pub fn soundtrack_cache_get(
    key: String,
    db: State<'_, Database>,
) -> AppResult<Option<String>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::get_cache(&conn, &key)
}

#[tauri::command]
pub fn soundtrack_cache_set(
    key: String,
    data_json: String,
    ttl_secs: u64,
    db: State<'_, Database>,
) -> AppResult<()> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
    app: AppHandle,
    state: State<'_, SoundtrackDownloadState>,
) -> AppResult<bool> {
    Ok(downloader::cancel_download(&app, &state, &download_id))
}

#[tauri::command]
pub fn soundtrack_get_downloads(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackDownload>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    db::get_downloads(&conn)
}

/// Dynamically grants Tauri `asset://` protocol read access to a validated soundtrack directory
/// at runtime so custom user-selected soundtrack folders work without global `**/*.mp3` wildcards.
pub fn allow_soundtrack_directory_in_scopes(app: &AppHandle, dir: &std::path::Path) {
    use tauri::Manager;
    let dir_str = dir.to_string_lossy();
    if !crate::commands::download::is_safe_download_save_path(&dir_str) {
        return;
    }
    let _ = std::fs::create_dir_all(dir);
    let _ = app.asset_protocol_scope().allow_directory(dir, true);
}

#[tauri::command]
pub fn soundtrack_get_download_directory(
    app: AppHandle,
    db: State<'_, Database>,
) -> AppResult<String> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let custom: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'soundtrack_download_dir'",
            [],
            |row| row.get(0),
        )
        .ok();

    if let Some(dir) = custom {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            allow_soundtrack_directory_in_scopes(&app, std::path::Path::new(trimmed));
            return Ok(trimmed.to_string());
        }
    }

    let default_dir = downloader::get_default_soundtrack_dir();
    allow_soundtrack_directory_in_scopes(&app, &default_dir);
    Ok(default_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn soundtrack_set_download_directory(
    path: String,
    app: AppHandle,
    db: State<'_, Database>,
) -> AppResult<()> {
    let trimmed = path.trim();
    if trimmed.is_empty() || !crate::commands::download::is_safe_download_save_path(trimmed) {
        return Err(AppError::Invalid(
            "Invalid or protected system directory cannot be used as a soundtrack folder.".into(),
        ));
    }
    let dir_path = std::path::PathBuf::from(trimmed);
    allow_soundtrack_directory_in_scopes(&app, &dir_path);

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('soundtrack_download_dir', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![trimmed],
    )?;
    Ok(())
}

#[tauri::command]
pub async fn soundtrack_scan_library(
    paths: Option<Vec<String>>,
    app: AppHandle,
) -> AppResult<Vec<SoundtrackLocalFile>> {
    let scan_paths: Vec<PathBuf> = match paths {
        Some(p) if !p.is_empty() => p
            .into_iter()
            .filter(|s| crate::commands::download::is_safe_download_save_path(s))
            .map(PathBuf::from)
            .collect(),
        _ => {
            let mut defaults = Vec::new();
            defaults.push(downloader::get_default_soundtrack_dir());
            if let Some(music_dir) = dirs::audio_dir() {
                defaults.push(music_dir);
            }
            defaults
        }
    };
    for sp in &scan_paths {
        allow_soundtrack_directory_in_scopes(&app, sp);
    }

    tokio::task::spawn_blocking(move || {
        use tauri::Manager;
        let db = app.state::<Database>();
        scanner::scan_directories(app.clone(), db, scan_paths)
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?
}

#[tauri::command]
pub fn soundtrack_get_local_files(
    db: State<'_, Database>,
) -> AppResult<Vec<SoundtrackLocalFile>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
    http: State<'_, HttpClient>,
) -> AppResult<String> {
    let parsed_url = validate_soundtrack_url(&url)?;

    let mut req = http
        .0
        .get(parsed_url)
        .timeout(std::time::Duration::from_secs(10))
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        );

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            let k_low = k.trim().to_ascii_lowercase();
            if matches!(
                k_low.as_str(),
                "host"
                    | "cookie"
                    | "authorization"
                    | "proxy-authorization"
                    | "transfer-encoding"
                    | "connection"
                    | "content-length"
            ) {
                continue;
            }
            req = req.header(k, v);
        }
    }

    let res = req
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !res.status().is_success() {
        return Err(AppError::Other(format!(
            "HTTP {} for {}",
            res.status(),
            url
        )));
    }

    if let Some(len) = res.content_length() {
        if len as usize > MAX_HTTP_TEXT_BYTES {
            return Err(AppError::Invalid(
                "Response exceeds maximum allowed size (5 MB).".into(),
            ));
        }
    }

    let mut body = Vec::new();
    let mut stream = res.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|e| AppError::Other(e.to_string()))?;
        if body.len() + bytes.len() > MAX_HTTP_TEXT_BYTES {
            return Err(AppError::Invalid(
                "Response exceeds maximum allowed size (5 MB).".into(),
            ));
        }
        body.extend_from_slice(&bytes);
    }

    Ok(String::from_utf8_lossy(&body).into_owned())
}
