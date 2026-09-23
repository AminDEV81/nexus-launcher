use crate::db::models::Game;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use rusqlite::OptionalExtension;
use serde::Deserialize;
use tauri::{AppHandle, State};
use uuid::Uuid;

fn get_active_profile_id(conn: &rusqlite::Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'active_profile_id'",
        [],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "default".to_string())
}

#[tauri::command]
pub fn list_games(db: State<'_, Database>, profile_id: Option<String>) -> AppResult<Vec<Game>> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let sql = format!(
        "SELECT {} FROM games ORDER BY name COLLATE NOCASE ASC",
        Game::select_columns_with_profile()
    );
    let mut stmt = conn.prepare(&sql)?;
    let games = stmt
        .query_map([&target_profile], Game::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(games)
}

#[tauri::command]
pub fn get_game(db: State<'_, Database>, id: String, profile_id: Option<String>) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let sql = format!(
        "SELECT {} FROM games WHERE id = ?2",
        Game::select_columns_with_profile()
    );
    conn.query_row(&sql, rusqlite::params![&target_profile, &id], Game::from_row)
        .map_err(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => {
                AppError::NotFound(format!("no game with id {id}"))
            }
            other => AppError::Database(other),
        })
}

/// Minimal creation payload. This is the primitive Epic 4's "Add Game"
/// dialog calls once the user has picked an exe/shortcut/folder — the
/// dialog itself, and the richer metadata that Epic 6 fills in
/// afterwards, both build on top of this rather than this command
/// knowing anything about file pickers or IGDB.
#[derive(Debug, Deserialize)]
pub struct CreateGameInput {
    pub name: String,
    pub executable_path: Option<String>,
    pub install_path: Option<String>,
    pub install_size_bytes: Option<i64>,
    pub launch_arguments: Option<String>,
}

#[tauri::command]
pub fn create_game(
    app: AppHandle,
    db: State<'_, Database>,
    input: CreateGameInput,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    if input.name.trim().is_empty() {
        return Err(AppError::Invalid("game name cannot be empty".into()));
    }

    if let Some(exe_path) = &input.executable_path {
        let existing: Option<(String, String, bool)> = conn
            .query_row(
                "SELECT id, name, is_memory FROM games WHERE executable_path = ?1",
                [exe_path],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;

        if let Some((existing_id, existing_name, is_mem)) = existing {
            if is_mem {
                return Err(AppError::Invalid(format!(
                    "GAME_IN_MEMORY:{existing_id}:{existing_name}"
                )));
            } else {
                return Err(AppError::Invalid(
                    "this game is already in your library".into(),
                ));
            }
        }
    }

    // A library-only entry (for example, one added from an online catalog)
    // must not appear in Installed until the user provides a local path.
    // Older schema defaults predate that workflow, so always set the flag
    // explicitly instead of relying on the database default.
    let is_installed = input
        .executable_path
        .as_deref()
        .is_some_and(|path| !path.trim().is_empty())
        || input
            .install_path
            .as_deref()
            .is_some_and(|path| !path.trim().is_empty());

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO games (id, name, executable_path, install_path, install_size_bytes, launch_arguments, is_installed)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        rusqlite::params![
            &id,
            &input.name,
            &input.executable_path,
            &input.install_path,
            &input.install_size_bytes,
            &input.launch_arguments,
            is_installed,
        ],
    )?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;

    // Metadata (description, cover, banner, ...) is fetched in the
    // background — Epic 6's pipeline — so adding a game feels instant
    // rather than blocking on IGDB/SteamGridDB before this command
    // returns.
    crate::commands::metadata::spawn_auto_fetch_one(app, game.id.clone(), game.name.clone());
    let _ = crate::commands::save_manager::auto_configure_game_save(&conn, &game.id);

    Ok(game)
}

