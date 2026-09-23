//! Game Download Manager.
//!
//! Downloads a file from a URL with up to 6 parallel HTTP Range
//! connections (falling back to a single stream when the server can't
//! serve ranges), persists per-chunk progress so pause/resume picks
//! every connection back up at its own offset, and after the bytes land
//! auto-extracts .zip archives, detects the game's executable, and
//! marks the linked library game installed.
//!
//! Cancellation is a `CancellationToken` shared by every chunk task plus
//! the stored `JoinHandle`: pause/cancel *await* the tasks before
//! touching the DB status, so a resumed download never races a zombie
//! writer on the same file (the failure mode of the previous
//! watch-channel design, which also had no read timeout and could hang
//! forever on a stalled stream).

use crate::db::models::Game;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use futures_util::stream::{FuturesUnordered, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Seek, SeekFrom, Write};
use std::sync::atomic::{AtomicU8, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;

/// Why an active download is being stopped: the task persists its chunk
/// state and flips the row to `paused` only for a pause; a cancel means
/// the row (and file) are about to be deleted, so touching them again
/// would race the delete.
const REASON_PAUSE: u8 = 0;
const REASON_CANCEL: u8 = 1;

/// Bytes before a stream is considered stalled. Without this the task
/// sits inside `stream.next().await` forever on a dead socket.
const IDLE_TIMEOUT: Duration = Duration::from_secs(30);
const TICK_MS: u64 = 400;
/// Chunk sizing: a file gets parallel connections per ~2 MB chunk so
/// even small and medium files saturate the user's connection up to MAX_CONNECTIONS.
const TARGET_CHUNK_BYTES: u64 = 2 * 1024 * 1024;
const CHUNK_ATTEMPTS: usize = 4;

struct ActiveDownload {
    cancel: CancellationToken,
    reason: Arc<AtomicU8>,
    /// `Option` so a pause/cancel can *take* the handle and await task
    /// exit (JoinHandle is consumed by `.await`); the entry itself stays
    /// in the map until the task's own `cleanup_active` removes it.
    handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
}

#[derive(Default)]
pub struct DownloadState {
    active: Mutex<HashMap<String, Arc<ActiveDownload>>>,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct DownloadInfo {
    pub id: String,
    pub game_id: String,
    pub url: String,
    pub save_path: String,
    pub file_path: Option<String>,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub status: String,
    pub error_message: Option<String>,
    pub speed_bps: u64,
    pub created_at: String,
    pub updated_at: String,
    pub auto_extract: bool,
}

/// Progress payload, both the `download-updated` event and the
/// `get_download_progress` command response.
#[derive(Clone, Serialize)]
pub struct DownloadProgress {
    pub id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
    pub status: String,
    pub error_message: Option<String>,
    pub chunks: Option<Vec<u8>>,
    pub extract_percent: Option<u8>,
}

/// Emitted when a linked game finished downloading and was marked
/// installed — the frontend uses it to invalidate the library and toast.
#[derive(Clone, Serialize)]
pub struct DownloadCompleted {
    pub download_id: String,
    pub game_id: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct StartedDownload {
    pub download_id: String,
    pub game: Game,
}

/// One connection's byte range. `end` is inclusive; `done` is how many
/// bytes of the chunk are already on disk (persisted as JSON so resume
/// restarts every connection at its own offset).
#[derive(Clone, Copy, Serialize, Deserialize)]
struct ChunkPlan {
    start: u64,
    end: u64,
    done: u64,
}

enum EngineOutcome {
    Completed { total: u64, downloaded: u64 },
    /// Paused — the engine already persisted chunk state and status.
    Paused,
    /// Cancelled — the caller owns cleanup, nothing to persist.
    Cancelled,
    /// The supervisor already persisted the failure to the DB.
    Failed,
}

fn download_client() -> reqwest::Client {
    reqwest::Client::builder()
        .user_agent("NexusLauncher/0.1")
        .tcp_nodelay(true)
        .tcp_keepalive(Some(Duration::from_secs(15)))
        .pool_max_idle_per_host(32)
        .connect_timeout(Duration::from_secs(30))
        .read_timeout(IDLE_TIMEOUT)
        .build()
        .unwrap_or_default()
}

/// Sanitizes an arbitrary (possibly hostile) string into a bare,
/// Windows-safe file name. `file_name_from_url` and the
/// Content-Disposition parser both funnel through here.
fn sanitize_file_name(raw: &str) -> String {
    const RESERVED: [&str; 22] = [
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
        "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    let cleaned: String = raw
        .chars()
        .take(120)
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let mut name = cleaned.trim_matches(|c| c == '.' || c == ' ').to_string();
    if name.is_empty() {
        name = "download".to_string();
    } else if RESERVED.contains(&name.split('.').next().unwrap_or("").to_ascii_uppercase().as_str())
    {
        name = format!("_{name}");
    }
    name
}

/// Derives the on-disk file name from the URL's last path segment. The
/// result is always a bare file name: path separators (including
/// Windows' `\`, which a crafted URL could use to escape `save_path`)
/// and characters that are invalid on Windows filesystems are replaced,
/// reserved device names are defused, and an empty/`..` segment falls
/// back to `download`.
fn file_name_from_url(url: &str) -> String {
    let raw = url
        .rsplit('/')
        .next()
        .unwrap_or("")
        .split(['?', '#'])
        .next()
        .unwrap_or("");
    sanitize_file_name(raw)
}

/// `Content-Disposition: attachment; filename="…"` (RFC 6266), plus the
/// `filename*=UTF-8''%xx` encoded form. Server-controlled, so callers
/// must sanitize the result.
fn disposition_filename(raw: &str) -> Option<String> {
    for param in raw.split(';').skip(1) {
        let param = param.trim();
        if let Some(v) = param.strip_prefix("filename*=") {
            // charset'lang'%Encoded — the percent-encoded part is last.
            let encoded = v.split('\'').next_back().unwrap_or(v);
            let decoded = percent_decode(encoded);
            if !decoded.is_empty() {
                return Some(decoded);
            }
        }
        if let Some(v) = param.strip_prefix("filename=") {
            let v = v.trim().trim_matches('"');
            if !v.is_empty() {
                return Some(v.to_string());
            }
        }
    }
    None
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Extension hint from the declared MIME type. `application/octet-stream`
/// (the generic binary default most CDNs use) deliberately maps to None —
/// the magic bytes get the last word there.
fn ext_from_content_type(content_type: &str) -> Option<&'static str> {
    let base = content_type.split(';').next()?.trim().to_lowercase();
    match base.as_str() {
        "application/zip" | "application/x-zip-compressed" | "application/x-zip"
        | "multipart/x-zip" => Some("zip"),
        "application/x-7z-compressed" | "application/x-7z" => Some("7z"),
        "application/x-rar-compressed" | "application/vnd.rar" | "application/x-rar" => {
            Some("rar")
        }
        "application/x-iso9660-image" | "application/x-iso" | "application/iso" => Some("iso"),
        "application/x-msdownload" | "application/x-msdos-program" | "application/x-msi" => {
            Some("exe")
        }
        _ => None,
    }
}

/// The file's actual format from its leading bytes — the only source
/// that can't lie. Magic keys: zip `PK`, rar `RAR!`, 7z `7z¼¯'`, exe `MZ`.
fn sniff_kind(magic: &[u8]) -> Option<&'static str> {
    if magic.starts_with(b"PK") {
        Some("zip")
    } else if magic.starts_with(b"RAR!") {
        Some("rar")
    } else if magic.starts_with(b"7z\xbc\xaf\x27\x1c") {
        Some("7z")
    } else if magic.starts_with(b"MZ") {
        Some("exe")
    } else {
        None
    }
}

/// Only http(s) links reach the downloader — same defense-in-depth as
/// `trailer_url`: reqwest itself rejects other schemes, but the friendly
/// error beats a generic network failure.
fn validate_download_url(url: &str) -> AppResult<()> {
    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(())
    } else {
        Err(AppError::Invalid(
            "only http(s) download links are supported".into(),
        ))
    }
}

// ── DB + event helpers ───────────────────────────────────────────────

/// Writes live progress and broadcasts it. Guarded to the transient
/// statuses so a late write can never clobber a `completed`/`paused`
/// row after a race.
fn persist_progress(
    app: &AppHandle,
    id: &str,
    downloaded: u64,
    total: u64,
    speed: u64,
    status: &str,
    chunks: Option<Vec<u8>>,
) {
    persist_progress_with_extract(app, id, downloaded, total, speed, status, chunks, None);
}

#[allow(clippy::too_many_arguments)]
fn persist_progress_with_extract(
    app: &AppHandle,
    id: &str,
    downloaded: u64,
    total: u64,
    speed: u64,
    status: &str,
    chunks: Option<Vec<u8>>,
    extract_percent: Option<u8>,
) {
    {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        let _ = conn.execute(
            "UPDATE downloads SET downloaded_bytes=?1, total_bytes=?2, speed_bps=?3, status=?4, updated_at=datetime('now')
             WHERE id=?5 AND status IN ('downloading','extracting','queued')",
            rusqlite::params![downloaded as i64, total as i64, speed as i64, status, id],
        );
    }
    app.emit(
        "download-updated",
        DownloadProgress {
            id: id.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            speed_bps: speed,
            status: status.to_string(),
            error_message: None,
            chunks,
            extract_percent,
        },
    )
    .ok();
}

/// Snapshots the in-memory chunk layout (with each connection's current
/// offset) into the row so a pause/crash can resume mid-chunk.
fn save_chunk_state(app: &AppHandle, id: &str, plans: &[ChunkPlan], dones: &[AtomicU64]) {
    let snapshot: Vec<ChunkPlan> = plans
        .iter()
        .zip(dones.iter())
        .map(|(p, d)| ChunkPlan {
            start: p.start,
            end: p.end,
            done: d.load(Ordering::Relaxed),
        })
        .collect();
    let json = serde_json::to_string(&snapshot).ok();
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let _ = conn.execute(
        "UPDATE downloads SET chunk_state=?1 WHERE id=?2",
        rusqlite::params![json, id],
    );
}

fn mark_failed(app: &AppHandle, id: &str, msg: &str, total: u64, downloaded: u64) {
    {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        let _ = conn.execute(
            "UPDATE downloads SET status='failed', error_message=?1, speed_bps=0, total_bytes=?2, downloaded_bytes=?3, updated_at=datetime('now')
             WHERE id=?4 AND status IN ('downloading','extracting','queued')",
            rusqlite::params![msg, total as i64, downloaded as i64, id],
        );
    }
    app.emit(
        "download-updated",
        DownloadProgress {
            id: id.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            speed_bps: 0,
            status: "failed".into(),
            error_message: Some(msg.to_string()),
            chunks: None,
            extract_percent: None,
        },
    )
    .ok();
}

fn mark_completed(app: &AppHandle, id: &str, total: u64, downloaded: u64) {
    // Guarded like every other transition: a pause that raced the
    // extraction phase must win over this late completion write.
    let changed = {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE downloads SET status='completed', speed_bps=0, downloaded_bytes=?2, error_message=NULL, chunk_state=NULL, updated_at=datetime('now') WHERE id=?1 AND status IN ('downloading','extracting')",
            rusqlite::params![id, downloaded as i64],
        )
        .unwrap_or(0)
    };
    if changed == 0 {
        return;
    }
    app.emit(
        "download-updated",
        DownloadProgress {
            id: id.to_string(),
            downloaded_bytes: downloaded,
            total_bytes: total,
            speed_bps: 0,
            status: "completed".into(),
            error_message: None,
            chunks: None,
            extract_percent: None,
        },
    )
    .ok();
}

/// `(url, save_path, file_path, game_id, chunk_state)` for a row.
fn load_row(app: &AppHandle, id: &str) -> Option<(String, String, String, String, Option<String>)> {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    conn.query_row(
        "SELECT url, save_path, COALESCE(file_path,''), game_id, chunk_state FROM downloads WHERE id=?1",
        [id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    )
    .ok()
}

// ── Engine ───────────────────────────────────────────────────────────

/// What the server told us about the transfer before any bytes are
/// committed to disk. Besides range/size this carries the three signals
/// used to name the file: `Content-Disposition` (the real name, when
/// the host sends it), `Content-Type`, and the leading magic bytes.
struct ProbeResult {
    ranged: bool,
    total: Option<u64>,
    disposition: Option<String>,
    content_type: Option<String>,
    magic: Option<Vec<u8>>,
}

/// One GET with `Range: bytes=0-`: tells us whether the server can
/// serve ranges (206 + Content-Range), the total size, the declared
/// name/type — and peeks at the first bytes of the body so the format
/// can be sniffed even when every header is generic. Dropping the
/// response after the peek only costs the connection, not the file.
async fn probe_remote(client: &reqwest::Client, url: &str) -> Result<ProbeResult, String> {
    let resp = client
        .get(url)
        .header("Range", "bytes=0-")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let content_range_total: Option<u64> = resp
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next().and_then(|t| t.parse().ok()));
    let content_len: u64 = resp
        .headers()
        .get("content-length")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let disposition = resp
        .headers()
        .get("content-disposition")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let magic = {
        let mut stream = resp.bytes_stream();
        match tokio::time::timeout(IDLE_TIMEOUT, stream.next()).await {
            Ok(Some(Ok(chunk))) if chunk.len() >= 4 => {
                Some(chunk[..chunk.len().min(8)].to_vec())
            }
            _ => None,
        }
    };

    Ok(ProbeResult {
        ranged: status == 206 && content_range_total.is_some(),
        total: content_range_total.or(if content_len > 0 {
            Some(content_len)
        } else {
            None
        }),
        disposition,
        content_type,
        magic,
    })
}

/// The name the downloaded file should carry on disk. Short-link hosts
/// (`.d/<id>?token=…`) put nothing usable in the URL, so trust the
/// server in order: Content-Disposition, then Content-Type, then magic
/// bytes for the extension the headers didn't reveal.
fn remote_file_name(url: &str, probe: &ProbeResult) -> String {
    let header_ext = || {
        probe
            .content_type
            .as_deref()
            .and_then(ext_from_content_type)
            .or_else(|| probe.magic.as_deref().and_then(sniff_kind))
    };

    if let Some(raw) = probe.disposition.as_deref().and_then(disposition_filename) {
        let clean = sanitize_file_name(&raw);
        if clean != "download" {
            if std::path::Path::new(&clean).extension().is_none() {
                if let Some(ext) = header_ext() {
                    return format!("{clean}.{ext}");
                }
            }
            return clean;
        }
    }

    let mut name = file_name_from_url(url);
    if std::path::Path::new(&name).extension().is_none() {
        if let Some(ext) = header_ext() {
            name = format!("{name}.{ext}");
        }
    }
    name
}

/// Picks the real on-disk path once the probe knows what the file is.
/// Fresh downloads adopt the detected name (and persist it, so the UI
/// and any resume see it); resumes keep the row's stored path so the
/// saved chunk offsets stay valid against the same file.
fn resolve_target_path(
    app: &AppHandle,
    id: &str,
    current: &str,
    url: &str,
    probe: &ProbeResult,
    is_resume: bool,
) -> String {
    if is_resume {
        return current.to_string();
    }
    let name = remote_file_name(url, probe);
    if name.is_empty() {
        return current.to_string();
    }
    let dir = std::path::Path::new(current)
        .parent()
        .map(std::path::Path::to_path_buf)
        .unwrap_or_default();
    let desired = dir.join(&name).to_string_lossy().into_owned();
    if desired == current {
        return desired;
    }
    // Never silently hop onto another download's target file.
    let conflict = {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.query_row(
            "SELECT id FROM downloads WHERE file_path=?1 AND status IN ('downloading','extracting') AND id != ?2 LIMIT 1",
            rusqlite::params![desired, id],
            |row| row.get::<_, String>(0),
        )
        .is_ok()
    };
    if conflict {
        return current.to_string();
    }
    // Drop the partial written under the guessed URL name, then adopt.
    let _ = std::fs::remove_file(current);
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let _ = conn.execute(
        "UPDATE downloads SET file_path=?1, updated_at=datetime('now') WHERE id=?2",
        rusqlite::params![desired, id],
    );
    desired
}

enum ChunkError {
    Cancelled,
    Failed(String),
}

#[derive(Clone)]
pub struct RateLimiter {
    limit_bps: Arc<AtomicU64>,
}

impl RateLimiter {
    pub fn new(bps: u64) -> Self {
        Self {
            limit_bps: Arc::new(AtomicU64::new(bps)),
        }
    }

    pub async fn throttle(&self, bytes: usize) {
        let limit = self.limit_bps.load(Ordering::Relaxed);
        if limit == 0 {
            return;
        }
        let micros = (bytes as u64 * 1_000_000) / limit;
        if micros > 0 {
            tokio::time::sleep(Duration::from_micros(micros)).await;
        }
    }
}

/// Downloads one byte range of the file at its own offset, retrying
/// network hiccups from where it left off (every attempt resumes at the
/// in-memory `done` counter, so retries never rewrite bytes).
#[allow(clippy::too_many_arguments)]
async fn chunk_task(
    client: reqwest::Client,
    url: String,
    file_path: String,
    index: usize,
    plans: Arc<Vec<ChunkPlan>>,
    dones: Arc<Vec<AtomicU64>>,
    limiter: RateLimiter,
    token: CancellationToken,
) -> Result<(), ChunkError> {
    let plan = plans[index];
    let done = &dones[index];

    for attempt in 0..CHUNK_ATTEMPTS {
        if token.is_cancelled() {
            return Err(ChunkError::Cancelled);
        }
        let pos = plan.start + done.load(Ordering::Relaxed);
        if pos > plan.end {
            return Ok(());
        }

        let resp = tokio::select! {
            biased;
            _ = token.cancelled() => return Err(ChunkError::Cancelled),
            res = client
                .get(&url)
                .header("Range", format!("bytes={pos}-{}", plan.end))
                .send() => match res {
                    Ok(r) => r,
                    Err(e) => {
                        if attempt + 1 < CHUNK_ATTEMPTS {
                            tokio::select! {
                                biased;
                                _ = token.cancelled() => return Err(ChunkError::Cancelled),
                                _ = tokio::time::sleep(Duration::from_millis(500 * (attempt as u64 + 1))) => {}
                            }
                            continue;
                        }
                        return Err(ChunkError::Failed(e.to_string()));
                    }
                }
        };
        if resp.status().as_u16() != 206 {
            // Transient proxies/caches sometimes answer a Range GET with
            // 200 — retry like any other hiccup before giving up.
            if attempt + 1 < CHUNK_ATTEMPTS {
                tokio::select! {
                    biased;
                    _ = token.cancelled() => return Err(ChunkError::Cancelled),
                    _ = tokio::time::sleep(Duration::from_millis(500 * (attempt as u64 + 1))) => {}
                }
                continue;
            }
            return Err(ChunkError::Failed(
                "server did not honor the range request".into(),
            ));
        }

        let file = match std::fs::OpenOptions::new().write(true).open(&file_path) {
            Ok(f) => f,
            Err(e) => return Err(ChunkError::Failed(e.to_string())),
        };
        let mut writer = std::io::BufWriter::with_capacity(128 * 1024, file);
        if let Err(e) = writer.seek(SeekFrom::Start(pos)) {
            return Err(ChunkError::Failed(e.to_string()));
        }

        let mut stream = resp.bytes_stream();
        let mut retryable = false;
        loop {
            if token.is_cancelled() {
                let _ = writer.flush();
                return Err(ChunkError::Cancelled);
            }
            tokio::select! {
                biased;
                _ = token.cancelled() => {
                    let _ = writer.flush();
                    return Err(ChunkError::Cancelled);
                }
                res = tokio::time::timeout(IDLE_TIMEOUT, stream.next()) => {
                    match res {
                        // Stalled socket — drop out and reconnect from `done`.
                        Err(_) => {
                            let _ = writer.flush();
                            retryable = true;
                        }
                        Ok(Some(Ok(bytes))) => {
                            if let Err(e) = writer.write_all(&bytes) {
                                return Err(ChunkError::Failed(e.to_string()));
                            }
                            done.fetch_add(bytes.len() as u64, Ordering::Relaxed);
                            limiter.throttle(bytes.len()).await;
                        }
                        Ok(Some(Err(_))) => {
                            let _ = writer.flush();
                            retryable = true;
                        }
                        Ok(None) => {
                            let _ = writer.flush();
                            let now = plan.start + done.load(Ordering::Relaxed);
                            if now == plan.end + 1 {
                                return Ok(());
                            }
                            // Short read — reconnect and continue the range.
                            retryable = true;
                        }
                    }
                }
            }
            if retryable {
                break;
            }
        }

        if retryable && attempt + 1 < CHUNK_ATTEMPTS {
            tokio::select! {
                biased;
                _ = token.cancelled() => return Err(ChunkError::Cancelled),
                _ = tokio::time::sleep(Duration::from_millis(500 * (attempt as u64 + 1))) => {}
            }
        } else if retryable {
            return Err(ChunkError::Failed(
                "connection kept stalling; gave up after retries".into(),
            ));
        }
    }
    Err(ChunkError::Failed(format!(
        "chunk failed after {CHUNK_ATTEMPTS} attempts"
    )))
}

/// Fallback for servers without Range support: one plain GET, no
/// resume, streamed start to finish with the same idle-timeout guard.
async fn plain_task(
    client: reqwest::Client,
    url: String,
    file_path: String,
    dones: Arc<Vec<AtomicU64>>,
    limiter: RateLimiter,
    token: CancellationToken,
) -> Result<(), ChunkError> {
    let done = &dones[0];

    for attempt in 0..CHUNK_ATTEMPTS {
        if token.is_cancelled() {
            return Err(ChunkError::Cancelled);
        }
        // A restarted plain download rewrites the file from zero.
        done.store(0, Ordering::Relaxed);
        if std::fs::File::create(&file_path).is_err() {
            return Err(ChunkError::Failed("cannot create file".into()));
        }
        let file = match std::fs::OpenOptions::new().append(true).open(&file_path) {
            Ok(f) => f,
            Err(e) => return Err(ChunkError::Failed(e.to_string())),
        };
        let mut writer = std::io::BufWriter::with_capacity(128 * 1024, file);

        let resp = tokio::select! {
            biased;
            _ = token.cancelled() => return Err(ChunkError::Cancelled),
            res = client.get(&url).send() => match res {
                Ok(r) => r,
                Err(e) => {
                    if attempt + 1 < CHUNK_ATTEMPTS {
                        tokio::select! {
                            biased;
                            _ = token.cancelled() => return Err(ChunkError::Cancelled),
                            _ = tokio::time::sleep(Duration::from_millis(500 * (attempt as u64 + 1))) => {}
                        }
                        continue;
                    }
                    return Err(ChunkError::Failed(e.to_string()));
                }
            }
        };

        let mut stream = resp.bytes_stream();
        let mut retryable = false;
        loop {
            if token.is_cancelled() {
                let _ = writer.flush();
                return Err(ChunkError::Cancelled);
            }
            tokio::select! {
                biased;
                _ = token.cancelled() => {
                    let _ = writer.flush();
                    return Err(ChunkError::Cancelled);
                }
                res = tokio::time::timeout(IDLE_TIMEOUT, stream.next()) => {
                    match res {
                        Err(_) => {
                            let _ = writer.flush();
                            retryable = true;
                        }
                        Ok(Some(Ok(bytes))) => {
                            if let Err(e) = writer.write_all(&bytes) {
                                return Err(ChunkError::Failed(e.to_string()));
                            }
                            done.fetch_add(bytes.len() as u64, Ordering::Relaxed);
                            limiter.throttle(bytes.len()).await;
                        }
                        Ok(Some(Err(_))) => {
                            let _ = writer.flush();
                            retryable = true;
                        }
                        Ok(None) => {
                            let _ = writer.flush();
                            return Ok(());
                        }
                    }
                }
            }
            if retryable {
                break;
            }
        }

        if retryable && attempt + 1 < CHUNK_ATTEMPTS {
            tokio::select! {
                biased;
                _ = token.cancelled() => return Err(ChunkError::Cancelled),
                _ = tokio::time::sleep(Duration::from_millis(500 * (attempt as u64 + 1))) => {}
            }
        } else if retryable {
            return Err(ChunkError::Failed(
                "connection kept stalling; gave up after retries".into(),
            ));
        }
    }
    Err(ChunkError::Failed("download failed after retries".into()))
}

fn get_max_connections(app: &AppHandle) -> u64 {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'download_streams'",
            [],
            |row| row.get(0),
        )
        .ok();

    val.and_then(|s| s.parse::<u64>().ok())
        .filter(|&n| (1..=32).contains(&n))
        .unwrap_or(8)
}

