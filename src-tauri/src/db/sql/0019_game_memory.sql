-- 0019_game_memory.sql
-- Adds `is_memory` column to `games` table for the Memory section.
-- When a user removes a game from the active library, it is archived to Memory
-- rather than destroyed, preserving all playtime sessions and stats permanently.

ALTER TABLE games ADD COLUMN is_memory BOOLEAN NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_games_is_memory ON games (is_memory);
