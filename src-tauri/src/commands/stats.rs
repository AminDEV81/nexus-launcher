use crate::db::Database;
use crate::error::AppResult;
use rusqlite::OptionalExtension;
use serde::Serialize;
use std::collections::HashMap;
use tauri::State;

#[derive(Serialize)]
pub struct MostPlayedGame {
    pub id: String,
    pub name: String,
    pub cover_path: Option<String>,
    pub total_playtime_seconds: i64,
}

#[derive(Serialize)]
pub struct StatsSummary {
    pub total_games: i64,
    pub installed_games: i64,
    pub total_playtime_seconds: i64,
    pub most_played_game: Option<MostPlayedGame>,
}

fn get_active_profile_id(conn: &rusqlite::Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'active_profile_id'",
        [],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "default".to_string())
}

#[tauri::command]
pub fn get_stats_summary(
    db: State<'_, Database>,
    profile_id: Option<String>,
) -> AppResult<StatsSummary> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let total_games: i64 = conn.query_row("SELECT COUNT(*) FROM games", [], |row| row.get(0))?;
    let installed_games: i64 = conn.query_row(
        "SELECT COUNT(*) FROM games WHERE is_installed = 1",
        [],
        |row| row.get(0),
    )?;
    let total_playtime_seconds: i64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM playtime_sessions WHERE profile_id = ?1",
        [&target_profile],
        |row| row.get(0),
    )?;

    let most_played_game = conn
        .query_row(
            "SELECT g.id, g.name, g.cover_path, SUM(p.duration_seconds) as total
             FROM playtime_sessions p
             JOIN games g ON g.id = p.game_id
             WHERE p.profile_id = ?1
             GROUP BY p.game_id
             HAVING total > 0
             ORDER BY total DESC
             LIMIT 1",
            [&target_profile],
            |row| {
                Ok(MostPlayedGame {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    cover_path: row.get(2)?,
                    total_playtime_seconds: row.get(3)?,
                })
            },
        )
        .optional()?;

    Ok(StatsSummary {
        total_games,
        installed_games,
        total_playtime_seconds,
        most_played_game,
    })
}

#[derive(Serialize)]
pub struct GenrePlaytime {
    pub genre: String,
    pub total_playtime_seconds: i64,
}

