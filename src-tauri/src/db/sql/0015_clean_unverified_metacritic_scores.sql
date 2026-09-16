-- Reset any fake Metacritic scores that were populated from IGDB aggregated ratings or unreleased games.
-- Real Metacritic scores must come only from verified sources (Steam Store API) for released titles.
UPDATE games SET metacritic_score = NULL WHERE steam_app_id IS NULL OR release_date > date('now') OR source = 'igdb_hub';
