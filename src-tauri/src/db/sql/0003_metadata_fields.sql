-- Epic 6 (Metadata Pipeline) needs two fields the original schema
-- didn't have: an ESRB/PEGI-style age rating, and the platform list
-- IGDB reports per game (distinct from `genres`, which already existed).
--
-- `age_rating` is intentionally left unpopulated by Epic 6's fetch logic
-- for now — IGDB's age rating data is a small enum keyed by rating
-- board (ESRB/PEGI/...) with board-specific numeric codes, and mapping
-- that correctly without being able to verify against live API
-- responses risks silently storing the wrong rating. The column exists
-- so a future pass can fill it in once verified.
ALTER TABLE games ADD COLUMN age_rating TEXT;
ALTER TABLE games ADD COLUMN platforms TEXT NOT NULL DEFAULT '[]';
