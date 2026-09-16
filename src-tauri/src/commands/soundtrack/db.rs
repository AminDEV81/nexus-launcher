use super::models::{
    SoundtrackAlbum, SoundtrackAlbumWithTracks, SoundtrackDownload, SoundtrackFavorite,
    SoundtrackLocalFile, SoundtrackPlayHistory, SoundtrackTrack,
};
use crate::error::AppResult;
use rusqlite::{params, Connection};
use uuid::Uuid;

pub fn save_album(
    conn: &Connection,
    album: &SoundtrackAlbum,
    tracks: &[SoundtrackTrack],
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO soundtrack_albums (
            id, game_id, title, type, artist, release_date, cover_url,
            track_count, total_duration_ms, provider_id, external_id,
            created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now'), datetime('now'))
        ON CONFLICT(id) DO UPDATE SET
            game_id = excluded.game_id,
            title = excluded.title,
            type = excluded.type,
            artist = excluded.artist,
            release_date = excluded.release_date,
            cover_url = COALESCE(excluded.cover_url, soundtrack_albums.cover_url),
            track_count = excluded.track_count,
            total_duration_ms = excluded.total_duration_ms,
            updated_at = datetime('now')",
        params![
            album.id,
            album.game_id,
            album.title,
            album.album_type,
            album.artist,
            album.release_date,
            album.cover_url,
            album.track_count,
            album.total_duration_ms,
            album.provider_id,
            album.external_id,
        ],
    )?;

    if let Some(ref g_id) = album.game_id {
        conn.execute(
            "INSERT INTO soundtrack_game_links (id, game_id, album_id, confidence, is_manual)
             VALUES (?1, ?2, ?3, 1.0, 0)
             ON CONFLICT(game_id, album_id) DO NOTHING",
            params![Uuid::new_v4().to_string(), g_id, album.id],
        )?;
    }

    // Delete existing tracks and rewrite to avoid stale tracks
    conn.execute(
        "DELETE FROM soundtrack_tracks WHERE album_id = ?1",
        params![album.id],
    )?;

    for t in tracks {
        conn.execute(
            "INSERT INTO soundtrack_tracks (
                id, album_id, disc_number, track_number, title, artist,
                duration_ms, preview_url, stream_url, download_url, local_path,
                provider_id, external_id, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, datetime('now'))",
            params![
                t.id,
                album.id,
                t.disc_number,
                t.track_number,
                t.title,
                t.artist,
                t.duration_ms,
                t.preview_url,
                t.stream_url,
                t.download_url,
                t.local_path,
                t.provider_id,
                t.external_id,
            ],
        )?;
    }

    Ok(())
}

pub fn get_album(conn: &Connection, album_id: &str) -> AppResult<Option<SoundtrackAlbumWithTracks>> {
    let mut stmt = conn.prepare(
        "SELECT id, game_id, title, type, artist, release_date, cover_url,
                track_count, total_duration_ms, provider_id, external_id,
                created_at, updated_at
         FROM soundtrack_albums WHERE id = ?1",
    )?;

    let mut rows = stmt.query(params![album_id])?;
    let album = match rows.next()? {
        Some(row) => SoundtrackAlbum {
            id: row.get(0)?,
            game_id: row.get(1)?,
            title: row.get(2)?,
            album_type: row.get(3)?,
            artist: row.get(4)?,
            release_date: row.get(5)?,
            cover_url: row.get(6)?,
            track_count: row.get(7)?,
            total_duration_ms: row.get(8)?,
            provider_id: row.get(9)?,
            external_id: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        },
        None => return Ok(None),
    };

    let mut track_stmt = conn.prepare(
        "SELECT id, album_id, disc_number, track_number, title, artist,
                duration_ms, preview_url, stream_url, download_url, local_path,
                provider_id, external_id, created_at
         FROM soundtrack_tracks
         WHERE album_id = ?1
         ORDER BY disc_number ASC, track_number ASC",
    )?;

    let track_rows = track_stmt.query_map(params![album_id], |row| {
        Ok(SoundtrackTrack {
            id: row.get(0)?,
            album_id: row.get(1)?,
            disc_number: row.get(2)?,
            track_number: row.get(3)?,
            title: row.get(4)?,
            artist: row.get(5)?,
            duration_ms: row.get(6)?,
            preview_url: row.get(7)?,
            stream_url: row.get(8)?,
            download_url: row.get(9)?,
            local_path: row.get(10)?,
            provider_id: row.get(11)?,
            external_id: row.get(12)?,
            created_at: row.get(13)?,
        })
    })?;

    let mut tracks = Vec::new();
    for t in track_rows {
        tracks.push(t?);
    }

    Ok(Some(SoundtrackAlbumWithTracks { album, tracks }))
}

