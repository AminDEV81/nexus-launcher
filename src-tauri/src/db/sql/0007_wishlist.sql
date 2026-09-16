-- Wishlist: hub games the user wants to keep an eye on but doesn't
-- own yet. Same row shape as any library game (so all metadata,
-- artwork, and details-panel machinery works unchanged), flagged apart
-- so the Wishlist view can filter for it and the main library can
-- filter it out. The flag clears automatically once a game gains a
-- local install (see `update_game_installation`) or is promoted via
-- "Add to Library".
ALTER TABLE games ADD COLUMN is_wishlist INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_games_is_wishlist ON games (is_wishlist);
