CREATE TABLE IF NOT EXISTS overlay_config (
    id TEXT PRIMARY KEY DEFAULT 'default',
    schema_version INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