/// Local-install fields are intentionally edited together: a saved local
/// path is the source of truth for `is_installed`. This prevents a game from
/// being listed as installed merely because it was imported from a catalog,
/// and moves it into the Installed view the moment a real path is supplied.
#[derive(Debug, Deserialize)]
pub struct UpdateGameInstallationInput {
    pub executable_path: Option<String>,
    pub install_path: Option<String>,
    pub install_size_bytes: Option<i64>,
}

fn normalize_path(path: Option<String>) -> Option<String> {
    path.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    })
}

#[tauri::command]
pub fn update_game_installation(
    db: State<'_, Database>,
    id: String,
    input: UpdateGameInstallationInput,
) -> AppResult<Game> {
    let executable_path = normalize_path(input.executable_path);
    let install_path = normalize_path(input.install_path);

    if input.install_size_bytes.is_some_and(|size| size < 0) {
        return Err(AppError::Invalid(
            "installation size cannot be negative".into(),
        ));
    }

    if let Some(path) = &executable_path {
        if !std::path::Path::new(path).is_file() {
            return Err(AppError::Invalid(format!(
                "executable path does not exist: {path}"
            )));
        }
    }
    if let Some(path) = &install_path {
        if !std::path::Path::new(path).is_dir() {
            return Err(AppError::Invalid(format!(
                "installation folder does not exist: {path}"
            )));
        }
    }

    let is_installed = executable_path.is_some() || install_path.is_some();
    let conn = db.connection.lock().expect("db mutex poisoned");

    if let Some(path) = &executable_path {
        let already_used: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM games WHERE executable_path = ?1 AND id != ?2)",
            rusqlite::params![path, id],
            |row| row.get(0),
        )?;
        if already_used {
            return Err(AppError::Invalid(
                "another game in your library already uses this executable".into(),
            ));
        }
    }

    let changed = conn.execute(
        "UPDATE games
         SET executable_path = ?1,
             install_path = ?2,
             install_size_bytes = ?3,
             is_installed = ?4,
             -- A game with a real local install has left wishlist territory.
             is_wishlist = CASE WHEN ?4 = 1 THEN 0 ELSE is_wishlist END
         WHERE id = ?5",
        rusqlite::params![
            executable_path,
            install_path,
            input.install_size_bytes,
            is_installed,
            id,
        ],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let _ = crate::commands::save_manager::auto_configure_game_save(&conn, &id);

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    Ok(conn.query_row(&sql, [&id], Game::from_row)?)
}

#[derive(Debug, Deserialize)]
pub struct UpdateGameFlagsInput {
    pub is_favorite: Option<bool>,
    pub is_hidden: Option<bool>,
    /// Per-game Live Cover kill switch (Epic 9) — `false` forces the
    /// cover to always render its static first frame, even on hover.
    pub animated_cover_enabled: Option<bool>,
}

#[tauri::command]
pub fn update_game_flags(
    db: State<'_, Database>,
    id: String,
    input: UpdateGameFlagsInput,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let changed = conn.execute(
        "UPDATE games
         SET is_favorite = COALESCE(?1, is_favorite),
             is_hidden   = COALESCE(?2, is_hidden),
             animated_cover_enabled = COALESCE(?3, animated_cover_enabled)
         WHERE id = ?4",
        rusqlite::params![
            &input.is_favorite,
            &input.is_hidden,
            &input.animated_cover_enabled,
            &id,
        ],
    )?;

    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

#[tauri::command]
pub fn update_game_name(
    db: State<'_, Database>,
    id: String,
    name: String,
) -> AppResult<Game> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Invalid("game name cannot be empty".into()));
    }

    let conn = db.connection.lock().expect("db mutex poisoned");
    let changed = conn.execute(
        "UPDATE games SET name = ?1 WHERE id = ?2",
        rusqlite::params![trimmed, &id],
    )?;

    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Removes the game from the active library by archiving it to Memory.