/// Splits `total` into at most `max_connections` ranges of ~2 MB.
fn fresh_plans(total: u64, max_connections: u64) -> Vec<ChunkPlan> {
    let count = (total / TARGET_CHUNK_BYTES)
        .clamp(1, max_connections)
        .max(1);
    let base = total / count;
    let extra = total % count;
    let mut plans = Vec::with_capacity(count as usize);
    let mut start = 0;
    for i in 0..count {
        let len = base + u64::from(i < extra);
        plans.push(ChunkPlan {
            start,
            end: start + len - 1,
            done: 0,
        });
        start += len;
    }
    plans
}

/// Restores a persisted chunk plan if it exactly tiles the file;
/// otherwise the on-disk layout is unknown (partial multi-writer state)
/// and a fresh start is the only safe option.
fn restore_plans(saved: Option<&str>, total: u64) -> Option<Vec<ChunkPlan>> {
    let saved = saved?;
    let plans: Vec<ChunkPlan> = serde_json::from_str(saved).ok()?;
    if plans.is_empty() {
        return None;
    }
    let mut expected = 0;
    for p in &plans {
        if p.start != expected || p.end < p.start || p.done > p.end - p.start + 1 {
            return None;
        }
        expected = p.end + 1;
    }
    if expected != total {
        return None;
    }
    Some(plans)
}

