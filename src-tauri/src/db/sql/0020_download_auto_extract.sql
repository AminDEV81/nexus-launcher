-- 0020_download_auto_extract.sql
-- Allow users to toggle automatic extraction of downloaded archives (.zip, .rar, .7z)
-- Defaults to 1 (true) to preserve automatic extraction behavior.
ALTER TABLE downloads ADD COLUMN auto_extract INTEGER NOT NULL DEFAULT 1;