/// Per product requirements, removing a game moves it to Memory to preserve
/// all playtime history, achievements, and stats permanently.
#[tauri::command]
pub fn delete_game(db: State<'_, Database>, id: String) -> AppResult<()> {
    let mut conn = db.connection.lock().expect("db mutex poisoned");
    let tx = conn.transaction()?;

    // 1. Remove from active downloads
    tx.execute("DELETE FROM downloads WHERE game_id = ?1", [&id])?;

    // 2. Remove from collections
    tx.execute("DELETE FROM collection_games WHERE game_id = ?1", [&id])?;

    // 3. Mark as memory and uninstalled
    let changed = tx.execute(
        "UPDATE games SET is_memory = 1, is_installed = 0 WHERE id = ?1",
        [&id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    tx.commit()?;
    Ok(())
}

/// Restores an archived game from Memory back to the active library.
#[tauri::command]
pub fn restore_game_from_memory(
    db: State<'_, Database>,
    id: String,
    profile_id: Option<String>,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));

    let changed = conn.execute(
        "UPDATE games SET is_memory = 0 WHERE id = ?1 AND is_memory = 1",
        [&id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no memory entry with id {id}")));
    }

    let sql = format!(
        "SELECT {} FROM games WHERE id = ?2",
        Game::select_columns_with_profile()
    );
    let game = conn.query_row(&sql, rusqlite::params![&target_profile, &id], Game::from_row)?;
    Ok(game)
}

/// Permanently purges a game, all its saves, sessions, artwork, and database records.
#[tauri::command]
pub fn permanently_delete_game(
    app: AppHandle,
    db: State<'_, Database>,
    id: String,
) -> AppResult<()> {
    let mut conn = db.connection.lock().expect("db mutex poisoned");
    let tx = conn.transaction()?;

    // 1. Clean up save operation locations referencing locations or operations of this game
    tx.execute(
        "DELETE FROM save_operation_locations WHERE location_id IN (
            SELECT id FROM game_save_locations WHERE game_id = ?1
        ) OR operation_id IN (
            SELECT id FROM save_operations WHERE game_id = ?1
        )",
        [&id],
    )?;

    // 2. Clean up save operations
    tx.execute("DELETE FROM save_operations WHERE game_id = ?1", [&id])?;

    // 3. Clean up profile game saves
    tx.execute("DELETE FROM profile_game_saves WHERE game_id = ?1", [&id])?;

    // 4. Clean up game save locations
    tx.execute("DELETE FROM game_save_locations WHERE game_id = ?1", [&id])?;

    // 5. Clean up downloads
    tx.execute("DELETE FROM downloads WHERE game_id = ?1", [&id])?;

    // 6. Clean up collection links, tags, cached artwork rows, playtime sessions
    tx.execute("DELETE FROM collection_games WHERE game_id = ?1", [&id])?;
    tx.execute("DELETE FROM game_tags WHERE game_id = ?1", [&id])?;
    tx.execute("DELETE FROM artwork_cache WHERE game_id = ?1", [&id])?;
    tx.execute("DELETE FROM playtime_sessions WHERE game_id = ?1", [&id])?;

    // 7. Delete the game record
    let changed = tx.execute("DELETE FROM games WHERE id = ?1", [&id])?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    tx.commit()?;

    // Clean up cached artwork folder
    if let Ok(data_dir) = crate::paths::app_data_dir(&app) {
        let artwork_dir = data_dir.join("artwork").join(&id);
        if artwork_dir.exists() {
            let _ = std::fs::remove_dir_all(artwork_dir);
        }
    }

    Ok(())
}

