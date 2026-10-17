-- Purge previously cached soundtrack albums/links/tracks so strict title-verified
-- soundtrack resolution can repopulate accurate soundtracks per game.
-- Preserves user favorites (soundtrack_favorites) and local files (soundtrack_local_files).
DELETE FROM soundtrack_game_links;
DELETE FROM soundtrack_tracks;
DELETE FROM soundtrack_albums;
DELETE FROM soundtrack_cache;