fn get_speed_limit_bps(app: &AppHandle) -> u64 {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let val: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'download_speed_limit'",
            [],
            |row| row.get(0),
        )
        .ok();

    val.and_then(|s| s.parse::<u64>().ok()).unwrap_or(0)
}

/// The engine: probe the server, choose parallel-range vs plain mode,
/// run the tasks under the progress supervisor, classify the outcome.
#[allow(clippy::too_many_arguments)]
async fn run_engine(
    app: &AppHandle,
    id: &str,
    url: &str,
    file_path: &str,
    probe: ProbeResult,
    client: reqwest::Client,
    saved_chunk_state: Option<String>,
    token: &CancellationToken,
    reason: &AtomicU8,
) -> EngineOutcome {
    let ranged = probe.ranged;
    let total = probe.total;
    let speed_limit = get_speed_limit_bps(app);
    let limiter = RateLimiter::new(speed_limit);

    if ranged {
        let total = total.unwrap_or(0);
        let file_len = std::fs::metadata(file_path).map(|m| m.len()).unwrap_or(0);
        let restored = if file_len == total {
            restore_plans(saved_chunk_state.as_deref(), total)
        } else {
            None
        };

        let plans = match restored {
            Some(p) => p,
            None => {
                // Fresh start: allocate the full file up front so every
                // connection can seek straight to its offset.
                if std::fs::File::create(file_path)
                    .and_then(|f| f.set_len(total))
                    .is_err()
                {
                    mark_failed(app, id, "cannot create the target file", 0, 0);
                    return EngineOutcome::Failed;
                }
                let max_conn = get_max_connections(app);
                fresh_plans(total, max_conn)
            }
        };

        let dones = Arc::new(
            plans
                .iter()
                .map(|p| AtomicU64::new(p.done))
                .collect::<Vec<_>>(),
        );
        let plans = Arc::new(plans);

        let mut tasks: FuturesUnordered<_> = (0..plans.len())
            .map(|i| {
                tokio::spawn(chunk_task(
                    client.clone(),
                    url.to_string(),
                    file_path.to_string(),
                    i,
                    plans.clone(),
                    dones.clone(),
                    limiter.clone(),
                    token.clone(),
                ))
            })
            .collect();

        run_supervisor(
            app,
            id,
            total,
            Some((plans, dones.clone())),
            &dones,
            &mut tasks,
            token,
            reason,
        )
        .await
    } else {
        // Single stream. No Range support → no resume; restart from 0.
        let dones = Arc::new(vec![AtomicU64::new(0)]);
        let mut tasks: FuturesUnordered<_> = std::iter::once(tokio::spawn(plain_task(
            client.clone(),
            url.to_string(),
            file_path.to_string(),
            dones.clone(),
            limiter,
            token.clone(),
        )))
        .collect();
        run_supervisor(
            app,
            id,
            total.unwrap_or(0),
            None,
            &dones,
            &mut tasks,
            token,
            reason,
        )
        .await
    }
}