fn generate_fluctuating_sessions(
    diff_seconds: i64,
    days_span: i64,
    now_utc: chrono::DateTime<chrono::Utc>,
) -> Vec<(String, String, i64)> {
    let max_day_secs: i64 = 12 * 3600; // 12 hours max per day
    let min_days = (diff_seconds as f64 / max_day_secs as f64).ceil() as i64;
    let effective_days = days_span.max(min_days).max(1);

    let avg_hours = (diff_seconds as f64 / 3600.0) / (effective_days as f64);
    let mut daily_allocations: Vec<(i64, i64)> = Vec::new();

    if avg_hours < 2.0 && effective_days > 5 {
        // Sparse distribution across the timeframe (e.g. 20h over 100 days)
        // Average session ~2.5h (9000s)
        let target_sessions = ((diff_seconds as f64 / 9000.0).round() as i64)
            .clamp(min_days, effective_days)
            .max(1);

        let step = effective_days as f64 / target_sessions as f64;
        let mut active_days: Vec<i64> = (0..target_sessions)
            .map(|i| ((i as f64 * step).round() as i64).min(effective_days - 1))
            .collect();
        active_days.sort_unstable();
        active_days.dedup();

        let num_active = active_days.len();
        let mut weights: Vec<f64> = Vec::with_capacity(num_active);
        for i in 0..num_active {
            // Alternating wave: 1.25 and 0.75 (at least 20% diff)
            if i % 2 == 0 {
                weights.push(1.22);
            } else {
                weights.push(0.78);
            }
        }
        let sum_weights: f64 = weights.iter().sum();
        let mut allocated_sum = 0i64;
        let mut day_map: std::collections::BTreeMap<i64, i64> = std::collections::BTreeMap::new();

        for (idx, &d) in active_days.iter().enumerate() {
            let dur = ((diff_seconds as f64 * (weights[idx] / sum_weights)).round() as i64)
                .min(max_day_secs);
            day_map.insert(d, dur);
            allocated_sum += dur;
        }

        // Fix remainder
        let mut rem = diff_seconds - allocated_sum;
        for &d in &active_days {
            if rem == 0 {
                break;
            }
            let current = day_map.get_mut(&d).unwrap();
            if rem > 0 && *current < max_day_secs {
                let add = rem.min(max_day_secs - *current);
                *current += add;
                rem -= add;
            } else if rem < 0 && *current > 1800 {
                let sub = (-rem).min(*current - 1800);
                *current -= sub;
                rem += sub;
            }
        }

        for (d, dur) in day_map {
            if dur > 0 {
                daily_allocations.push((d, dur));
            }
        }
    } else if diff_seconds >= effective_days * max_day_secs {
        // Exact capacity: all days 12h
        for d in 0..effective_days {
            daily_allocations.push((d, max_day_secs));
        }
    } else {
        // Dense distribution: fluctuating weights differing by >= 20%
        // Pattern: alternating between ~1.22 and ~0.78
        let mut weights: Vec<f64> = Vec::with_capacity(effective_days as usize);
        for i in 0..effective_days {
            if i % 2 == 0 {
                weights.push(1.22);
            } else {
                weights.push(0.78);
            }
        }
        let sum_weights: f64 = weights.iter().sum();
        let mut allocated = vec![0i64; effective_days as usize];
        let mut current_sum = 0i64;

        for i in 0..effective_days as usize {
            let dur = ((diff_seconds as f64 * (weights[i] / sum_weights)).round() as i64)
                .min(max_day_secs);
            allocated[i] = dur;
            current_sum += dur;
        }

        // Distribute remainder safely without exceeding max_day_secs
        let mut rem = diff_seconds - current_sum;
        for item in allocated.iter_mut().take(effective_days as usize) {
            if rem == 0 {
                break;
            }
            if rem > 0 && *item < max_day_secs {
                let add = rem.min(max_day_secs - *item);
                *item += add;
                rem -= add;
            } else if rem < 0 && *item > 1800 {
                let sub = (-rem).min(*item - 1800);
                *item -= sub;
                rem += sub;
            }
        }

        for (d, dur) in allocated.into_iter().enumerate() {
            if dur > 0 {
                daily_allocations.push((d as i64, dur));
            }
        }
    }

    let mut sessions = Vec::new();
    for (day_offset, dur) in daily_allocations {
        let day_date = now_utc.date_naive() - chrono::Duration::days(day_offset);
        let start_naive = day_date
            .and_hms_opt(15, 0, 0)
            .unwrap_or_else(|| now_utc.naive_utc());
        let start_utc =
            chrono::DateTime::<chrono::Utc>::from_naive_utc_and_offset(start_naive, chrono::Utc);
        let end_utc = start_utc + chrono::Duration::seconds(dur);

        sessions.push((start_utc.to_rfc3339(), end_utc.to_rfc3339(), dur));
    }

    sessions
}

