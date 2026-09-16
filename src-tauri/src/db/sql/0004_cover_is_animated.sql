-- Tracks whether the currently-set cover file is an animated asset
-- (animated WebP, per SteamGridDB's format for "Live Cover" artwork) so
-- the frontend knows to treat it as a Live Cover — pausing/playing it
-- per Epic 9's rules — versus a plain static image.
ALTER TABLE games ADD COLUMN cover_is_animated INTEGER NOT NULL DEFAULT 0;