/// Playtime summed per genre, genres with the most first, capped to the
/// top 10 so a library with a long tail of one-off genre tags doesn't
/// turn the bar chart into an unreadable strip. Only the target profile's
/// sessions contribute to the totals.
#[tauri::command]
pub fn get_playtime_by_genre(
    db: State<'_, Database>,
    profile_id: Option<String>,
) -> AppResult<Vec<GenrePlaytime>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let mut stmt = conn.prepare(
        "SELECT je.value AS genre, SUM(COALESCE(p.duration_seconds, 0)) AS total
         FROM playtime_sessions p
         JOIN games g ON g.id = p.game_id
         JOIN json_each(CASE WHEN json_valid(g.genres) THEN g.genres ELSE '[]' END) AS je
         WHERE p.profile_id = ?1
         GROUP BY je.value
         HAVING total > 0
         ORDER BY total DESC
         LIMIT 10",
    )?;
    let rows = stmt
        .query_map([&target_profile], |row| {
            Ok(GenrePlaytime {
                genre: row.get(0)?,
                total_playtime_seconds: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

#[derive(Serialize)]
pub struct WeeklyPlaytime {
    /// Local calendar date (YYYY-MM-DD) of the Monday starting the week.
    pub week_start: String,
    pub total_playtime_seconds: i64,
}

const TIMELINE_WEEKS: i64 = 12;

/// The last 12 weeks of playtime, one point per week, zero-filled —
/// filtered strictly by the target profile.
#[tauri::command]
pub fn get_playtime_timeline(
    db: State<'_, Database>,
    profile_id: Option<String>,
) -> AppResult<Vec<WeeklyPlaytime>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let mut stmt = conn.prepare(
        "SELECT date(started_at, 'localtime', 'weekday 0', '-6 days') AS week_start,
                SUM(COALESCE(duration_seconds, 0)) AS total
         FROM playtime_sessions
         WHERE profile_id = ?1
           AND date(started_at, 'localtime') >= date('now', 'localtime', ?2, 'weekday 0', '-6 days')
         GROUP BY week_start",
    )?;
    let offset = format!("-{} days", TIMELINE_WEEKS * 7);
    let mut by_week: HashMap<String, i64> = stmt
        .query_map(rusqlite::params![&target_profile, &offset], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<_, _>>()?;

    let mut result = Vec::with_capacity(TIMELINE_WEEKS as usize);
    for weeks_ago in (0..TIMELINE_WEEKS).rev() {
        let offset = format!("-{} days", weeks_ago * 7);
        let week_start: String = conn.query_row(
            "SELECT date('now', 'localtime', ?1, 'weekday 0', '-6 days')",
            [&offset],
            |row| row.get(0),
        )?;
        let total_playtime_seconds = by_week.remove(&week_start).unwrap_or(0);
        result.push(WeeklyPlaytime {
            week_start,
            total_playtime_seconds,
        });
    }

    Ok(result)
}

#[derive(Serialize)]
pub struct DailyActivity {
    /// Local calendar date (YYYY-MM-DD).
    pub date: String,
    pub total_playtime_seconds: i64,
}

const ACTIVITY_DAYS: i64 = 91;

/// Per-day playtime for the last 13 weeks (91 days), zero-filled —
/// filtered strictly by the target profile.
#[tauri::command]
pub fn get_daily_activity(
    db: State<'_, Database>,
    profile_id: Option<String>,
) -> AppResult<Vec<DailyActivity>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let mut stmt = conn.prepare(
        "WITH RECURSIVE days(day) AS (
             SELECT date('now', 'localtime', ?1)
             UNION ALL
             SELECT date(day, '+1 day') FROM days WHERE day < date('now', 'localtime')
         )
         SELECT days.day, COALESCE(SUM(COALESCE(p.duration_seconds, 0)), 0)
         FROM days
         LEFT JOIN playtime_sessions AS p
             ON date(p.started_at, 'localtime') = days.day
            AND p.profile_id = ?2
         GROUP BY days.day
         ORDER BY days.day ASC",
    )?;
    let start_offset = format!("-{} days", ACTIVITY_DAYS - 1);
    let rows = stmt
        .query_map(rusqlite::params![&start_offset, &target_profile], |row| {
            Ok(DailyActivity {
                date: row.get(0)?,
                total_playtime_seconds: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

#[derive(Serialize)]
pub struct RecentSession {
    pub id: String,
    pub game_id: String,
    pub game_name: String,
    pub cover_path: Option<String>,
    /// Raw stored UTC instant (RFC 3339); the frontend renders it in the
    /// user's local timezone via `parseStoredUtcDate`.
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<i64>,
}

/// The most recent play sessions for the target profile, newest first.
#[tauri::command]
pub fn get_recent_sessions(
    db: State<'_, Database>,
    profile_id: Option<String>,
) -> AppResult<Vec<RecentSession>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let mut stmt = conn.prepare(
        "SELECT p.id, p.game_id, g.name, g.cover_path, p.started_at, p.ended_at, p.duration_seconds
         FROM playtime_sessions AS p
         JOIN games AS g ON g.id = p.game_id
         WHERE p.profile_id = ?1
         ORDER BY p.started_at DESC
         LIMIT 12",
    )?;
    let rows = stmt
        .query_map([&target_profile], |row| {
            Ok(RecentSession {
                id: row.get(0)?,
                game_id: row.get(1)?,
                game_name: row.get(2)?,
                cover_path: row.get(3)?,
                started_at: row.get(4)?,
                ended_at: row.get(5)?,
                duration_seconds: row.get(6)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}