/// Manually sets a game's total playtime for the active profile by adjusting sessions.
/// If playtime is increased, it distributes the new playtime across `days_span` past days,
/// strictly enforcing that no day receives more than 12 hours (43,200 seconds), and
/// varying each day by at least 20% to avoid an artificial flat-line curve.
#[tauri::command]
pub fn set_game_playtime(
    db: State<'_, Database>,
    id: String,
    profile_id: Option<String>,
    total_seconds: i64,
    days_span: Option<i64>,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    let target_profile = profile_id.unwrap_or_else(|| get_active_profile_id(&conn));
    let target_seconds = total_seconds.max(0);

    let current_total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(duration_seconds), 0) FROM playtime_sessions WHERE game_id = ?1 AND profile_id = ?2",
        [&id, &target_profile],
        |row| row.get(0),
    )?;

    let diff = target_seconds - current_total;
    if diff > 0 {
        let sessions =
            generate_fluctuating_sessions(diff, days_span.unwrap_or(1), chrono::Utc::now());
        let mut latest_started_at: Option<String> = None;

        for (start_str, end_str, day_dur) in sessions {
            let session_id = Uuid::new_v4().to_string();
            if latest_started_at.is_none() {
                latest_started_at = Some(start_str.clone());
            }

            conn.execute(
                "INSERT INTO playtime_sessions (id, game_id, profile_id, started_at, ended_at, duration_seconds)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                rusqlite::params![session_id, id, target_profile, start_str, end_str, day_dur],
            )?;
        }

        if let Some(latest) = latest_started_at {
            let _ = conn.execute(
                "UPDATE games SET last_played_at = ?1, total_playtime_seconds = ?2 WHERE id = ?3",
                rusqlite::params![latest, target_seconds, id],
            );
        }
    } else if diff < 0 {
        let mut to_remove = -diff;
        let mut stmt = conn.prepare(
            "SELECT id, duration_seconds FROM playtime_sessions
             WHERE game_id = ?1 AND profile_id = ?2
             ORDER BY started_at DESC",
        )?;
        let sessions: Vec<(String, i64)> = stmt
            .query_map([&id, &target_profile], |row| {
                Ok((row.get(0)?, row.get::<_, Option<i64>>(1)?.unwrap_or(0)))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);

        for (sid, dur) in sessions {
            if to_remove <= 0 {
                break;
            }
            if dur <= to_remove {
                conn.execute("DELETE FROM playtime_sessions WHERE id = ?1", [&sid])?;
                to_remove -= dur;
            } else {
                conn.execute(
                    "UPDATE playtime_sessions SET duration_seconds = duration_seconds - ?1 WHERE id = ?2",
                    rusqlite::params![to_remove, sid],
                )?;
                to_remove = 0;
            }
        }

        let latest_played: Option<String> = conn
            .query_row(
                "SELECT started_at FROM playtime_sessions WHERE game_id = ?1 AND profile_id = ?2 ORDER BY started_at DESC LIMIT 1",
                [&id, &target_profile],
                |row| row.get(0),
            )
            .optional()?;

        let _ = conn.execute(
            "UPDATE games SET last_played_at = ?1, total_playtime_seconds = ?2 WHERE id = ?3",
            rusqlite::params![latest_played, target_seconds, id],
        );
    }

    let sql = format!(
        "SELECT {} FROM games WHERE id = ?2",
        Game::select_columns_with_profile()
    );
    let game = conn.query_row(&sql, rusqlite::params![&target_profile, &id], Game::from_row)?;
    Ok(game)
}

