-- Parallel chunked downloads need per-chunk progress to resume from.
-- `chunk_state` holds a JSON array of {start, end, done} ranges so a
-- paused/failed multi-connection download can pick each connection back
-- up at its own offset instead of restarting the whole file.
ALTER TABLE downloads ADD COLUMN chunk_state TEXT;
