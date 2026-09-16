-- Migration 0010: Production-grade multi-profile system with isolated per-profile game saves

CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'gamepad',
    color TEXT NOT NULL DEFAULT '#7c5cff',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_save_locations (
    id TEXT PRIMARY KEY,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    location_type TEXT NOT NULL
        CHECK (
            location_type IN (
                'save',
                'profile',
                'config',
                'metadata',
                'unknown'
            )
        ),
    detection_source TEXT NOT NULL
        CHECK (
            detection_source IN (
                'heuristic',
                'manual'
            )
        ),
    confidence INTEGER NOT NULL DEFAULT 0
        CHECK (confidence >= 0 AND confidence <= 100),
    is_enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profile_game_saves (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    current_path TEXT NOT NULL,
    last_synced_at TEXT,
    last_snapshot_at TEXT,
    file_count INTEGER NOT NULL DEFAULT 0,
    save_size_bytes INTEGER NOT NULL DEFAULT 0,
    content_hash TEXT,
    state TEXT NOT NULL DEFAULT 'unknown'
        CHECK (
            state IN (
                'unknown',
                'empty',
                'ready',
                'modified',
                'missing',
                'corrupt',
                'error'
            )
        ),
    PRIMARY KEY (profile_id, game_id)
);

CREATE TABLE IF NOT EXISTS save_operations (
    id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL DEFAULT 1,
    operation_type TEXT NOT NULL
        CHECK (
            operation_type IN (
                'prepare_launch',
                'sync_exit',
                'restore_snapshot',
                'clone_save'
            )
        ),
    game_id TEXT,
    profile_id TEXT,
    state TEXT NOT NULL
        CHECK (
            state IN (
                'started',
                'validated',
                'preflight_verified',
                'snapshot_created',
                'snapshot_verified',
                'staging_created',
                'staging_verified',
                'commit_started',
                'commit_completed',
                'final_verified',
                'completed',
                'failed',
                'rollback_required',
                'rolled_back',
                'recovery_required',
                'recovered'
            )
        ),
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error_code TEXT,
    error_message TEXT
);

CREATE TABLE IF NOT EXISTS save_operation_locations (
    operation_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    original_hash TEXT,
    staged_hash TEXT,
    final_hash TEXT,
    state TEXT NOT NULL,
    backup_path TEXT,
    staging_path TEXT,
    PRIMARY KEY (operation_id, location_id),
    FOREIGN KEY (operation_id)
        REFERENCES save_operations(id)
        ON DELETE CASCADE,
    FOREIGN KEY (location_id)
        REFERENCES game_save_locations(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_save_operations_game_id ON save_operations(game_id);
CREATE INDEX IF NOT EXISTS idx_save_operations_profile_id ON save_operations(profile_id);
CREATE INDEX IF NOT EXISTS idx_save_operations_state ON save_operations(state);
CREATE INDEX IF NOT EXISTS idx_save_operations_started_at ON save_operations(started_at);
CREATE INDEX IF NOT EXISTS idx_profile_game_saves_game_id ON profile_game_saves(game_id);
CREATE INDEX IF NOT EXISTS idx_profile_game_saves_profile_id ON profile_game_saves(profile_id);
CREATE INDEX IF NOT EXISTS idx_game_save_locations_game_id ON game_save_locations(game_id);
CREATE INDEX IF NOT EXISTS idx_save_operation_locations_operation_id ON save_operation_locations(operation_id);
CREATE INDEX IF NOT EXISTS idx_save_operation_locations_location_id ON save_operation_locations(location_id);

-- Seed default profile and configuration settings
INSERT OR IGNORE INTO profiles (id, name, avatar, color)
VALUES ('default', 'Main Player', 'gamepad', '#7c5cff');

INSERT OR IGNORE INTO settings (key, value) VALUES
    ('active_profile_id', 'default'),
    ('profile_select_on_startup', 'true'),
    ('snapshot_retention_count', '10'),
    ('snapshot_size_threshold_bytes', '2147483648');
