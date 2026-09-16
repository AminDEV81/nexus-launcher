-- Migration 0017: Metadata Cache and Provider Settings
-- Layer 1 Local Cache for metadata and artwork query responses.

CREATE TABLE IF NOT EXISTS metadata_cache (
    cache_key   TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    payload     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_metadata_cache_category ON metadata_cache (category);
CREATE INDEX IF NOT EXISTS idx_metadata_cache_expires_at ON metadata_cache (expires_at);

-- Default metadata_provider_mode setting to 'public' for all existing and new installations
INSERT OR IGNORE INTO settings (key, value) VALUES ('metadata_provider_mode', 'public');
