-- Game Hub: remembers which IGDB entry a library game originated from,
-- so "Add to Library" from the hub can dedupe against games already in
-- the library (the existing executable_path check can't — hub games are
-- added with no local install at all). Nullable: every game added
-- before the hub, or matched to IGDB only loosely by name, simply has
-- no IGDB identity stored.
--
-- The unique index is partial (WHERE igdb_id IS NOT NULL): SQLite
-- treats NULLs as distinct from each other, so multiple unmatched
-- games coexist while the same IGDB game can never be added twice.
ALTER TABLE games ADD COLUMN igdb_id INTEGER;

CREATE UNIQUE INDEX idx_games_igdb_id ON games (igdb_id) WHERE igdb_id IS NOT NULL;
