-- 0016_soundtracks.sql
-- Subsystem schema for Nexus Game Soundtrack Discovery, Playback, Download, and Local Library.

CREATE TABLE IF NOT EXISTS soundtrack_providers (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    priority        INTEGER NOT NULL DEFAULT 0,
    enabled         INTEGER NOT NULL DEFAULT 1,
    health_status   TEXT NOT NULL DEFAULT 'healthy',
    last_checked_at TEXT
);

CREATE TABLE IF NOT EXISTS soundtrack_albums (
    id                  TEXT PRIMARY KEY,
    game_id             TEXT,
    title               TEXT NOT NULL,
    type                TEXT NOT NULL DEFAULT 'original_soundtrack',
    artist              TEXT,
    release_date        TEXT,
    cover_url           TEXT,
    track_count         INTEGER NOT NULL DEFAULT 0,
    total_duration_ms   INTEGER NOT NULL DEFAULT 0,
    provider_id         TEXT NOT NULL,
    external_id         TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soundtrack_tracks (
    id              TEXT PRIMARY KEY,
    album_id        TEXT NOT NULL REFERENCES soundtrack_albums(id) ON DELETE CASCADE,
    disc_number     INTEGER NOT NULL DEFAULT 1,
    track_number    INTEGER NOT NULL DEFAULT 1,
    title           TEXT NOT NULL,
    artist          TEXT,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    preview_url     TEXT,
    stream_url      TEXT,
    download_url    TEXT,
    local_path      TEXT,
    provider_id     TEXT NOT NULL,
    external_id     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soundtrack_game_links (
    id          TEXT PRIMARY KEY,
    game_id     TEXT NOT NULL,
    album_id    TEXT NOT NULL REFERENCES soundtrack_albums(id) ON DELETE CASCADE,
    confidence  REAL NOT NULL DEFAULT 1.0,
    is_manual   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(game_id, album_id)
);

CREATE TABLE IF NOT EXISTS soundtrack_favorites (
    id          TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id   TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(target_type, target_id)
);

CREATE TABLE IF NOT EXISTS soundtrack_play_history (
    id                  TEXT PRIMARY KEY,
    track_id            TEXT NOT NULL,
    album_id            TEXT,
    game_id             TEXT,
    played_at           TEXT NOT NULL DEFAULT (datetime('now')),
    duration_played_ms  INTEGER NOT NULL DEFAULT 0,
    completed           INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS soundtrack_queue (
    id          TEXT PRIMARY KEY,
    track_id    TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    added_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soundtrack_downloads (
    id                  TEXT PRIMARY KEY,
    track_id            TEXT,
    album_id            TEXT,
    game_id             TEXT,
    url                 TEXT NOT NULL,
    save_path           TEXT NOT NULL,
    total_bytes         INTEGER NOT NULL DEFAULT 0,
    downloaded_bytes    INTEGER NOT NULL DEFAULT 0,
    status              TEXT NOT NULL DEFAULT 'queued',
    error_message       TEXT,
    speed_bps           INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soundtrack_local_files (
    id              TEXT PRIMARY KEY,
    file_path       TEXT NOT NULL UNIQUE,
    file_size       INTEGER NOT NULL DEFAULT 0,
    game_id         TEXT,
    album_id        TEXT,
    track_id        TEXT,
    title           TEXT,
    artist          TEXT,
    album           TEXT,
    duration_ms     INTEGER NOT NULL DEFAULT 0,
    format          TEXT,
    scanned_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS soundtrack_cache (
    cache_key       TEXT PRIMARY KEY,
    data_json       TEXT NOT NULL,
    expires_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_soundtrack_albums_game ON soundtrack_albums(game_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_tracks_album ON soundtrack_tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_tracks_provider ON soundtrack_tracks(provider_id, external_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_links_game ON soundtrack_game_links(game_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_favorites_target ON soundtrack_favorites(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_history_track ON soundtrack_play_history(track_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_history_time ON soundtrack_play_history(played_at);
CREATE INDEX IF NOT EXISTS idx_soundtrack_downloads_status ON soundtrack_downloads(status);
CREATE INDEX IF NOT EXISTS idx_soundtrack_local_game ON soundtrack_local_files(game_id);
CREATE INDEX IF NOT EXISTS idx_soundtrack_cache_expires ON soundtrack_cache(expires_at);
