use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Clone, Serialize)]
pub struct ArtworkProgressPayload {
    pub game_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f64>,
}

/// Resolves (and creates) the per-game artwork cache directory:
/// `{app_data_dir}/artwork/{game_id}/`. Kept separate from the SQLite
/// file itself so the whole folder can be pointed at from `artwork_cache`
/// rows and cleared/backed-up independently of the database (Epic 15).
///
/// `game_id` comes straight from IPC, and every write below lands inside
/// this directory — so it must be exactly one path component. Parsing it
/// as a UUID enforces that: a payload like `..\` or an absolute
/// `C:\elsewhere` (which `PathBuf::push` would splice in wholesale) is
/// rejected before any filesystem call instead of turning the artwork
/// commands into an arbitrary-file-write primitive.
pub(crate) fn artwork_dir(app: &AppHandle, game_id: &str) -> AppResult<PathBuf> {
    if Uuid::parse_str(game_id).is_err() {
        return Err(AppError::Invalid("invalid game id".into()));
    }

    let mut dir = crate::paths::app_data_dir(app)?;
    dir.push("artwork");
    dir.push(game_id);
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Removes any existing `{file_stem}.*` / `{file_stem}-*` files before a
/// new one is written, and returns a filename that includes a
/// millisecond timestamp rather than a fixed `{file_stem}.{ext}`.
///
/// This matters because the webview's asset protocol (and the OS below
/// it) can cache a response by URL: if a replacement cover were always
/// written to the exact same path as the old one (e.g. always
/// `cover.webp`), the `<img>` tag would keep showing the stale cached
/// bytes until a full app restart. Giving every new file a unique name
/// means every cover change gets a genuinely new URL, so the UI updates
/// immediately — the old file is deleted right before so these don't
/// pile up on disk.
pub(crate) fn prepare_unique_path(dir: &Path, file_stem: &str, extension: &str) -> PathBuf {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.filter_map(|entry| entry.ok()) {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with(&format!("{file_stem}."))
                || name.starts_with(&format!("{file_stem}-"))
            {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }

    let timestamp = chrono::Utc::now().timestamp_millis();
    dir.join(format!("{file_stem}-{timestamp}.{extension}"))
}

/// Downloads `url` and writes it into the game's artwork folder,
/// returning the absolute local path. The extension is taken from the
/// URL itself (SteamGridDB and IGDB image URLs both end in a real
/// extension like `.png`/`.jpg`/`.webp`) rather than sniffing
/// content-type, which keeps this simple and is accurate for both of
/// the sources this pipeline actually uses.
///
/// The URL arrives over IPC and is treated as untrusted: only
/// `http(s)` schemes are fetched (no `file:`/`ftp:`/other-protocol
/// reads), and the response is capped — a hostile or misbehaving server
/// must not be able to stream unbounded bytes into memory or onto disk.
pub const LARGE_ARTWORK_THRESHOLD: u64 = 15 * 1024 * 1024;
pub const MAX_ARTWORK_BYTES: u64 = 150 * 1024 * 1024;

pub async fn download_artwork(
    client: &reqwest::Client,
    app: &AppHandle,
    game_id: &str,
    file_stem: &str,
    url: &str,
    allow_large: bool,
) -> AppResult<String> {
    let parsed_url = reqwest::Url::parse(url)
        .map_err(|err| AppError::Invalid(format!("invalid artwork URL: {err}")))?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err(AppError::Invalid(
            "artwork URLs must be http(s) links".into(),
        ));
    }

    let extension = url
        .rsplit('.')
        .next()
        .map(|ext| ext.split(['?', '#']).next().unwrap_or(ext))
        .filter(|ext| ext.len() <= 4 && !ext.contains('/'))
        .unwrap_or("jpg");

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| AppError::Other(format!("could not download artwork: {err}")))?;

    if !response.status().is_success() {
        return Err(AppError::Other(format!(
            "artwork download failed with status {}",
            response.status()
        )));
    }

    if let Some(length) = response.content_length() {
        if length > MAX_ARTWORK_BYTES {
            return Err(AppError::Other(format!(
                "artwork file exceeds maximum limit of {} MB",
                MAX_ARTWORK_BYTES / (1024 * 1024)
            )));
        }
        if length > LARGE_ARTWORK_THRESHOLD && !allow_large {
            return Err(AppError::Other(format!("artwork_too_large:{length}")));
        }
    }

    let total_bytes = response.content_length();
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut bytes = Vec::with_capacity(total_bytes.unwrap_or(1024 * 1024) as usize);
    let mut last_emit = std::time::Instant::now();

    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|err| AppError::Other(format!("stream error: {err}")))?;
        downloaded += chunk.len() as u64;

        if downloaded > MAX_ARTWORK_BYTES {
            return Err(AppError::Other(format!(
                "artwork file exceeds maximum limit of {} MB",
                MAX_ARTWORK_BYTES / (1024 * 1024)
            )));
        }

        bytes.extend_from_slice(&chunk);

        if last_emit.elapsed().as_millis() >= 50 || Some(downloaded) == total_bytes {
            last_emit = std::time::Instant::now();
            let percent = total_bytes.map(|t| ((downloaded as f64 / t as f64) * 100.0).min(100.0));
            let _ = app.emit(
                "artwork-download-progress",
                ArtworkProgressPayload {
                    game_id: game_id.to_string(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percent,
                },
            );
        }
    }

    let len = bytes.len() as u64;
    if len > MAX_ARTWORK_BYTES {
        return Err(AppError::Other(format!(
            "artwork file exceeds maximum limit of {} MB",
            MAX_ARTWORK_BYTES / (1024 * 1024)
        )));
    }
    if len > LARGE_ARTWORK_THRESHOLD && !allow_large {
        return Err(AppError::Other(format!("artwork_too_large:{len}")));
    }

    // Final 100% emission
    let _ = app.emit(
        "artwork-download-progress",
        ArtworkProgressPayload {
            game_id: game_id.to_string(),
            downloaded_bytes: len,
            total_bytes: Some(len),
            percent: Some(100.0),
        },
    );

    let dir = artwork_dir(app, game_id)?;
    let dest = prepare_unique_path(&dir, file_stem, extension);
    std::fs::write(&dest, &bytes)?;

    Ok(dest.to_string_lossy().to_string())
}