type SharedPlans = Option<(Arc<Vec<ChunkPlan>>, Arc<Vec<AtomicU64>>)>;
type ChunkTaskSet = FuturesUnordered<tokio::task::JoinHandle<Result<(), ChunkError>>>;

/// Shared supervisor: ticks progress (DB + `download-updated` event)
/// while the chunk tasks run, then classifies the result. Pause/cancel
/// persist chunk state *here*, after every task has actually exited.
#[allow(clippy::too_many_arguments)]
async fn run_supervisor(
    app: &AppHandle,
    id: &str,
    total: u64,
    plan: SharedPlans,
    dones: &Arc<Vec<AtomicU64>>,
    tasks: &mut ChunkTaskSet,
    token: &CancellationToken,
    reason: &AtomicU8,
) -> EngineOutcome {
    let mut cancelled = false;
    let mut failures: Vec<String> = Vec::new();
    let mut last_tick = Instant::now();
    let mut last_bytes: u64 = dones.iter().map(|d| d.load(Ordering::Relaxed)).sum();

    while !tasks.is_empty() {
        let downloaded: u64 = dones.iter().map(|d| d.load(Ordering::Relaxed)).sum();
        tokio::select! {
            biased;
            _ = token.cancelled(), if !cancelled => {
                cancelled = true;
            }
            Some(res) = tasks.next() => {
                match res {
                    Ok(Ok(())) => {}
                    Ok(Err(ChunkError::Cancelled)) => {}
                    Ok(Err(ChunkError::Failed(m))) => failures.push(m),
                    Err(join_err) => failures.push(join_err.to_string()),
                }
            }
            _ = tokio::time::sleep(Duration::from_millis(TICK_MS)), if !cancelled => {
                let now = Instant::now();
                let elapsed = now.duration_since(last_tick).as_secs_f64();
                let speed = if elapsed > 0.0 {
                    (downloaded.saturating_sub(last_bytes) as f64 / elapsed) as u64
                } else {
                    0
                };
                let chunks: Option<Vec<u8>> = plan.as_ref().map(|(plans, dones)| {
                    plans
                        .iter()
                        .zip(dones.iter())
                        .map(|(p, d)| {
                            let len = (p.end.saturating_sub(p.start) + 1).max(1);
                            let done = d.load(Ordering::Relaxed);
                            ((done as f64 / len as f64) * 100.0).clamp(0.0, 100.0) as u8
                        })
                        .collect()
                });
                persist_progress(app, id, downloaded, total, speed, "downloading", chunks);
                last_tick = now;
                last_bytes = downloaded;
            }
        }
    }

    let downloaded: u64 = dones.iter().map(|d| d.load(Ordering::Relaxed)).sum();

    match (&plan, cancelled, failures.first()) {
        // Cancelled for a pause: persist resume state and flip to paused.
        // Only ranged downloads have a layout worth persisting — a plain
        // single-stream download has nothing to resume from.
        (_, true, _) if reason.load(Ordering::SeqCst) == REASON_PAUSE => {
            if let Some((plans, _)) = &plan {
                save_chunk_state(app, id, plans, dones);
            }
            persist_progress(app, id, downloaded, total, 0, "paused", None);
            EngineOutcome::Paused
        }
        (_, true, _) => EngineOutcome::Cancelled,
        (_, false, Some(msg)) => {
            if let Some((plans, _)) = &plan {
                save_chunk_state(app, id, plans, dones);
            }
            mark_failed(app, id, msg, total, downloaded);
            EngineOutcome::Failed
        }
        (_, false, None) => EngineOutcome::Completed { total, downloaded },
    }
}

// ── Finalize: extract + install ──────────────────────────────────────

fn is_subsequent_multipart(file_path: &str) -> bool {
    let lower = file_path.to_lowercase();
    if lower.contains(".part")
        && !lower.contains(".part1.")
        && !lower.contains(".part01.")
        && !lower.contains(".part001.")
    {
        return true;
    }
    if lower.ends_with(".002")
        || lower.ends_with(".003")
        || lower.ends_with(".004")
        || lower.ends_with(".005")
        || lower.ends_with(".r00")
        || lower.ends_with(".r01")
        || lower.ends_with(".r02")
    {
        return true;
    }
    false
}

fn extract_zip(app: &AppHandle, id: &str, file_path: &str, save_path: &str) -> Result<(), String> {
    let file =
        std::fs::File::open(file_path).map_err(|e| format!("cannot open archive: {e}"))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("corrupt archive: {e}"))?;
    let dest = std::path::Path::new(save_path);
    std::fs::create_dir_all(dest).map_err(|e| format!("cannot create folder: {e}"))?;
    let total = archive.len();
    let mut last_reported = 0u8;

    for i in 0..total {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("bad archive entry: {e}"))?;
        let entry_path = dest.join(entry.mangled_name());
        if entry.is_dir() {
            std::fs::create_dir_all(&entry_path)
                .map_err(|e| format!("cannot create folder: {e}"))?;
        } else {
            if let Some(parent) = entry_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("cannot create folder: {e}"))?;
            }
            let mut out = std::fs::File::create(&entry_path)
                .map_err(|e| format!("cannot write {entry_path:?}: {e}"))?;
            std::io::copy(&mut entry, &mut out)
                .map_err(|e| format!("cannot extract {entry_path:?}: {e}"))?;
        }

        if total > 0 {
            let pct = (((i + 1) as f64 / total as f64) * 100.0).clamp(0.0, 100.0) as u8;
            if pct != last_reported || i + 1 == total {
                last_reported = pct;
                persist_progress_with_extract(
                    app,
                    id,
                    (i + 1) as u64,
                    total as u64,
                    pct as u64,
                    "extracting",
                    None,
                    Some(pct),
                );
            }
        }
    }
    Ok(())
}

/// Pure-Rust 7z extraction (many game repacks ship as .7z). The
/// library sanitizes entry names itself — no path traversal surface.
fn extract_7z(app: &AppHandle, id: &str, file_path: &str, save_path: &str) -> Result<(), String> {
    let file =
        std::fs::File::open(file_path).map_err(|e| format!("cannot open archive: {e}"))?;
    let dest = std::path::Path::new(save_path);
    std::fs::create_dir_all(dest).map_err(|e| format!("cannot create folder: {e}"))?;
    persist_progress_with_extract(app, id, 10, 100, 10, "extracting", None, Some(10));
    let res = sevenz_rust::decompress(file, dest).map_err(|e| format!("corrupt archive: {e}"));
    if res.is_ok() {
        persist_progress_with_extract(app, id, 100, 100, 100, "extracting", None, Some(100));
    }
    res
}

/// RAR extraction via the official UnRAR library (statically linked).
/// UnRAR itself refuses archive entries whose paths escape the
/// destination (`..` traversal is stripped), so this is the safe API.
fn extract_rar(app: &AppHandle, id: &str, file_path: &str, save_path: &str) -> Result<(), String> {
    let dest = std::path::Path::new(save_path);
    std::fs::create_dir_all(dest).map_err(|e| format!("cannot create folder: {e}"))?;

    let total_count = {
        let mut count = 0u32;
        if let Ok(mut scan) =
            unrar::Archive::new(std::path::Path::new(file_path)).open_for_processing()
        {
            while let Ok(Some(header)) = scan.read_header() {
                count += 1;
                if let Ok(next) = header.skip() {
                    scan = next;
                } else {
                    break;
                }
            }
        }
        count.max(1)
    };

    let mut archive = unrar::Archive::new(std::path::Path::new(file_path))
        .open_for_processing()
        .map_err(|e| format!("cannot open archive: {e}"))?;
    let mut current_idx = 0u32;
    let mut last_reported = 0u8;

    while let Some(header) = archive
        .read_header()
        .map_err(|e| format!("corrupt archive: {e}"))?
    {
        archive = header
            .extract_with_base(dest)
            .map_err(|e| format!("cannot extract: {e}"))?;
        current_idx += 1;
        let pct = ((current_idx as f64 / total_count as f64) * 100.0).clamp(0.0, 100.0) as u8;
        if pct != last_reported || current_idx == total_count {
            last_reported = pct;
            persist_progress_with_extract(
                app,
                id,
                current_idx as u64,
                total_count as u64,
                pct as u64,
                "extracting",
                None,
                Some(pct),
            );
        }
    }
    Ok(())
}

