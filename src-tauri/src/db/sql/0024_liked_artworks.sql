-- 0024_liked_artworks.sql
CREATE TABLE IF NOT EXISTS liked_artworks (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    game_name       TEXT,
    author          TEXT,
    source          TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'wallpaper',
    image_url       TEXT NOT NULL,
    thumb_url       TEXT NOT NULL,
    width           INTEGER,
    height          INTEGER,
    file_size_bytes INTEGER,
    file_format     TEXT,
    page_url        TEXT,
    liked_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_liked_artworks_liked_at ON liked_artworks (liked_at DESC);
