-- 0013_user_rating.sql
-- Adds personal user rating (1-10 scale) column to games table.

ALTER TABLE games ADD COLUMN user_rating INTEGER CHECK (user_rating IS NULL OR (user_rating >= 1 AND user_rating <= 10));