/// Moves a wishlist entry into the library proper (the context menu's
/// "Move to Library"): keeps every bit of metadata and artwork, just
/// clears the wishlist flag so the game shows up in the main grid.
#[tauri::command]
pub fn promote_wishlist_game(db: State<'_, Database>, id: String) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let changed = conn.execute(
        "UPDATE games SET is_wishlist = 0 WHERE id = ?1 AND is_wishlist = 1",
        [&id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!(
            "no wishlist entry with id {id}"
        )));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Local paths of every cached screenshot for a game (Epic 6 downloads
/// these into `artwork_cache`, kind='screenshot'), ordered for the
/// details panel's gallery.
#[tauri::command]
pub fn get_game_screenshots(db: State<'_, Database>, id: String) -> AppResult<Vec<String>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let mut stmt = conn.prepare(
        "SELECT local_path FROM artwork_cache
         WHERE game_id = ?1 AND kind = 'screenshot'
         ORDER BY ordinal ASC",
    )?;
    let paths = stmt
        .query_map([&id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(paths)
}

/// Stores the IGDB match on a game row. Manual entries are created
/// without one; "View in Game Hub" resolves it by name on first use and
/// persists it here, so later visits (and the hub's in-library
/// matching, which keys on `igdb_id`) work directly.
#[tauri::command]
pub fn set_game_igdb_id(db: State<'_, Database>, id: String, igdb_id: i64) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let changed = conn.execute(
        "UPDATE games SET igdb_id = ?1 WHERE id = ?2",
        rusqlite::params![igdb_id, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    Ok(())
}

/// Updates the custom command-line arguments a game launches with
/// (Epic 8's "Launch Options" field; Epic 11 reads this back when
/// actually starting the game). `None`/empty clears it back to "no
/// extra arguments".
#[tauri::command]
pub fn update_launch_arguments(
    db: State<'_, Database>,
    id: String,
    launch_arguments: Option<String>,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let normalized = launch_arguments.filter(|value| !value.trim().is_empty());
    let changed = conn.execute(
        "UPDATE games SET launch_arguments = ?1 WHERE id = ?2",
        rusqlite::params![normalized, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Sets or clears the shell command Epic 11's launch tracker runs right
/// before starting the game (e.g. toggling a Discord status script).
#[tauri::command]
pub fn update_pre_launch_command(
    db: State<'_, Database>,
    id: String,
    pre_launch_command: Option<String>,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let normalized = pre_launch_command.filter(|value| !value.trim().is_empty());
    let changed = conn.execute(
        "UPDATE games SET pre_launch_command = ?1 WHERE id = ?2",
        rusqlite::params![normalized, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Sets or clears the shell command run right after the game's process
/// exits, once its playtime session has been recorded.
#[tauri::command]
pub fn update_post_launch_command(
    db: State<'_, Database>,
    id: String,
    post_launch_command: Option<String>,
) -> AppResult<Game> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let normalized = post_launch_command.filter(|value| !value.trim().is_empty());
    let changed = conn.execute(
        "UPDATE games SET post_launch_command = ?1 WHERE id = ?2",
        rusqlite::params![normalized, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Sets or clears the user's personal rating (1-10 scale) on a game.
#[tauri::command]
pub fn set_game_user_rating(
    db: State<'_, Database>,
    id: String,
    rating: Option<i64>,
) -> AppResult<Game> {
    if let Some(r) = rating {
        if !(1..=10).contains(&r) {
            return Err(AppError::Invalid(
                "Rating must be between 1 and 10".into(),
            ));
        }
    }

    let conn = db.connection.lock().expect("db mutex poisoned");
    let changed = conn.execute(
        "UPDATE games SET user_rating = ?1 WHERE id = ?2",
        rusqlite::params![rating, id],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no game with id {id}")));
    }

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