pub fn get_albums_for_game(
    conn: &Connection,
    game_id: &str,
) -> AppResult<Vec<SoundtrackAlbumWithTracks>> {
    let mut stmt = conn.prepare(
        "SELECT a.id, a.game_id, a.title, a.type, a.artist, a.release_date, a.cover_url,
                a.track_count, a.total_duration_ms, a.provider_id, a.external_id,
                a.created_at, a.updated_at
         FROM soundtrack_albums a
         LEFT JOIN soundtrack_game_links l ON l.album_id = a.id
         WHERE a.game_id = ?1 OR l.game_id = ?1
         ORDER BY a.release_date DESC, a.track_count DESC",
    )?;

    let album_rows = stmt.query_map(params![game_id], |row| {
        Ok(SoundtrackAlbum {
            id: row.get(0)?,
            game_id: row.get(1)?,
            title: row.get(2)?,
            album_type: row.get(3)?,
            artist: row.get(4)?,
            release_date: row.get(5)?,
            cover_url: row.get(6)?,
            track_count: row.get(7)?,
            total_duration_ms: row.get(8)?,
            provider_id: row.get(9)?,
            external_id: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;

    let mut results = Vec::new();
    for a_res in album_rows {
        let album = a_res?;
        if let Ok(Some(full)) = get_album(conn, &album.id) {
            results.push(full);
        }
    }

    Ok(results)
}

pub fn get_all_albums(conn: &Connection) -> AppResult<Vec<SoundtrackAlbum>> {
    let mut stmt = conn.prepare(
        "SELECT id, game_id, title, type, artist, release_date, cover_url,
                track_count, total_duration_ms, provider_id, external_id,
                created_at, updated_at
         FROM soundtrack_albums
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SoundtrackAlbum {
            id: row.get(0)?,
            game_id: row.get(1)?,
            title: row.get(2)?,
            album_type: row.get(3)?,
            artist: row.get(4)?,
            release_date: row.get(5)?,
            cover_url: row.get(6)?,
            track_count: row.get(7)?,
            total_duration_ms: row.get(8)?,
            provider_id: row.get(9)?,
            external_id: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

pub fn toggle_favorite(conn: &Connection, target_type: &str, target_id: &str) -> AppResult<bool> {
    let exists: bool = conn.query_row(
        "SELECT 1 FROM soundtrack_favorites WHERE target_type = ?1 AND target_id = ?2",
        params![target_type, target_id],
        |_| Ok(true),
    ).unwrap_or(false);

    if exists {
        conn.execute(
            "DELETE FROM soundtrack_favorites WHERE target_type = ?1 AND target_id = ?2",
            params![target_type, target_id],
        )?;
        Ok(false)
    } else {
        conn.execute(
            "INSERT INTO soundtrack_favorites (id, target_type, target_id, created_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
            params![Uuid::new_v4().to_string(), target_type, target_id],
        )?;
        Ok(true)
    }
}

pub fn get_favorites(conn: &Connection) -> AppResult<Vec<SoundtrackFavorite>> {
    let mut stmt = conn.prepare(
        "SELECT id, target_type, target_id, created_at FROM soundtrack_favorites ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(SoundtrackFavorite {
            id: row.get(0)?,
            target_type: row.get(1)?,
            target_id: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

pub fn record_play(
    conn: &Connection,
    track_id: &str,
    album_id: Option<&str>,
    game_id: Option<&str>,
    duration_played_ms: i64,
    completed: bool,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO soundtrack_play_history (
            id, track_id, album_id, game_id, played_at, duration_played_ms, completed
        ) VALUES (?1, ?2, ?3, ?4, datetime('now'), ?5, ?6)",
        params![
            Uuid::new_v4().to_string(),
            track_id,
            album_id,
            game_id,
            duration_played_ms,
            if completed { 1 } else { 0 }
        ],
    )?;
    Ok(())
}

pub fn get_play_history(conn: &Connection, limit: u32) -> AppResult<Vec<SoundtrackPlayHistory>> {
    let mut stmt = conn.prepare(
        "SELECT id, track_id, album_id, game_id, played_at, duration_played_ms, completed
         FROM soundtrack_play_history
         ORDER BY played_at DESC
         LIMIT ?1",
    )?;

    let rows = stmt.query_map(params![limit], |row| {
        let comp: i64 = row.get(6)?;
        Ok(SoundtrackPlayHistory {
            id: row.get(0)?,
            track_id: row.get(1)?,
            album_id: row.get(2)?,
            game_id: row.get(3)?,
            played_at: row.get(4)?,
            duration_played_ms: row.get(5)?,
            completed: comp != 0,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

pub fn get_cache(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT data_json FROM soundtrack_cache
         WHERE cache_key = ?1 AND expires_at > datetime('now')",
    )?;
    let mut rows = stmt.query(params![key])?;
    if let Some(row) = rows.next()? {
        let json: String = row.get(0)?;
        Ok(Some(json))
    } else {
        Ok(None)
    }
}

pub fn set_cache(conn: &Connection, key: &str, data_json: &str, ttl_secs: u64) -> AppResult<()> {
    let expires_modifier = format!("+{} seconds", ttl_secs);
    conn.execute(
        "INSERT INTO soundtrack_cache (cache_key, data_json, expires_at)
         VALUES (?1, ?2, datetime('now', ?3))
         ON CONFLICT(cache_key) DO UPDATE SET
            data_json = excluded.data_json,
            expires_at = excluded.expires_at",
        params![key, data_json, expires_modifier],
    )?;
    Ok(())
}

pub fn get_downloads(conn: &Connection) -> AppResult<Vec<SoundtrackDownload>> {
    let mut stmt = conn.prepare(
        "SELECT id, track_id, album_id, game_id, url, save_path,
                total_bytes, downloaded_bytes, status, error_message, speed_bps,
                created_at, updated_at
         FROM soundtrack_downloads
         ORDER BY updated_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SoundtrackDownload {
            id: row.get(0)?,
            track_id: row.get(1)?,
            album_id: row.get(2)?,
            game_id: row.get(3)?,
            url: row.get(4)?,
            save_path: row.get(5)?,
            total_bytes: row.get(6)?,
            downloaded_bytes: row.get(7)?,
            status: row.get(8)?,
            error_message: row.get(9)?,
            speed_bps: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}

pub fn get_local_files(conn: &Connection) -> AppResult<Vec<SoundtrackLocalFile>> {
    let mut stmt = conn.prepare(
        "SELECT id, file_path, file_size, game_id, album_id, track_id,
                title, artist, album, duration_ms, format, scanned_at
         FROM soundtrack_local_files
         ORDER BY scanned_at DESC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(SoundtrackLocalFile {
            id: row.get(0)?,
            file_path: row.get(1)?,
            file_size: row.get(2)?,
            game_id: row.get(3)?,
            album_id: row.get(4)?,
            track_id: row.get(5)?,
            title: row.get(6)?,
            artist: row.get(7)?,
            album: row.get(8)?,
            duration_ms: row.get(9)?,
            format: row.get(10)?,
            scanned_at: row.get(11)?,
        })
    })?;

    let mut list = Vec::new();
    for r in rows {
        list.push(r?);
    }
    Ok(list)
}
