-- Core schema for the single-user library.
--
-- Design notes:
--  * IDs are TEXT (UUID v4, generated in Rust) rather than INTEGER
--    AUTOINCREMENT so that IDs can be created client-side (e.g. by a
--    future scan/import step) before a row is inserted, without a
--    round-trip to get an assigned integer back.
--  * Boolean flags are stored as INTEGER 0/1 (SQLite has no native
--    boolean type); `rusqlite` maps Rust `bool` to/from this directly.
--  * Timestamps are TEXT in ISO 8601 (via rusqlite's `chrono` feature),
--    which sorts correctly as plain text and is human-readable when
--    inspecting the .db file directly during development.
--  * `genres` is a JSON-encoded TEXT array rather than a normalized
--    genres table: genres come from IGDB as a small, per-game list that
--    is only ever displayed, never filtered by relational JOINs in a
--    performance-sensitive way at this app's scale — a normalized table
--    would add migration/write complexity for no real benefit here.
--    Tags, by contrast, are user-created and filtered/managed directly,
--    so they get a proper many-to-many table below.

CREATE TABLE games (
    id                          TEXT PRIMARY KEY,
    name                        TEXT NOT NULL,

    -- Local install
    executable_path             TEXT,
    install_path                TEXT,
    install_size_bytes          INTEGER,
    version                     TEXT,
    launch_arguments            TEXT,
    is_installed                INTEGER NOT NULL DEFAULT 1,

    -- Provenance (Epic 5: which store this was detected from, if any)
    source                      TEXT NOT NULL DEFAULT 'manual',
    steam_app_id                TEXT,

    -- User state
    is_favorite                 INTEGER NOT NULL DEFAULT 0,
    is_hidden                   INTEGER NOT NULL DEFAULT 0,

    -- Metadata (Epic 6: populated from IGDB/SteamGridDB, cached locally)
    description                 TEXT,
    developer                   TEXT,
    publisher                   TEXT,
    release_date                TEXT,
    genres                      TEXT NOT NULL DEFAULT '[]',
    metacritic_score            INTEGER,
    opencritic_score            INTEGER,
    trailer_url                 TEXT,

    -- Artwork (Epic 9/10: paths into the local artwork cache directory)
    cover_path                  TEXT,
    banner_path                 TEXT,
    logo_path                   TEXT,
    background_path             TEXT,
    animated_cover_enabled      INTEGER NOT NULL DEFAULT 1,

    -- Playtime (Epic 11 writes to this; playtime_sessions is the detailed log)
    total_playtime_seconds      INTEGER NOT NULL DEFAULT 0,
    last_played_at              TEXT,

    added_at                    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_games_is_favorite ON games (is_favorite);
CREATE INDEX idx_games_is_hidden ON games (is_hidden);
CREATE INDEX idx_games_is_installed ON games (is_installed);
CREATE INDEX idx_games_last_played_at ON games (last_played_at);
CREATE INDEX idx_games_steam_app_id ON games (steam_app_id);

CREATE TABLE collections (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE collection_games (
    collection_id   TEXT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    game_id         TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    added_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (collection_id, game_id)
);

CREATE TABLE tags (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    color   TEXT NOT NULL DEFAULT '#7c5cff'
);

CREATE TABLE game_tags (
    game_id     TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    tag_id      TEXT NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    PRIMARY KEY (game_id, tag_id)
);

-- One row per play session. `games.total_playtime_seconds` and
-- `games.last_played_at` are denormalized copies kept in sync by the
-- Epic 11 launch commands, so the library grid never needs to
-- aggregate this table just to render a playtime badge.
CREATE TABLE playtime_sessions (
    id                  TEXT PRIMARY KEY,
    game_id             TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    duration_seconds    INTEGER
);

CREATE INDEX idx_playtime_sessions_game_id ON playtime_sessions (game_id);

-- Tracks every artwork asset per game so Epic 10's "Reset Artwork" can
-- distinguish an auto-downloaded file from a user-replaced one, and so
-- multiple screenshots can exist per game via `ordinal`.
CREATE TABLE artwork_cache (
    game_id     TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (
        kind IN ('cover', 'banner', 'logo', 'background', 'screenshot')
    ),
    ordinal     INTEGER NOT NULL DEFAULT 0,
    local_path  TEXT NOT NULL,
    source_url  TEXT,
    is_custom   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (game_id, kind, ordinal)
);

-- Generic key-value store for app settings (theme, palette, blur
-- intensity, grid density, ...). A single flexible table beats one
-- column per setting: Epic 13 can add new settings without a migration
-- for each one, and the frontend already treats settings as an
-- arbitrary JSON-serializable bag via `get_setting`/`set_setting`.
CREATE TABLE settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL
);
