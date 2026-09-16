-- 0008_download_manager.sql
CREATE TABLE IF NOT EXISTS downloads (
    id              TEXT PRIMARY KEY,
    game_id         TEXT NOT NULL,
    url             TEXT NOT NULL,
    save_path       TEXT NOT NULL,
    file_path       TEXT,
    total_bytes     INTEGER NOT NULL DEFAULT 0,
    downloaded_bytes INTEGER NOT NULL DEFAULT 0,
    status          TEXT NOT NULL DEFAULT 'queued',
    error_message   TEXT,
    speed_bps       INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_downloads_game_id ON downloads(game_id);
CREATE INDEX IF NOT EXISTS idx_downloads_status  ON downloads(status);