/// Copies a user-picked local file (via the OS file dialog) into the
/// game's artwork folder, for the "browse for an image" option in the
/// cover picker — no network involved, just a filesystem copy.
pub fn copy_local_artwork(
    app: &AppHandle,
    game_id: &str,
    file_stem: &str,
    source_path: &str,
) -> AppResult<String> {
    let source = Path::new(source_path);
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or("png");

    let dir = artwork_dir(app, game_id)?;
    let dest = prepare_unique_path(&dir, file_stem, extension);
    std::fs::copy(source, &dest)?;

    Ok(dest.to_string_lossy().to_string())
}

/// Upserts the single-row-per-`(game_id, kind, ordinal=0)` record that
/// tracks whether the game's cover/banner/logo/background currently on
/// disk is a manual replacement (`is_custom = 1`) or the auto-downloaded
/// original (`is_custom = 0`). Epic 10's "Reset Artwork" reads this to
/// decide which kinds even have a custom file to discard, and every
/// path that writes one of those four `games` columns — the SteamGridDB
/// pickers, Browse, and the crop editor alike — calls this so that
/// stays accurate.
pub(crate) fn record_artwork_cache(
    conn: &rusqlite::Connection,
    game_id: &str,
    kind: &str,
    local_path: &str,
    source_url: Option<&str>,
    is_custom: bool,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO artwork_cache (game_id, kind, ordinal, local_path, source_url, is_custom)
         VALUES (?1, ?2, 0, ?3, ?4, ?5)
         ON CONFLICT (game_id, kind, ordinal)
         DO UPDATE SET local_path = excluded.local_path,
                        source_url = excluded.source_url,
                        is_custom = excluded.is_custom",
        rusqlite::params![game_id, kind, local_path, source_url, is_custom],
    )?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct OrphanedArtworkSummary {
    pub orphaned_count: usize,
    pub total_bytes: u64,
}

pub fn get_orphaned_artwork_summary(
    app: &AppHandle,
    db: &crate::db::Database,
) -> AppResult<OrphanedArtworkSummary> {
    let artwork_root = crate::paths::app_data_dir(app)?.join("artwork");
    if !artwork_root.exists() {
        return Ok(OrphanedArtworkSummary {
            orphaned_count: 0,
            total_bytes: 0,
        });
    }

    let conn = db.connection.lock().expect("db mutex poisoned");
    let mut stmt = conn.prepare("SELECT id FROM games")?;
    let game_ids: std::collections::HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();

    let mut orphaned_count = 0;
    let mut total_bytes = 0;

    if let Ok(entries) = std::fs::read_dir(&artwork_root) {
        for entry in entries.filter_map(|e| e.ok()) {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    if !game_ids.contains(&folder_name) {
                        orphaned_count += 1;
                        total_bytes += compute_dir_size(&entry.path());
                    }
                }
            }
        }
    }

    Ok(OrphanedArtworkSummary {
        orphaned_count,
        total_bytes,
    })
}

pub fn cleanup_orphaned_artworks(
    app: &AppHandle,
    db: &crate::db::Database,
) -> AppResult<OrphanedArtworkSummary> {
    let artwork_root = crate::paths::app_data_dir(app)?.join("artwork");
    if !artwork_root.exists() {
        return Ok(OrphanedArtworkSummary {
            orphaned_count: 0,
            total_bytes: 0,
        });
    }

    let conn = db.connection.lock().expect("db mutex poisoned");
    let mut stmt = conn.prepare("SELECT id FROM games")?;
    let game_ids: std::collections::HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .filter_map(Result::ok)
        .collect();

    let mut cleaned_count = 0;
    let mut freed_bytes = 0;
    let mut removed_game_ids = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&artwork_root) {
        for entry in entries.filter_map(|e| e.ok()) {
            if let Ok(file_type) = entry.file_type() {
                if file_type.is_dir() {
                    let folder_name = entry.file_name().to_string_lossy().to_string();
                    if !game_ids.contains(&folder_name) {
                        let dir_size = compute_dir_size(&entry.path());
                        if std::fs::remove_dir_all(entry.path()).is_ok() {
                            cleaned_count += 1;
                            freed_bytes += dir_size;
                            removed_game_ids.push(folder_name);
                        }
                    }
                }
            }
        }
    }

    // Also clean up any lingering rows in artwork_cache for deleted games
    for id in &removed_game_ids {
        let _ = conn.execute("DELETE FROM artwork_cache WHERE game_id = ?1", [id]);
    }
    let _ = conn.execute(
        "DELETE FROM artwork_cache WHERE game_id NOT IN (SELECT id FROM games)",
        [],
    );

    Ok(OrphanedArtworkSummary {
        orphaned_count: cleaned_count,
        total_bytes: freed_bytes,
    })
}

fn compute_dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.filter_map(|e| e.ok()) {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += compute_dir_size(&entry.path());
                }
            }
        }
    }
    total
}
