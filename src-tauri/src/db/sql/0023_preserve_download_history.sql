-- 0023_preserve_download_history.sql
ALTER TABLE downloads ADD COLUMN game_name TEXT;
ALTER TABLE downloads ADD COLUMN cover_url TEXT;

UPDATE downloads
SET game_name = (SELECT name FROM games WHERE games.id = downloads.game_id),
    cover_url = (SELECT cover_path FROM games WHERE games.id = downloads.game_id)
WHERE game_id != '' AND game_name IS NULL;