/// Many game archives wrap everything in one folder — install *that*
/// folder rather than the messy parent the user picked for the zip.
fn single_root_dir(save_path: &str) -> Option<String> {
    let entries = std::fs::read_dir(save_path).ok()?;
    let mut dirs = Vec::new();
    let mut files = 0;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            dirs.push(path);
        } else {
            files += 1;
        }
    }
    if files == 0 && dirs.len() == 1 {
        dirs.into_iter()
            .next()
            .map(|p| p.to_string_lossy().into_owned())
    } else {
        None
    }
}

/// Picks the most likely game executable from an extracted folder:
/// skips uninstallers/redistributes/anti-cheat helpers, prefers shallow
/// paths, big binaries, and stems that echo the game's name.
fn find_best_exe(dir: &std::path::Path, game_name: &str) -> Option<String> {
    const EXCLUDE: [&str; 13] = [
        "unins", "redist", "setup", "dxsetup", "vcredist", "dotnet", "directx", "crash",
        "unitycrash", "eac", "easyanticheat", "update", "patcher",
    ];
    let name_hint = game_name
        .split(|c: char| !c.is_alphanumeric())
        .find(|w| w.chars().count() >= 3)
        .map(|w| w.to_lowercase());

    let mut best: Option<(i64, String)> = None;
    for entry in walkdir::WalkDir::new(dir)
        .max_depth(3)
        .into_iter()
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let is_runnable = if cfg!(target_os = "linux") {
            ext == "exe" || ext == "sh" || ext == "x86_64" || ext == "bin" || ext == "appimage"
        } else {
            ext == "exe"
        };
        if !is_runnable {
            continue;
        }
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if EXCLUDE.iter().any(|bad| stem.contains(bad)) {
            continue;
        }
        let depth = entry.depth() as i64;
        let size = entry.metadata().map(|m| m.len() as i64).unwrap_or(0);
        let mut score = (8 - depth).max(0) * 200 + size.min(500 * 1024 * 1024) / (1024 * 1024);
        if let Some(hint) = &name_hint {
            if stem.contains(hint.as_str()) {
                score += 5_000;
            }
        }
        if best
            .as_ref()
            .map_or(true, |(top, _)| score > *top)
        {
            best = Some((score, path.to_string_lossy().into_owned()));
        }
    }
    best.map(|(_, p)| p)
}

fn dir_size(dir: &std::path::Path) -> u64 {
    walkdir::WalkDir::new(dir)
        .into_iter()
        .filter_map(Result::ok)
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

/// Marks the linked library game installed and points it at what just
/// landed on disk. Only runs when `game_id` is a real `games` row.
fn link_game_install(app: &AppHandle, game_id: &str, save_path: &str) {
    let game_name: Option<String> = {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.query_row("SELECT name FROM games WHERE id=?1", [game_id], |row| {
            row.get(0)
        })
        .ok()
    };
    let Some(game_name) = game_name else {
        return;
    };

    let install_dir = single_root_dir(save_path).unwrap_or_else(|| save_path.to_string());
    let exe = find_best_exe(std::path::Path::new(&install_dir), &game_name);
    let size = dir_size(std::path::Path::new(&install_dir)) as i64;

    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let _ = conn.execute(
        "UPDATE games SET is_installed=1, install_path=?2, executable_path=COALESCE(?3, executable_path), install_size_bytes=?4 WHERE id=?1",
        rusqlite::params![game_id, install_dir, exe, size],
    );

    #[cfg(target_os = "linux")]
    if let Some(ref exe_path) = exe {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(exe_path) {
            let mut permissions = metadata.permissions();
            let mode = permissions.mode();
            if mode & 0o111 == 0 {
                permissions.set_mode(mode | 0o755);
                let _ = std::fs::set_permissions(exe_path, permissions);
            }
        }
    }
}

fn has_active_siblings(app: &AppHandle, id: &str, game_id: &Option<String>, save_path: &str) -> bool {
    let db = app.state::<Database>();
    let conn = match db.connection.lock() {
        Ok(c) => c,
        Err(_) => return false,
    };

    let count: i64 = if let Some(gid) = game_id {
        conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE id != ?1 AND game_id = ?2 AND status IN ('downloading', 'queued', 'paused')",
            rusqlite::params![id, gid],
            |row| row.get(0),
        ).unwrap_or(0)
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM downloads WHERE id != ?1 AND save_path = ?2 AND status IN ('downloading', 'queued', 'paused')",
            rusqlite::params![id, save_path],
            |row| row.get(0),
        ).unwrap_or(0)
    };

    count > 0
}

fn should_auto_extract(app: &AppHandle, id: &str, game_id: &Option<String>, save_path: &str) -> bool {
    let db = app.state::<Database>();
    let Ok(conn) = db.connection.lock() else { return true; };

    // 1. Check the specific download row
    if let Ok(val) = conn.query_row(
        "SELECT auto_extract FROM downloads WHERE id = ?1",
        [id],
        |row| row.get::<_, i64>(0),
    ) {
        return val != 0;
    }

    // 2. Fallback: check any sibling row for the same game
    if let Some(gid) = game_id {
        if let Ok(val) = conn.query_row(
            "SELECT auto_extract FROM downloads WHERE game_id = ?1 LIMIT 1",
            [gid],
            |row| row.get::<_, i64>(0),
        ) {
            return val != 0;
        }
    }

    // 3. Fallback: check any row for the same save_path
    if let Ok(val) = conn.query_row(
        "SELECT auto_extract FROM downloads WHERE save_path = ?1 LIMIT 1",
        [save_path],
        |row| row.get::<_, i64>(0),
    ) {
        return val != 0;
    }

    true
}

fn find_extractable_master(app: &AppHandle, game_id: &Option<String>, save_path: &str) -> Option<(String, String)> {
    let db = app.state::<Database>();
    let conn = db.connection.lock().ok()?;

    let mut candidates = Vec::new();
    if let Some(gid) = game_id {
        if let Ok(mut stmt) = conn.prepare(
            "SELECT id, file_path FROM downloads WHERE game_id = ?1 AND file_path IS NOT NULL ORDER BY rowid ASC, created_at ASC",
        ) {
            if let Ok(rows) = stmt.query_map(rusqlite::params![gid], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            }) {
                for r in rows.flatten() {
                    candidates.push(r);
                }
            }
        }
    } else if let Ok(mut stmt) = conn.prepare(
        "SELECT id, file_path FROM downloads WHERE save_path = ?1 AND file_path IS NOT NULL ORDER BY rowid ASC, created_at ASC",
    ) {
        if let Ok(rows) = stmt.query_map(rusqlite::params![save_path], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        }) {
            for r in rows.flatten() {
                candidates.push(r);
            }
        }
    }

    for (id, fp) in candidates {
        let lower = fp.to_lowercase();
        if (lower.ends_with(".zip") || lower.ends_with(".7z") || lower.ends_with(".rar")) && !is_subsequent_multipart(&fp) {
            return Some((id, fp));
        }
    }

    None
}

fn cleanup_bundle_archives(app: &AppHandle, game_id: &Option<String>, save_path: &str) {
    let db = app.state::<Database>();
    let Ok(conn) = db.connection.lock() else { return; };
    let mut file_paths: Vec<String> = Vec::new();

    if let Some(gid) = game_id {
        if let Ok(mut stmt) = conn.prepare("SELECT file_path FROM downloads WHERE game_id = ?1 AND file_path IS NOT NULL") {
            if let Ok(rows) = stmt.query_map(rusqlite::params![gid], |row| row.get::<_, String>(0)) {
                for p in rows.flatten() {
                    file_paths.push(p);
                }
            }
        }
    } else if let Ok(mut stmt) = conn.prepare("SELECT file_path FROM downloads WHERE save_path = ?1 AND file_path IS NOT NULL") {
        if let Ok(rows) = stmt.query_map(rusqlite::params![save_path], |row| row.get::<_, String>(0)) {
            for p in rows.flatten() {
                file_paths.push(p);
            }
        }
    }

    for path in file_paths {
        let _ = std::fs::remove_file(path);
    }
}

