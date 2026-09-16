use crate::error::AppResult;
use chrono::Utc;
use rusqlite::{params, Connection};

/// Local SQLite Metadata Cache (Layer 1 Cache)
/// Supports Stale-While-Revalidate: returns cached content even if expired,
/// flagging `is_stale = true` so the UI renders instantly while background refresh runs.
pub struct MetadataCache;

impl MetadataCache {
    /// Retrieves payload and staleness status.
    /// Returns `Some((payload, is_stale))` if found.
    pub fn get(conn: &Connection, cache_key: &str) -> Option<(String, bool)> {
        let now = Utc::now().timestamp();
        let query = "SELECT payload, expires_at FROM metadata_cache WHERE cache_key = ?1";

        conn.query_row(query, params![cache_key], |row| {
            let payload: String = row.get(0)?;
            let expires_at: i64 = row.get(1)?;
            let is_stale = now > expires_at;
            Ok((payload, is_stale))
        })
        .ok()
    }

    /// Stores a JSON payload with a specified TTL in seconds.
    pub fn set(
        conn: &Connection,
        cache_key: &str,
        category: &str,
        payload: &str,
        ttl_secs: i64,
    ) -> AppResult<()> {
        let now = Utc::now().timestamp();
        let expires_at = now + ttl_secs;

        conn.execute(
            "INSERT INTO metadata_cache (cache_key, category, payload, created_at, expires_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(cache_key) DO UPDATE SET
                payload = excluded.payload,
                expires_at = excluded.expires_at,
                created_at = excluded.created_at",
            params![cache_key, category, payload, now, expires_at],
        )?;

        Ok(())
    }

    /// Purges entries older than 30 days.
    pub fn purge_stale(conn: &Connection) -> AppResult<usize> {
        let cutoff = Utc::now().timestamp() - 30 * 86_400;
        let deleted = conn.execute(
            "DELETE FROM metadata_cache WHERE expires_at < ?1",
            params![cutoff],
        )?;
        Ok(deleted)
    }
}
