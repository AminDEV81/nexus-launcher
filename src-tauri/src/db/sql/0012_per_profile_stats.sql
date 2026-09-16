-- 0012_per_profile_stats.sql
-- Production-grade per-profile playtime and statistics migration.
-- Preserves all existing session data, IDs, timestamps, and durations while
-- assigning all existing historical sessions to the default profile ('default' / Amin).

-- 1. Create the target table with profile_id NOT NULL and CASCADE delete
CREATE TABLE playtime_sessions_new (
    id                  TEXT PRIMARY KEY,
    game_id             TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    profile_id          TEXT NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    duration_seconds    INTEGER
);

-- 2. Backfill existing historical sessions into the new table, assigning to 'default' (Amin)
INSERT INTO playtime_sessions_new (id, game_id, profile_id, started_at, ended_at, duration_seconds)
SELECT
    id,
    game_id,
    COALESCE(
        (SELECT value FROM settings WHERE key = 'active_profile_id'),
        'default'
    ),
    started_at,
    ended_at,
    duration_seconds
FROM playtime_sessions;

-- 3. Invariant check: Assert no rows were lost or skipped during the migration
INSERT INTO playtime_sessions_new (id, game_id, profile_id, started_at, ended_at, duration_seconds)
SELECT '__fail_if_mismatch__', '__fail__', '__fail__', '__fail__', '__fail__', 0
WHERE (SELECT COUNT(*) FROM playtime_sessions) != (SELECT COUNT(*) FROM playtime_sessions_new);

DELETE FROM playtime_sessions_new WHERE id = '__fail_if_mismatch__';

-- 4. Replace old table with new table
DROP TABLE playtime_sessions;
ALTER TABLE playtime_sessions_new RENAME TO playtime_sessions;

-- 5. Create performance indexes
CREATE INDEX idx_playtime_sessions_game_id ON playtime_sessions (game_id);
CREATE INDEX idx_playtime_sessions_profile_id ON playtime_sessions (profile_id);
CREATE INDEX idx_playtime_sessions_profile_game ON playtime_sessions (profile_id, game_id);
CREATE INDEX idx_playtime_sessions_profile_started ON playtime_sessions (profile_id, started_at);