fn start_next_global_queued_download(app: &AppHandle) -> bool {
    let state = app.state::<DownloadState>();
    if !state.active.lock().expect("mutex poisoned").is_empty() {
        return false;
    }

    let db = app.state::<Database>();
    let Ok(conn) = db.connection.lock() else { return false; };

    let next: Option<(String, String, String, String, Option<String>)> = conn.query_row(
        "SELECT id, url, file_path, save_path, game_id FROM downloads WHERE status = 'queued' ORDER BY rowid ASC, created_at ASC LIMIT 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
    ).ok();

    if let Some((next_id, url, file_path, save_path, gid)) = next {
        let _ = conn.execute("UPDATE downloads SET status = 'downloading' WHERE id = ?1", [&next_id]);
        let gid_opt = gid.filter(|s| !s.is_empty());
        begin_download(app, &state, next_id, url, file_path, save_path, gid_opt, None);
        true
    } else {
        false
    }
}

fn start_next_sequential_part(app: &AppHandle, game_id: &Option<String>, save_path: &str) -> bool {
    let db = app.state::<Database>();
    let Ok(conn) = db.connection.lock() else { return false; };

    let next: Option<(String, String, String, String, Option<String>)> = if let Some(gid) = game_id {
        conn.query_row(
            "SELECT id, url, file_path, save_path, game_id FROM downloads WHERE game_id = ?1 AND status IN ('queued', 'paused') ORDER BY rowid ASC, created_at ASC LIMIT 1",
            [gid],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).ok()
    } else {
        conn.query_row(
            "SELECT id, url, file_path, save_path, game_id FROM downloads WHERE save_path = ?1 AND status IN ('queued', 'paused') ORDER BY rowid ASC, created_at ASC LIMIT 1",
            [save_path],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        ).ok()
    };

    if let Some((next_id, url, file_path, save_path, gid)) = next {
        let _ = conn.execute("UPDATE downloads SET status = 'downloading' WHERE id = ?1", [&next_id]);
        let state = app.state::<DownloadState>();
        let gid_opt = gid.filter(|s| !s.is_empty());
        begin_download(app, &state, next_id, url, file_path, save_path, gid_opt, None);
        true
    } else {
        false
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_download(
    app: AppHandle,
    id: String,
    url: String,
    file_path: String,
    save_path: String,
    game_id: Option<String>,
    saved_chunk_state: Option<String>,
    token: CancellationToken,
    reason: Arc<AtomicU8>,
) {
    let client = download_client();
    let probe = match probe_remote(&client, &url).await {
        Ok(p) => p,
        Err(e) => {
            mark_failed(&app, &id, &e, 0, 0);
            cleanup_active(&app, &id);
            return;
        }
    };
    let file_path = resolve_target_path(
        &app,
        &id,
        &file_path,
        &url,
        &probe,
        saved_chunk_state.is_some(),
    );

    let outcome = run_engine(
        &app,
        &id,
        &url,
        &file_path,
        probe,
        client,
        saved_chunk_state,
        &token,
        &reason,
    )
    .await;

    match outcome {
        EngineOutcome::Completed { total, downloaded } => {
            mark_completed(&app, &id, total, downloaded);

            // If there is a next queued/paused part in sequential mode, start it automatically!
            let next_started = start_next_sequential_part(&app, &game_id, &save_path);

            if !next_started {
                // Defer extraction until all sibling parts are fully downloaded
                let siblings_active = has_active_siblings(&app, &id, &game_id, &save_path);

                if !siblings_active {
                    let auto_extract = should_auto_extract(&app, &id, &game_id, &save_path);
                    if auto_extract {
                        if let Some((master_id, master_file)) = find_extractable_master(&app, &game_id, &save_path) {
                            persist_progress_with_extract(&app, &master_id, 0, 100, 0, "extracting", None, Some(0));
                            let fp = master_file.clone();
                            let sp = save_path.clone();
                            let lower = fp.to_lowercase();
                            let is_7z = lower.ends_with(".7z");
                            let is_rar = lower.ends_with(".rar");
                            let app_clone = app.clone();
                            let m_id = master_id.clone();

                            let extracted = tokio::task::spawn_blocking(move || {
                                if is_7z {
                                    extract_7z(&app_clone, &m_id, &fp, &sp)
                                } else if is_rar {
                                    extract_rar(&app_clone, &m_id, &fp, &sp)
                                } else {
                                    extract_zip(&app_clone, &m_id, &fp, &sp)
                                }
                            })
                            .await
                            .map_err(|e| e.to_string())
                            .and_then(|r| r);

                            if let Err(msg) = extracted {
                                mark_failed(&app, &master_id, &msg, total, downloaded);
                                cleanup_active(&app, &id);
                                return;
                            }

                            let auto_cleanup: bool = {
                                let db = app.state::<Database>();
                                let conn = db.connection.lock().expect("db mutex poisoned");
                                conn.query_row(
                                    "SELECT value FROM settings WHERE key = 'download_auto_cleanup'",
                                    [],
                                    |row| row.get(0),
                                )
                                .map(|v: String| v == "true" || v == "1")
                                .unwrap_or(false)
                            };

                            if auto_cleanup {
                                cleanup_bundle_archives(&app, &game_id, &save_path);
                            }

                            if let Some(gid) = &game_id {
                                let app2 = app.clone();
                                let gid = gid.clone();
                                let sp = save_path.clone();
                                let _ = tokio::task::spawn_blocking(move || {
                                    link_game_install(&app2, &gid, &sp);
                                })
                                .await;
                            }

                            mark_completed(&app, &master_id, total, downloaded);
                            if game_id.is_some() {
                                app.emit(
                                    "download-completed",
                                    DownloadCompleted {
                                        download_id: master_id,
                                        game_id: game_id.clone(),
                                    },
                                )
                                .ok();
                            }
                        } else {
                            // Non-archive file (e.g. standalone executable or setup installer)
                            if let Some(gid) = &game_id {
                                let app2 = app.clone();
                                let gid = gid.clone();
                                let sp = save_path.clone();
                                let _ = tokio::task::spawn_blocking(move || {
                                    link_game_install(&app2, &gid, &sp);
                                })
                                .await;
                            }
                            if game_id.is_some() {
                                app.emit(
                                    "download-completed",
                                    DownloadCompleted {
                                        download_id: id.clone(),
                                        game_id: game_id.clone(),
                                    },
                                )
                                .ok();
                            }
                        }
                    } else {
                        // auto_extract is FALSE: Keep compressed archives untouched, skip cleanup & skip linking
                        if game_id.is_some() {
                            app.emit(
                                "download-completed",
                                DownloadCompleted {
                                    download_id: id.clone(),
                                    game_id: game_id.clone(),
                                },
                            )
                            .ok();
                        }
                    }
                }
        }
    }
    EngineOutcome::Failed => {}
    _ => {}
    }
    cleanup_active(&app, &id);
}

fn cleanup_active(app: &AppHandle, id: &str) {
    app.state::<DownloadState>()
        .active
        .lock()
        .expect("mutex poisoned")
        .remove(id);
}

// ── Tauri commands ───────────────────────────────────────────────────

fn insert_download_row(
    app: &AppHandle,
    id: &str,
    game_id: &str,
    url: &str,
    save_path: &str,
    file_path: &str,
    auto_extract: bool,
) -> AppResult<()> {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    conn.execute(
        "INSERT INTO downloads (id, game_id, url, save_path, file_path, status, auto_extract) VALUES (?1,?2,?3,?4,?5,'downloading',?6)",
        rusqlite::params![id, game_id, url, save_path, file_path, if auto_extract { 1 } else { 0 }],
    )?;
    Ok(())
}

/// Two engines writing the same target file corrupts it (same URL, same
/// file name, or user-typed identical path) — refuse before any row or
/// task exists.
fn reject_duplicate_file(app: &AppHandle, file_path: &str) -> AppResult<()> {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let dup: Option<String> = conn
        .query_row(
            "SELECT id FROM downloads WHERE file_path=?1 AND status IN ('downloading','extracting') LIMIT 1",
            [file_path],
            |row| row.get(0),
        )
        .ok();
    if dup.is_some() {
        return Err(AppError::Invalid(
            "a download for this file is already running".into(),
        ));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn begin_download(
    app: &AppHandle,
    state: &DownloadState,
    id: String,
    url: String,
    file_path: String,
    save_path: String,
    game_id: Option<String>,
    saved_chunk_state: Option<String>,
) {
    let token = CancellationToken::new();
    let reason = Arc::new(AtomicU8::new(REASON_PAUSE));
    let task_id = id.clone();
    let handle = tokio::spawn(run_download(
        app.clone(),
        task_id,
        url,
        file_path,
        save_path,
        game_id,
        saved_chunk_state,
        token.clone(),
        reason.clone(),
    ));
    state
        .active
        .lock()
        .expect("mutex poisoned")
        .insert(
            id,
            Arc::new(ActiveDownload {
                cancel: token,
                reason,
                handle: Mutex::new(Some(handle)),
            }),
        );
}

/// Raw URL download (no game linkage) — kept for "skip search" flows.
#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    game_id: String,
    url: String,
    save_path: String,
    auto_extract: Option<bool>,
) -> AppResult<String> {
    validate_download_url(&url)?;

    // If game_id is linked to a real game, ensure dedicated game subfolder
    let resolved_save_path = {
        let game_name: Option<String> = {
            let db = app.state::<Database>();
            let conn = db.connection.lock().expect("db mutex poisoned");
            conn.query_row("SELECT name FROM games WHERE id=?1", [&game_id], |row| {
                row.get(0)
            })
            .ok()
        };

        if let Some(name) = game_name {
            let safe_folder = sanitize_file_name(&name);
            let path = std::path::Path::new(&save_path);
            let last_part = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
            if last_part.eq_ignore_ascii_case(&safe_folder) {
                save_path
            } else {
                path.join(&safe_folder).to_string_lossy().into_owned()
            }
        } else {
            save_path
        }
    };

    let id = uuid::Uuid::new_v4().to_string();
    let file_path = format!("{resolved_save_path}/{}", file_name_from_url(&url));
    let _ = std::fs::create_dir_all(&resolved_save_path);
    reject_duplicate_file(&app, &file_path)?;
    let extract = auto_extract.unwrap_or(true);
    insert_download_row(
        &app,
        &id,
        &game_id,
        &url,
        &resolved_save_path,
        &file_path,
        extract,
    )?;
    begin_download(
        &app,
        &state,
        id.clone(),
        url,
        file_path,
        resolved_save_path,
        if game_id.is_empty() {
            None
        } else {
            Some(game_id)
        },
        None,
    );
    Ok(id)
}

/// Game-aware download: resolves (or creates, via the hub pipeline) the
/// library entry first, then starts the download linked to it. On
/// completion the engine extracts, detects the exe, and flips the game
/// to installed.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_game_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    db: State<'_, Database>,
    http: State<'_, crate::commands::metadata::HttpClient>,
    token_cache: State<'_, crate::commands::metadata::IgdbTokenCache>,
    igdb_id: i64,
    url: String,
    save_path: String,
    auto_extract: Option<bool>,
) -> AppResult<StartedDownload> {
    validate_download_url(&url)?;

    let game = crate::commands::hub::ensure_library_game(&app, &db, &http, &token_cache, igdb_id)
        .await?;

    // Create a dedicated folder named exactly after the game inside the chosen save_path
    let safe_folder_name = sanitize_file_name(&game.name);
    let resolved_save_path = {
        let path = std::path::Path::new(&save_path);
        let last_part = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
        if last_part.eq_ignore_ascii_case(&safe_folder_name) {
            save_path
        } else {
            path.join(&safe_folder_name).to_string_lossy().into_owned()
        }
    };

    let id = uuid::Uuid::new_v4().to_string();
    let file_path = format!("{resolved_save_path}/{}", file_name_from_url(&url));
    let _ = std::fs::create_dir_all(&resolved_save_path);
    reject_duplicate_file(&app, &file_path)?;
    let extract = auto_extract.unwrap_or(true);
    insert_download_row(
        &app,
        &id,
        &game.id,
        &url,
        &resolved_save_path,
        &file_path,
        extract,
    )?;
    begin_download(
        &app,
        &state,
        id.clone(),
        url,
        file_path,
        resolved_save_path,
        Some(game.id.clone()),
        None,
    );
    Ok(StartedDownload {
        download_id: id,
        game,
    })
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn start_batch_downloads(
    app: AppHandle,
    state: State<'_, DownloadState>,
    db: State<'_, Database>,
    http: State<'_, crate::commands::metadata::HttpClient>,
    token_cache: State<'_, crate::commands::metadata::IgdbTokenCache>,
    urls: Vec<String>,
    save_path: String,
    game_id: Option<String>,
    igdb_id: Option<u64>,
    sequential: bool,
    auto_extract: Option<bool>,
) -> AppResult<Vec<String>> {
    if urls.is_empty() {
        return Err(AppError::Invalid("no download urls provided".into()));
    }

    for u in &urls {
        validate_download_url(u)?;
    }

    let (resolved_game_id, resolved_save_path) = if let Some(iid) = igdb_id {
        let game = crate::commands::hub::ensure_library_game(&app, &db, &http, &token_cache, iid as i64).await?;
        let safe_folder = sanitize_file_name(&game.name);
        let path = std::path::Path::new(&save_path);
        let last_part = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
        let final_path = if last_part.eq_ignore_ascii_case(&safe_folder) {
            save_path.clone()
        } else {
            path.join(&safe_folder).to_string_lossy().into_owned()
        };
        (Some(game.id), final_path)
    } else if let Some(gid) = game_id {
        let game_name: Option<String> = {
            let conn = db.connection.lock().expect("db mutex poisoned");
            conn.query_row("SELECT name FROM games WHERE id=?1", [&gid], |row| row.get(0)).ok()
        };
        let final_path = if let Some(name) = game_name {
            let safe_folder = sanitize_file_name(&name);
            let path = std::path::Path::new(&save_path);
            let last_part = path.file_name().and_then(|f| f.to_str()).unwrap_or("");
            if last_part.eq_ignore_ascii_case(&safe_folder) {
                save_path.clone()
            } else {
                path.join(&safe_folder).to_string_lossy().into_owned()
            }
        } else {
            save_path.clone()
        };
        (Some(gid), final_path)
    } else {
        (None, save_path.clone())
    };

    let _ = std::fs::create_dir_all(&resolved_save_path);

    let mut created_ids = Vec::new();
    let extract_flag = if auto_extract.unwrap_or(true) { 1 } else { 0 };

    for (idx, single_url) in urls.into_iter().enumerate() {
        let id = uuid::Uuid::new_v4().to_string();
        let file_path = format!("{resolved_save_path}/{}", file_name_from_url(&single_url));
        
        let initial_status = if sequential && idx > 0 {
            "queued"
        } else if sequential && idx == 0 {
            if state.active.lock().expect("mutex poisoned").is_empty() {
                "downloading"
            } else {
                "queued"
            }
        } else {
            "downloading"
        };

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            conn.execute(
                "INSERT INTO downloads (id, game_id, url, save_path, file_path, status, auto_extract) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    id,
                    resolved_game_id.as_deref().unwrap_or(""),
                    single_url,
                    resolved_save_path,
                    file_path,
                    initial_status,
                    extract_flag
                ],
            )?;
        }

        if initial_status == "downloading" {
            begin_download(
                &app,
                &state,
                id.clone(),
                single_url,
                file_path,
                resolved_save_path.clone(),
                resolved_game_id.clone(),
                None,
            );
        }

        created_ids.push(id);
    }

    Ok(created_ids)
}

#[tauri::command]
pub async fn queue_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    db: State<'_, Database>,
    id: String,
    queue: bool,
) -> AppResult<()> {
    if queue {
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            conn.execute(
                "UPDATE downloads SET status='queued', speed_bps=0, updated_at=datetime('now') WHERE id=?1 AND status IN ('paused','failed')",
                [&id],
            )?;
        }
        start_next_global_queued_download(&app);
    } else {
        let active = state.active.lock().expect("mutex poisoned").get(&id).cloned();
        if let Some(active) = active {
            active.reason.store(REASON_PAUSE, Ordering::SeqCst);
            active.cancel.cancel();
            let handle = active.handle.lock().expect("mutex poisoned").take();
            if let Some(handle) = handle {
                let _ = tokio::time::timeout(Duration::from_millis(250), handle).await;
                state.active.lock().expect("mutex poisoned").remove(&id);
            }
        }
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            conn.execute(
                "UPDATE downloads SET status='paused', speed_bps=0, updated_at=datetime('now') WHERE id=?1 AND status IN ('queued','downloading','extracting')",
                [&id],
            )?;
        }
        start_next_global_queued_download(&app);
    }
    Ok(())
}

