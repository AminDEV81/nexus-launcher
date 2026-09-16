-- Reset fake Metacritic scores that were mistakenly populated from IGDB aggregated ratings.
-- Real Metacritic scores must come only from verified sources (Steam Store API).
UPDATE games SET metacritic_score = NULL WHERE steam_app_id IS NULL OR source = 'igdb_hub';

