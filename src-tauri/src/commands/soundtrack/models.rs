use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackAlbum {
    pub id: String,
    pub game_id: Option<String>,
    pub title: String,
    pub album_type: String, // original_soundtrack, original_score, radio, gamerip, etc.
    pub artist: Option<String>,
    pub release_date: Option<String>,
    pub cover_url: Option<String>,
    pub track_count: i64,
    pub total_duration_ms: i64,
    pub provider_id: String,
    pub external_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackTrack {
    pub id: String,
    pub album_id: String,
    pub disc_number: i64,
    pub track_number: i64,
    pub title: String,
    pub artist: Option<String>,
    pub duration_ms: i64,
    pub preview_url: Option<String>,
    pub stream_url: Option<String>,
    pub download_url: Option<String>,
    pub local_path: Option<String>,
    pub provider_id: String,
    pub external_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackAlbumWithTracks {
    pub album: SoundtrackAlbum,
    pub tracks: Vec<SoundtrackTrack>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackFavorite {
    pub id: String,
    pub target_type: String, // track, album
    pub target_id: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackPlayHistory {
    pub id: String,
    pub track_id: String,
    pub album_id: Option<String>,
    pub game_id: Option<String>,
    pub played_at: String,
    pub duration_played_ms: i64,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadSoundtrackRequest {
    pub download_id: String,
    pub track_id: Option<String>,
    pub album_id: Option<String>,
    pub game_id: Option<String>,
    pub url: String,
    pub target_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackDownload {
    pub id: String,
    pub track_id: Option<String>,
    pub album_id: Option<String>,
    pub game_id: Option<String>,
    pub url: String,
    pub save_path: String,
    pub total_bytes: i64,
    pub downloaded_bytes: i64,
    pub status: String, // queued, downloading, paused, completed, failed, cancelled
    pub error_message: Option<String>,
    pub speed_bps: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundtrackLocalFile {
    pub id: String,
    pub file_path: String,
    pub file_size: i64,
    pub game_id: Option<String>,
    pub album_id: Option<String>,
    pub track_id: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration_ms: i64,
    pub format: Option<String>,
    pub scanned_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoundtrackDownloadProgress {
    pub id: String,
    pub track_id: Option<String>,
    pub album_id: Option<String>,
    pub downloaded_bytes: i64,
    pub total_bytes: i64,
    pub speed_bps: i64,
    pub status: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadCompletePayload {
    pub id: String,
    pub track_id: Option<String>,
    pub local_path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SoundtrackScanProgress {
    pub current_path: String,
    pub files_found: usize,
    pub files_processed: usize,
    pub is_complete: bool,
}