#[tauri::command]
pub async fn queue_bundle(
    app: AppHandle,
    state: State<'_, DownloadState>,
    db: State<'_, Database>,
    game_id: Option<String>,
    save_path: String,
    queue: bool,
) -> AppResult<()> {
    if queue {
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some(gid) = &game_id {
                conn.execute(
                    "UPDATE downloads SET status='queued', speed_bps=0, updated_at=datetime('now') WHERE game_id=?1 AND status IN ('paused','failed')",
                    [gid],
                )?;
            } else {
                conn.execute(
                    "UPDATE downloads SET status='queued', speed_bps=0, updated_at=datetime('now') WHERE save_path=?1 AND status IN ('paused','failed')",
                    [&save_path],
                )?;
            }
        }
        start_next_global_queued_download(&app);
    } else {
        let to_pause: Vec<String> = {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some(gid) = &game_id {
                let mut stmt = conn.prepare("SELECT id FROM downloads WHERE game_id=?1 AND status IN ('downloading','extracting','queued')")?;
                let rows = stmt.query_map([gid], |r| r.get(0))?;
                rows.flatten().collect()
            } else {
                let mut stmt = conn.prepare("SELECT id FROM downloads WHERE save_path=?1 AND status IN ('downloading','extracting','queued')")?;
                let rows = stmt.query_map([&save_path], |r| r.get(0))?;
                rows.flatten().collect()
            }
        };

        for id in to_pause {
            let active = state.active.lock().expect("mutex poisoned").get(&id).cloned();
            if let Some(active) = active {
                active.reason.store(REASON_PAUSE, Ordering::SeqCst);
                active.cancel.cancel();
            }
        }

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some(gid) = &game_id {
                conn.execute(
                    "UPDATE downloads SET status='paused', speed_bps=0, updated_at=datetime('now') WHERE game_id=?1 AND status IN ('downloading','extracting','queued')",
                    [gid],
                )?;
            } else {
                conn.execute(
                    "UPDATE downloads SET status='paused', speed_bps=0, updated_at=datetime('now') WHERE save_path=?1 AND status IN ('downloading','extracting','queued')",
                    [&save_path],
                )?;
            }
        }
        start_next_global_queued_download(&app);
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_queue_sequential(
    app: AppHandle,
    _state: State<'_, DownloadState>,
    db: State<'_, Database>,
) -> AppResult<()> {
    {
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE downloads SET status='queued', speed_bps=0, updated_at=datetime('now') WHERE status IN ('paused','failed')",
            [],
        )?;
    }
    start_next_global_queued_download(&app);
    Ok(())
}

#[tauri::command]
pub async fn pause_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    id: String,
) -> AppResult<()> {
    let active = state.active.lock().expect("mutex poisoned").get(&id).cloned();
    if let Some(active) = active {
        active.reason.store(REASON_PAUSE, Ordering::SeqCst);
        active.cancel.cancel();
        let handle = active.handle.lock().expect("mutex poisoned").take();
        if let Some(handle) = handle {
            let _ = tokio::time::timeout(Duration::from_millis(250), handle).await;
            state.active.lock().expect("mutex poisoned").remove(&id);
        }
    }
    {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE downloads SET status='paused', speed_bps=0, updated_at=datetime('now') WHERE id=?1 AND status IN ('downloading','extracting','queued')",
            [&id],
        )?;
        if let Ok(info) = conn.query_row(
            "SELECT id, total_bytes, downloaded_bytes, speed_bps, status, error_message FROM downloads WHERE id=?1",
            [&id],
            |row| Ok(DownloadProgress {
                id: row.get(0)?,
                total_bytes: row.get::<_, i64>(1)? as u64,
                downloaded_bytes: row.get::<_, i64>(2)? as u64,
                speed_bps: 0,
                status: "paused".into(),
                error_message: None,
                chunks: None,
                extract_percent: None,
            })
        ) {
            let _ = app.emit("download-updated", info);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    id: String,
) -> AppResult<()> {
    if state.active.lock().expect("mutex poisoned").contains_key(&id) {
        return Err(AppError::Invalid("download is already running".into()));
    }
    let (url, save_path, stored_path, game_id, saved_chunk_state) =
        load_row(&app, &id).ok_or_else(|| AppError::NotFound("download not found".into()))?;

    let file_path = if stored_path.is_empty() {
        format!("{save_path}/{}", file_name_from_url(&url))
    } else {
        stored_path
    };

    {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.execute(
            "UPDATE downloads SET status='downloading', file_path=?1, error_message=NULL, updated_at=datetime('now') WHERE id=?2 AND status IN ('paused','failed')",
            rusqlite::params![file_path, id],
        )?;
        // Instantly notify UI so cards immediately switch to downloading with no delay
        if let Ok(info) = conn.query_row(
            "SELECT id, total_bytes, downloaded_bytes, speed_bps, status, error_message FROM downloads WHERE id=?1",
            [&id],
            |row| Ok(DownloadProgress {
                id: row.get(0)?,
                total_bytes: row.get::<_, i64>(1)? as u64,
                downloaded_bytes: row.get::<_, i64>(2)? as u64,
                speed_bps: 0,
                status: "downloading".into(),
                error_message: None,
                chunks: None,
                extract_percent: None,
            })
        ) {
            let _ = app.emit("download-updated", info);
        }
    }

    // link_game_install no-ops on ids that aren't a real games row, so
    // raw downloads ("new-download") can pass through untouched.
    let game_id = if game_id.is_empty() {
        None
    } else {
        Some(game_id)
    };

    begin_download(
        &app,
        &state,
        id,
        url,
        file_path,
        save_path,
        game_id,
        saved_chunk_state,
    );
    Ok(())
}

#[tauri::command]
pub async fn cancel_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    id: String,
) -> AppResult<()> {
    let active = state.active.lock().expect("mutex poisoned").get(&id).cloned();
    if let Some(active) = active {
        active.reason.store(REASON_CANCEL, Ordering::SeqCst);
        active.cancel.cancel();
        let handle = active.handle.lock().expect("mutex poisoned").take();
        if let Some(handle) = handle {
            let _ = tokio::time::timeout(Duration::from_millis(250), handle).await;
            state.active.lock().expect("mutex poisoned").remove(&id);
        }
    }
    let file_path = load_row(&app, &id).map(|(_, _, fp, _, _)| fp);
    {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM downloads WHERE id=?1", [&id])?;
    }
    if let Some(fp) = file_path {
        if !fp.is_empty() {
            tokio::task::spawn_blocking(move || {
                let _ = std::fs::remove_file(&fp);
            });
        }
    }
    let _ = app.emit(
        "download-updated",
        DownloadProgress {
            id: id.clone(),
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bps: 0,
            status: "cancelled".into(),
            error_message: None,
            chunks: None,
            extract_percent: None,
        },
    );
    Ok(())
}

/// Removes a download row from the list (active, paused, failed or completed).
/// If `delete_file` is true, only the downloaded archive file (e.g. .zip / .rar / partial chunks)
/// is deleted from disk, leaving any installed game directory completely intact.
#[tauri::command]
pub async fn delete_download(
    app: AppHandle,
    state: State<'_, DownloadState>,
    db: State<'_, Database>,
    id: String,
    delete_file: Option<bool>,
) -> AppResult<()> {
    // 1. If actively downloading/extracting, cancel background task first
    let active = state.active.lock().expect("mutex poisoned").get(&id).cloned();
    if let Some(active) = active {
        active.reason.store(REASON_CANCEL, Ordering::SeqCst);
        active.cancel.cancel();
        let handle = active.handle.lock().expect("mutex poisoned").take();
        if let Some(handle) = handle {
            let _ = tokio::time::timeout(Duration::from_millis(250), handle).await;
            state.active.lock().expect("mutex poisoned").remove(&id);
        }
    }

    // 2. Delete file if requested (in background task so disk I/O doesn't block IPC)
    let file_path = if delete_file.unwrap_or(false) {
        load_row(&app, &id).map(|(_, _, fp, _, _)| fp)
    } else {
        None
    };

    // 3. Delete row from SQLite unconditionally
    {
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.execute("DELETE FROM downloads WHERE id=?1", [&id])?;
    }

    if let Some(fp) = file_path {
        if !fp.is_empty() {
            tokio::task::spawn_blocking(move || {
                let _ = std::fs::remove_file(&fp);
            });
        }
    }

    let _ = app.emit(
        "download-updated",
        DownloadProgress {
            id: id.clone(),
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bps: 0,
            status: "cancelled".into(),
            error_message: None,
            chunks: None,
            extract_percent: None,
        },
    );
    Ok(())
}

#[tauri::command]
pub fn get_downloads(db: State<'_, Database>) -> AppResult<Vec<DownloadInfo>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let mut stmt = conn.prepare(
        "SELECT id, game_id, url, save_path, COALESCE(file_path,''), total_bytes, downloaded_bytes, status, error_message, speed_bps, created_at, updated_at, COALESCE(auto_extract, 1) FROM downloads ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(DownloadInfo {
            id: row.get(0)?,
            game_id: row.get(1)?,
            url: row.get(2)?,
            save_path: row.get(3)?,
            file_path: row.get(4)?,
            total_bytes: row.get::<_, i64>(5)? as u64,
            downloaded_bytes: row.get::<_, i64>(6)? as u64,
            status: row.get(7)?,
            error_message: row.get(8)?,
            speed_bps: row.get::<_, i64>(9)? as u64,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
            auto_extract: row.get::<_, i64>(12)? != 0,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[tauri::command]
pub fn get_download_progress(
    db: State<'_, Database>,
    id: String,
) -> AppResult<DownloadProgress> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    conn.query_row(
        "SELECT id, downloaded_bytes, total_bytes, speed_bps, status, error_message FROM downloads WHERE id=?1",
        [&id],
        |row| {
            let status: String = row.get(4)?;
            let speed_bps: u64 = row.get::<_, i64>(3)? as u64;
            let extract_percent = if status == "extracting" {
                Some(speed_bps.clamp(0, 100) as u8)
            } else {
                None
            };
            Ok(DownloadProgress {
                id: row.get(0)?,
                downloaded_bytes: row.get::<_, i64>(1)? as u64,
                total_bytes: row.get::<_, i64>(2)? as u64,
                speed_bps,
                status,
                error_message: row.get(5)?,
                chunks: None,
                extract_percent,
            })
        },
    )
    .map_err(|e| AppError::NotFound(e.to_string()))
}

/// Boot recovery: chunk tasks die with the process, so any row still
/// mid-flight is orphaned. Flipping it to `paused` lets the user resume
/// from the persisted chunk state instead of staring at a frozen bar.
pub fn recover_orphaned_downloads(app: &AppHandle) {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let _ = conn.execute(
        "UPDATE downloads SET status='paused', speed_bps=0, updated_at=datetime('now') WHERE status IN ('downloading','extracting')",
        [],
    );
}
