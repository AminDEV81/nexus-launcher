use base64::Engine;
use crate::commands::save_manager::error::SaveManagerError;
use crate::commands::save_manager::fs_ops::{get_nexus_profiles_root, remove_path_all_with_retry};
use crate::commands::save_manager::locks::SaveManagerLocks;
use crate::commands::save_manager::session::SessionManager;
use crate::commands::save_manager::transaction::TransactionCoordinator;
use crate::db::Database;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use tauri::{AppHandle, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub avatar: String,
    pub color: String,
    pub created_at: String,
    pub updated_at: String,
    pub is_active: bool,
    #[serde(default)]
    pub games_count: Option<i64>,
    #[serde(default)]
    pub total_save_bytes: Option<i64>,
    #[serde(default)]
    pub recent_games: Vec<String>,
}

fn get_active_id(conn: &Connection) -> String {
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'active_profile_id'",
        [],
        |row| row.get(0),
    )
    .unwrap_or_else(|_| "default".to_string())
}

fn get_profile_recent_games(conn: &Connection, profile_id: &str) -> Vec<String> {
    let mut stmt = match conn.prepare(
        "SELECT g.name
         FROM (
             SELECT pgs.game_id, MAX(COALESCE(pgs.last_synced_at, pgs.last_snapshot_at, '')) AS last_active
             FROM profile_game_saves pgs
             WHERE pgs.profile_id = ?1 AND pgs.file_count > 0
             GROUP BY pgs.game_id

             UNION ALL

             SELECT ps.game_id, MAX(COALESCE(ps.ended_at, ps.started_at)) AS last_active
             FROM playtime_sessions ps
             WHERE ps.profile_id = ?1
             GROUP BY ps.game_id
         ) AS combined
         JOIN games g ON g.id = combined.game_id
         GROUP BY g.id, g.name
         ORDER BY MAX(combined.last_active) DESC
         LIMIT 3",
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    stmt.query_map(params![profile_id], |row| row.get(0))
        .map(|rows| rows.filter_map(|r| r.ok()).collect())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn list_profiles(
    db: State<'_, Database>,
) -> Result<Vec<Profile>, String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    crate::commands::save_manager::refresh_all_profiles_save_stats(&conn);
    let active_id = get_active_id(&conn);

    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.name, p.avatar, p.color, p.created_at, p.updated_at,
                    (SELECT COUNT(*) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id AND pgs.file_count > 0) AS games_count,
                    (SELECT COALESCE(SUM(pgs.save_size_bytes), 0) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id) AS total_save_bytes
             FROM profiles p ORDER BY p.created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let is_active = id == active_id;
            Ok(Profile {
                id,
                name: row.get(1)?,
                avatar: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                is_active,
                games_count: row.get(6).ok(),
                total_save_bytes: row.get(7).ok(),
                recent_games: Vec::new(),
            })
        })
        .map_err(|e| e.to_string())?;

    let mut list = Vec::new();
    for r in rows {
        let mut prof = r.map_err(|e| e.to_string())?;
        prof.recent_games = get_profile_recent_games(&conn, &prof.id);
        list.push(prof);
    }
    Ok(list)
}

#[tauri::command]
pub async fn get_active_profile(
    db: State<'_, Database>,
) -> Result<Profile, String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    crate::commands::save_manager::refresh_all_profiles_save_stats(&conn);
    let active_id = get_active_id(&conn);

    let mut profile: Profile = conn.query_row(
        "SELECT p.id, p.name, p.avatar, p.color, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id AND pgs.file_count > 0) AS games_count,
                (SELECT COALESCE(SUM(pgs.save_size_bytes), 0) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id) AS total_save_bytes
         FROM profiles p WHERE p.id = ?1",
        params![active_id],
        |row| {
            Ok(Profile {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                is_active: true,
                games_count: row.get(6).ok(),
                total_save_bytes: row.get(7).ok(),
                recent_games: Vec::new(),
            })
        },
    )
    .map_err(|e| e.to_string())?;

    profile.recent_games = get_profile_recent_games(&conn, &profile.id);
    Ok(profile)
}

#[tauri::command]
pub async fn create_profile(
    db: State<'_, Database>,
    name: String,
    avatar: Option<String>,
    color: Option<String>,
) -> Result<Profile, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let av = avatar.unwrap_or_else(|| "gamepad".to_string());
    let clr = color.unwrap_or_else(|| "#7c5cff".to_string());

    conn.execute(
        "INSERT INTO profiles (id, name, avatar, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, datetime('now'), datetime('now'))",
        params![id, trimmed, av, clr],
    )
    .map_err(|e| e.to_string())?;

    // Create profile folder on disk
    let prof_dir = get_nexus_profiles_root().join(&id).join("games");
    let _ = fs::create_dir_all(&prof_dir);

    conn.query_row(
        "SELECT id, name, avatar, color, created_at, updated_at FROM profiles WHERE id = ?1",
        params![id],
        |row| {
            Ok(Profile {
                id: row.get(0)?,
                name: row.get(1)?,
                avatar: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                is_active: false,
                games_count: Some(0),
                total_save_bytes: Some(0),
                recent_games: Vec::new(),
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_profile(
    db: State<'_, Database>,
    id: String,
    name: String,
    avatar: Option<String>,
    color: Option<String>,
) -> Result<Profile, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    let (current_avatar, current_color): (String, String) = conn
        .query_row(
            "SELECT avatar, color FROM profiles WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;
    let av = avatar.unwrap_or(current_avatar);
    let clr = color.unwrap_or(current_color);

    conn.execute(
        "UPDATE profiles SET name = ?1, avatar = ?2, color = ?3, updated_at = datetime('now') WHERE id = ?4",
        params![trimmed, av, clr, id],
    )
    .map_err(|e| e.to_string())?;

    let active_id = get_active_id(&conn);

    let mut profile: Profile = conn.query_row(
        "SELECT p.id, p.name, p.avatar, p.color, p.created_at, p.updated_at,
                (SELECT COUNT(*) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id AND pgs.file_count > 0) AS games_count,
                (SELECT COALESCE(SUM(pgs.save_size_bytes), 0) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id) AS total_save_bytes
         FROM profiles p WHERE p.id = ?1",
        params![id],
        |row| {
            let pid: String = row.get(0)?;
            let is_active = pid == active_id;
            Ok(Profile {
                id: pid,
                name: row.get(1)?,
                avatar: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                is_active,
                games_count: row.get(6).ok(),
                total_save_bytes: row.get(7).ok(),
                recent_games: Vec::new(),
            })
        },
    )
    .map_err(|e| e.to_string())?;

    profile.recent_games = get_profile_recent_games(&conn, &profile.id);
    Ok(profile)
}

#[tauri::command]
pub async fn delete_profile(
    app: AppHandle,
    db: State<'_, Database>,
    locks: State<'_, SaveManagerLocks>,
    session_mgr: State<'_, SessionManager>,
    id: String,
) -> Result<(), String> {
    let _guard = locks.global.lock().await;

    if id == "default" {
        return Err("Cannot delete default profile".to_string());
    }

    if session_mgr.has_session_for_profile(&id) {
        return Err(SaveManagerError::GameRunning("Cannot delete profile while its game is running".into()).to_string());
    }

    let active_id = {
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        get_active_id(&conn)
    };

    // If deleting the currently active profile, fall back to "default" first!
    if id == active_id {
        let app_c = app.clone();
        let id_c = id.clone();
        tokio::task::spawn_blocking(move || {
            let db_state = app_c.state::<Database>();
            let conn = db_state.connection.lock().expect("db mutex poisoned");
            TransactionCoordinator::swap_all_games_to_profile(&conn, &id_c, "default")
                .map_err(|e| format!("Failed to swap saves to default: {}", e))?;
            conn.execute(
                "UPDATE settings SET value = 'default' WHERE key = 'active_profile_id'",
                [],
            )
            .map_err(|e| format!("Failed to reset active_profile_id: {}", e))?;
            Ok::<(), String>(())
        })
        .await
        .map_err(|e| format!("Task execution failed: {e}"))??;
    }

    let conn = db.connection.lock().map_err(|e| e.to_string())?;

    // Clean up DB foreign key records
    let _ = conn.execute("DELETE FROM profile_game_saves WHERE profile_id = ?1", params![id]);
    let _ = conn.execute("DELETE FROM save_operations WHERE profile_id = ?1", params![id]);
    let _ = conn.execute("DELETE FROM playtime_sessions WHERE profile_id = ?1", params![id]);

    conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    // Cleanup filesystem
    let prof_dir = get_nexus_profiles_root().join(&id);
    let _ = remove_path_all_with_retry(&prof_dir);

    Ok(())
}

/// ATOMIC PROFILE SWITCH (Section 2 & 10):
/// Acquires the Global lock only.
/// Validates no running sessions exist for any game.
/// Updates settings.active_profile_id.
/// Swaps active profile saves onto OS paths so disk state always matches selected profile!
#[tauri::command]
pub async fn switch_profile(
    app: AppHandle,
    db: State<'_, Database>,
    locks: State<'_, SaveManagerLocks>,
    session_mgr: State<'_, SessionManager>,
    new_profile_id: String,
) -> Result<Profile, String> {
    let _guard = locks.global.lock().await;

    if session_mgr.has_any_running_session() {
        return Err(SaveManagerError::GameRunning(
            "Cannot switch profile while a game is running. Please close all running games first.".into(),
        ).to_string());
    }

    // Profile query must complete before the blocking swap below; the swap itself
    // runs off the async runtime (same pattern as launch_game's spawn_blocking)
    // because it copies whole save trees while holding the global lock + DB mutex.
    let (previous_profile_id, profile) = {
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        let previous_profile_id = get_active_id(&conn);

        let mut profile: Profile = conn
            .query_row(
                "SELECT p.id, p.name, p.avatar, p.color, p.created_at, p.updated_at,
                        (SELECT COUNT(*) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id AND pgs.file_count > 0) AS games_count,
                        (SELECT COALESCE(SUM(pgs.save_size_bytes), 0) FROM profile_game_saves pgs WHERE pgs.profile_id = p.id) AS total_save_bytes
                 FROM profiles p WHERE p.id = ?1",
                params![new_profile_id],
                |row| {
                    Ok(Profile {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        avatar: row.get(2)?,
                        color: row.get(3)?,
                        created_at: row.get(4)?,
                        updated_at: row.get(5)?,
                        is_active: true,
                        games_count: row.get(6).ok(),
                        total_save_bytes: row.get(7).ok(),
                        recent_games: Vec::new(),
                    })
                },
            )
            .map_err(|_| SaveManagerError::ProfileNotFound(format!("Profile {} not found", new_profile_id)).to_string())?;

        profile.recent_games = get_profile_recent_games(&conn, &profile.id);
        (previous_profile_id, profile)
    };

    if previous_profile_id != new_profile_id {
        let app_c = app.clone();
        let prev = previous_profile_id.clone();
        let new_id = new_profile_id.clone();
        let swap_result = tokio::task::spawn_blocking(move || {
            let db_state = app_c.state::<Database>();
            let conn = db_state
                .connection
                .lock()
                .expect("db mutex poisoned");
            TransactionCoordinator::swap_all_games_to_profile(&conn, &prev, &new_id)
                .map_err(|e| format!("Failed to swap saves to profile {}: {}", new_id, e))?;

            if let Err(update_err) = conn.execute(
                "UPDATE settings SET value = ?1 WHERE key = 'active_profile_id'",
                params![new_id],
            ) {
                log::error!("Failed to update active_profile_id in DB, rolling back filesystem swap: {}", update_err);
                let _ = TransactionCoordinator::swap_all_games_to_profile(&conn, &new_id, &prev);
                return Err(format!("Database update failed: {}", update_err));
            }
            Ok(())
        })
        .await
        .map_err(|e| format!("Task execution failed: {e}"))?;

        // Swap failed/rolled back — re-read stats so the frontend doesn't
        // show the new profile as active with stale save numbers.
        swap_result?;
    }

    Ok(profile)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GamingAvatarItem {
    pub id: String,
    pub name: String,
    pub source: String,
    pub image_url: String,
    pub preview_url: String,
    pub subtitle: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

fn get_curated_avatars() -> Vec<GamingAvatarItem> {
    vec![
        // Call of Duty & Tactical
        GamingAvatarItem {
            id: "curated_ghost".to_string(),
            name: "Simon \"Ghost\" Riley".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5v5h.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co5v5h.jpg".to_string(),
            subtitle: Some("Call of Duty: Modern Warfare II".to_string()),
            tags: vec!["call of duty".into(), "cod".into(), "mw2".into(), "ghost".into(), "simon riley".into()],
        },
        GamingAvatarItem {
            id: "curated_price".to_string(),
            name: "Captain John Price".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1x77.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1x77.jpg".to_string(),
            subtitle: Some("Call of Duty: Modern Warfare".to_string()),
            tags: vec!["call of duty".into(), "cod".into(), "mw".into(), "price".into(), "captain price".into()],
        },
        GamingAvatarItem {
            id: "curated_soap".to_string(),
            name: "John \"Soap\" MacTavish".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2044.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co2044.jpg".to_string(),
            subtitle: Some("Call of Duty: Modern Warfare 2".to_string()),
            tags: vec!["call of duty".into(), "cod".into(), "mw2".into(), "soap".into(), "mactavish".into()],
        },
        GamingAvatarItem {
            id: "curated_mason".to_string(),
            name: "Alex Mason".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2949.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co2949.jpg".to_string(),
            subtitle: Some("Call of Duty: Black Ops".to_string()),
            tags: vec!["call of duty".into(), "cod".into(), "black ops".into(), "mason".into()],
        },
        GamingAvatarItem {
            id: "curated_woods".to_string(),
            name: "Frank Woods".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co222x.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co222x.jpg".to_string(),
            subtitle: Some("Call of Duty: Black Ops Cold War".to_string()),
            tags: vec!["call of duty".into(), "cod".into(), "black ops".into(), "woods".into()],
        },

        // PlayStation Classics
        GamingAvatarItem {
            id: "curated_kratos".to_string(),
            name: "Kratos".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm2zp.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm2zp.jpg".to_string(),
            subtitle: Some("God of War Ragnarök".to_string()),
            tags: vec!["god of war".into(), "gow".into(), "kratos".into(), "playstation".into(), "sony".into()],
        },
        GamingAvatarItem {
            id: "curated_atreus".to_string(),
            name: "Atreus".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5s5v.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co5s5v.jpg".to_string(),
            subtitle: Some("God of War".to_string()),
            tags: vec!["god of war".into(), "gow".into(), "atreus".into(), "loki".into()],
        },
        GamingAvatarItem {
            id: "curated_spiderman".to_string(),
            name: "Peter Parker (Spider-Man)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm12k.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm12k.jpg".to_string(),
            subtitle: Some("Marvel's Spider-Man 2".to_string()),
            tags: vec!["spider-man".into(), "spiderman".into(), "marvel".into(), "peter parker".into()],
        },
        GamingAvatarItem {
            id: "curated_miles".to_string(),
            name: "Miles Morales".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co20r8.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co20r8.jpg".to_string(),
            subtitle: Some("Marvel's Spider-Man: Miles Morales".to_string()),
            tags: vec!["spider-man".into(), "spiderman".into(), "miles morales".into(), "marvel".into()],
        },
        GamingAvatarItem {
            id: "curated_ellie".to_string(),
            name: "Ellie Williams".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm64.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm64.jpg".to_string(),
            subtitle: Some("The Last of Us Part II".to_string()),
            tags: vec!["the last of us".into(), "tlou".into(), "ellie".into(), "naughty dog".into()],
        },
        GamingAvatarItem {
            id: "curated_joel".to_string(),
            name: "Joel Miller".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r7f.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1r7f.jpg".to_string(),
            subtitle: Some("The Last of Us".to_string()),
            tags: vec!["the last of us".into(), "tlou".into(), "joel".into(), "naughty dog".into()],
        },
        GamingAvatarItem {
            id: "curated_jinsakai".to_string(),
            name: "Jin Sakai".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm3s7.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm3s7.jpg".to_string(),
            subtitle: Some("Ghost of Tsushima".to_string()),
            tags: vec!["ghost of tsushima".into(), "jin sakai".into(), "samurai".into(), "playstation".into()],
        },
        GamingAvatarItem {
            id: "curated_nate".to_string(),
            name: "Nathan Drake".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r77.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1r77.jpg".to_string(),
            subtitle: Some("Uncharted 4: A Thief's End".to_string()),
            tags: vec!["uncharted".into(), "nathan drake".into(), "drake".into(), "naughty dog".into()],
        },
        GamingAvatarItem {
            id: "curated_aloy".to_string(),
            name: "Aloy".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co28rw.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co28rw.jpg".to_string(),
            subtitle: Some("Horizon Forbidden West".to_string()),
            tags: vec!["horizon".into(), "aloy".into(), "zero dawn".into(), "guerrilla".into()],
        },
        GamingAvatarItem {
            id: "curated_bloodborne".to_string(),
            name: "The Good Hunter".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1rba.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1rba.jpg".to_string(),
            subtitle: Some("Bloodborne".to_string()),
            tags: vec!["bloodborne".into(), "hunter".into(), "fromsoftware".into(), "souls".into()],
        },

        // Witcher & Cyberpunk (CD Projekt Red)
        GamingAvatarItem {
            id: "curated_geralt".to_string(),
            name: "Geralt of Rivia".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm6a.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm6a.jpg".to_string(),
            subtitle: Some("The Witcher 3: Wild Hunt".to_string()),
            tags: vec!["witcher".into(), "witcher 3".into(), "geralt".into(), "cdpr".into(), "rpg".into()],
        },
        GamingAvatarItem {
            id: "curated_ciri".to_string(),
            name: "Ciri (Cirilla)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/b2f4qo7yzuzr1ly0swci.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/b2f4qo7yzuzr1ly0swci.jpg".to_string(),
            subtitle: Some("The Witcher 3: Wild Hunt".to_string()),
            tags: vec!["witcher".into(), "ciri".into(), "cirilla".into(), "cdpr".into()],
        },
        GamingAvatarItem {
            id: "curated_yennefer".to_string(),
            name: "Yennefer of Vengerberg".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/uhyat4iaflnxlzcdfxip.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/uhyat4iaflnxlzcdfxip.jpg".to_string(),
            subtitle: Some("The Witcher 3: Wild Hunt".to_string()),
            tags: vec!["witcher".into(), "yennefer".into(), "yen".into(), "cdpr".into()],
        },
        GamingAvatarItem {
            id: "curated_triss".to_string(),
            name: "Triss Merigold".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/jec1fydhokwngsgfypix.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/jec1fydhokwngsgfypix.jpg".to_string(),
            subtitle: Some("The Witcher 3: Wild Hunt".to_string()),
            tags: vec!["witcher".into(), "triss".into(), "merigold".into(), "cdpr".into()],
        },
        GamingAvatarItem {
            id: "curated_v".to_string(),
            name: "V (Mercenary)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm3s9.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm3s9.jpg".to_string(),
            subtitle: Some("Cyberpunk 2077".to_string()),
            tags: vec!["cyberpunk".into(), "cyberpunk 2077".into(), "v".into(), "cdpr".into()],
        },
        GamingAvatarItem {
            id: "curated_johnny".to_string(),
            name: "Johnny Silverhand".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2m6b.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co2m6b.jpg".to_string(),
            subtitle: Some("Cyberpunk 2077".to_string()),
            tags: vec!["cyberpunk".into(), "johnny".into(), "silverhand".into(), "keanu".into(), "cdpr".into()],
        },

        // Rockstar Games
        GamingAvatarItem {
            id: "curated_arthur".to_string(),
            name: "Arthur Morgan".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm5q.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm5q.jpg".to_string(),
            subtitle: Some("Red Dead Redemption 2".to_string()),
            tags: vec!["red dead".into(), "rdr2".into(), "arthur".into(), "morgan".into(), "rockstar".into()],
        },
        GamingAvatarItem {
            id: "curated_marston".to_string(),
            name: "John Marston".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1pcy.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1pcy.jpg".to_string(),
            subtitle: Some("Red Dead Redemption".to_string()),
            tags: vec!["red dead".into(), "rdr".into(), "john marston".into(), "marston".into(), "rockstar".into()],
        },
        GamingAvatarItem {
            id: "curated_trevor".to_string(),
            name: "Trevor Philips".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1t1a.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1t1a.jpg".to_string(),
            subtitle: Some("Grand Theft Auto V".to_string()),
            tags: vec!["gta".into(), "gta5".into(), "gta v".into(), "trevor".into(), "rockstar".into()],
        },
        GamingAvatarItem {
            id: "curated_michael".to_string(),
            name: "Michael De Santa".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lb7.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co2lb7.jpg".to_string(),
            subtitle: Some("Grand Theft Auto V".to_string()),
            tags: vec!["gta".into(), "gta5".into(), "gta v".into(), "michael".into(), "rockstar".into()],
        },
        GamingAvatarItem {
            id: "curated_cj".to_string(),
            name: "Carl \"CJ\" Johnson".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1x7c.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1x7c.jpg".to_string(),
            subtitle: Some("GTA: San Andreas".to_string()),
            tags: vec!["gta".into(), "san andreas".into(), "cj".into(), "carl johnson".into(), "rockstar".into()],
        },

        // Xbox & Bethesda
        GamingAvatarItem {
            id: "curated_masterchief".to_string(),
            name: "Master Chief (John-117)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm1b.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm1b.jpg".to_string(),
            subtitle: Some("Halo Infinite".to_string()),
            tags: vec!["halo".into(), "master chief".into(), "spartan".into(), "xbox".into()],
        },
        GamingAvatarItem {
            id: "curated_doomguy".to_string(),
            name: "Doom Slayer".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm2k0.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm2k0.jpg".to_string(),
            subtitle: Some("DOOM Eternal".to_string()),
            tags: vec!["doom".into(), "doomguy".into(), "slayer".into(), "id software".into(), "bethesda".into()],
        },
        GamingAvatarItem {
            id: "curated_dragonborn".to_string(),
            name: "The Dragonborn (Dovahkiin)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tnw.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1tnw.jpg".to_string(),
            subtitle: Some("The Elder Scrolls V: Skyrim".to_string()),
            tags: vec!["skyrim".into(), "dragonborn".into(), "elder scrolls".into(), "dovahkiin".into(), "bethesda".into()],
        },
        GamingAvatarItem {
            id: "curated_vaultboy".to_string(),
            name: "Vault Boy".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1x18.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1x18.jpg".to_string(),
            subtitle: Some("Fallout 4".to_string()),
            tags: vec!["fallout".into(), "vault boy".into(), "bethesda".into()],
        },

        // Capcom & Resident Evil
        GamingAvatarItem {
            id: "curated_leon".to_string(),
            name: "Leon S. Kennedy".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm3j.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm3j.jpg".to_string(),
            subtitle: Some("Resident Evil 4".to_string()),
            tags: vec!["resident evil".into(), "re4".into(), "leon".into(), "capcom".into()],
        },
        GamingAvatarItem {
            id: "curated_jill".to_string(),
            name: "Jill Valentine".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1x7i.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1x7i.jpg".to_string(),
            subtitle: Some("Resident Evil 3".to_string()),
            tags: vec!["resident evil".into(), "re3".into(), "jill".into(), "capcom".into()],
        },
        GamingAvatarItem {
            id: "curated_dante".to_string(),
            name: "Dante".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1nvd.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1nvd.jpg".to_string(),
            subtitle: Some("Devil May Cry 5".to_string()),
            tags: vec!["devil may cry".into(), "dmc".into(), "dante".into(), "capcom".into()],
        },
        GamingAvatarItem {
            id: "curated_vergil".to_string(),
            name: "Vergil".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2k9u.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co2k9u.jpg".to_string(),
            subtitle: Some("Devil May Cry 5".to_string()),
            tags: vec!["devil may cry".into(), "dmc".into(), "vergil".into(), "capcom".into()],
        },

        // Konami & Metal Gear
        GamingAvatarItem {
            id: "curated_solid_snake".to_string(),
            name: "Solid Snake".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm14.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm14.jpg".to_string(),
            subtitle: Some("Metal Gear Solid".to_string()),
            tags: vec!["metal gear".into(), "mgs".into(), "snake".into(), "solid snake".into(), "konami".into()],
        },
        GamingAvatarItem {
            id: "curated_raiden".to_string(),
            name: "Raiden (Cyborg Ninja)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1x3t.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1x3t.jpg".to_string(),
            subtitle: Some("Metal Gear Rising: Revengeance".to_string()),
            tags: vec!["metal gear".into(), "raiden".into(), "ninja".into(), "revengeance".into()],
        },

        // Soulslike & FromSoftware
        GamingAvatarItem {
            id: "curated_tarnished".to_string(),
            name: "The Tarnished".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg".to_string(),
            subtitle: Some("Elden Ring".to_string()),
            tags: vec!["elden ring".into(), "tarnished".into(), "fromsoftware".into(), "souls".into()],
        },
        GamingAvatarItem {
            id: "curated_malenia".to_string(),
            name: "Malenia, Blade of Miquella".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jne.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co4jne.jpg".to_string(),
            subtitle: Some("Elden Ring".to_string()),
            tags: vec!["elden ring".into(), "malenia".into(), "fromsoftware".into(), "souls".into()],
        },
        GamingAvatarItem {
            id: "curated_sekiro".to_string(),
            name: "Wolf (Sekiro)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r76.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1r76.jpg".to_string(),
            subtitle: Some("Sekiro: Shadows Die Twice".to_string()),
            tags: vec!["sekiro".into(), "wolf".into(), "fromsoftware".into()],
        },

        // Square Enix & JRPG
        GamingAvatarItem {
            id: "curated_cloud".to_string(),
            name: "Cloud Strife".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm1g.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm1g.jpg".to_string(),
            subtitle: Some("Final Fantasy VII Remake".to_string()),
            tags: vec!["final fantasy".into(), "ff7".into(), "cloud".into(), "square enix".into()],
        },
        GamingAvatarItem {
            id: "curated_sephiroth".to_string(),
            name: "Sephiroth".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co2k0d.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co2k0d.jpg".to_string(),
            subtitle: Some("Final Fantasy VII Rebirth".to_string()),
            tags: vec!["final fantasy".into(), "ff7".into(), "sephiroth".into(), "square enix".into()],
        },
        GamingAvatarItem {
            id: "curated_2b".to_string(),
            name: "YoRHa No. 2 Type B (2B)".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm2k2.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm2k2.jpg".to_string(),
            subtitle: Some("NieR: Automata".to_string()),
            tags: vec!["nier".into(), "2b".into(), "automata".into(), "square enix".into()],
        },

        // Iconic Legends & Retro
        GamingAvatarItem {
            id: "curated_link".to_string(),
            name: "Link".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co5vmg.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co5vmg.jpg".to_string(),
            subtitle: Some("The Legend of Zelda: Tears of the Kingdom".to_string()),
            tags: vec!["zelda".into(), "link".into(), "nintendo".into()],
        },
        GamingAvatarItem {
            id: "curated_laracroft".to_string(),
            name: "Lara Croft".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/cm8.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/cm8.jpg".to_string(),
            subtitle: Some("Tomb Raider".to_string()),
            tags: vec!["tomb raider".into(), "lara croft".into(), "lara".into()],
        },
        GamingAvatarItem {
            id: "curated_gordon".to_string(),
            name: "Gordon Freeman".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1r74.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1r74.jpg".to_string(),
            subtitle: Some("Half-Life 2".to_string()),
            tags: vec!["half life".into(), "half-life".into(), "gordon freeman".into(), "valve".into()],
        },
        GamingAvatarItem {
            id: "curated_jinx".to_string(),
            name: "Jinx".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co3p81.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co3p81.jpg".to_string(),
            subtitle: Some("League of Legends / Arcane".to_string()),
            tags: vec!["league of legends".into(), "lol".into(), "arcane".into(), "jinx".into(), "riot".into()],
        },
        GamingAvatarItem {
            id: "curated_tracer".to_string(),
            name: "Tracer".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co1rcd.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co1rcd.jpg".to_string(),
            subtitle: Some("Overwatch 2".to_string()),
            tags: vec!["overwatch".into(), "ow".into(), "tracer".into(), "blizzard".into()],
        },
        GamingAvatarItem {
            id: "curated_scorpion".to_string(),
            name: "Scorpion".to_string(),
            source: "curated".to_string(),
            image_url: "https://images.igdb.com/igdb/image/upload/t_cover_big/co6m8s.jpg".to_string(),
            preview_url: "https://images.igdb.com/igdb/image/upload/t_thumb/co6m8s.jpg".to_string(),
            subtitle: Some("Mortal Kombat 1".to_string()),
            tags: vec!["mortal kombat".into(), "mk".into(), "scorpion".into()],
        },
    ]
}

async fn search_steam_store_avatars(
    client: &reqwest::Client,
    query: &str,
) -> Vec<GamingAvatarItem> {
    let sanitized = query.trim();
    if sanitized.is_empty() {
        return Vec::new();
    }
    let query_param = sanitized.replace(' ', "+");
    let url = format!(
        "https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US",
        query_param
    );

    let Ok(resp) = client.get(&url).send().await else {
        return Vec::new();
    };
    let Ok(json) = resp.json::<serde_json::Value>().await else {
        return Vec::new();
    };

    let mut items = Vec::new();
    if let Some(arr) = json.get("items").and_then(|v| v.as_array()) {
        for it in arr.iter().take(10) {
            let id = it.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let name = it.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let tiny = it.get("tiny_image").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id > 0 && !name.is_empty() {
                let hero_url = format!(
                    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{id}/header.jpg"
                );
                items.push(GamingAvatarItem {
                    id: format!("steam_{id}"),
                    name: format!("{name} (Steam)"),
                    source: "steam".to_string(),
                    image_url: hero_url.clone(),
                    preview_url: if tiny.is_empty() { hero_url } else { tiny },
                    subtitle: Some("Steam Store".to_string()),
                    tags: vec!["steam".to_string(), "pc".to_string()],
                });
            }
        }
    }
    items
}

#[tauri::command]
pub async fn download_avatar_data_url(
    http: State<'_, crate::commands::metadata::HttpClient>,
    url: String,
) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(url);
    }

    let resp = http
        .0
        .get(&url)
        .header(
            "User-Agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        )
        .send()
        .await
        .map_err(|e| format!("Failed to download avatar: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Avatar download failed with HTTP {}", resp.status()));
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Failed to read avatar bytes: {e}"))?;

    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:{content_type};base64,{b64}"))
}

#[tauri::command]
pub async fn search_gaming_avatars(
    db: State<'_, Database>,
    http: State<'_, crate::commands::metadata::HttpClient>,
    token_cache: State<'_, crate::commands::metadata::IgdbTokenCache>,
    query: String,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<Vec<GamingAvatarItem>, String> {
    let offset_val = offset.unwrap_or(0);
    let limit_val = limit.unwrap_or(24);

    let (igdb_client_id, igdb_client_secret, steamgriddb_key) = {
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        let read = |key: &str| -> Option<String> {
            conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| row.get(0))
                .ok()
                .and_then(|v: String| (!v.trim().is_empty()).then_some(v))
        };
        (read("igdb_client_id"), read("igdb_client_secret"), read("steamgriddb_api_key"))
    };

    let trimmed = query.trim();
    let mut items = Vec::new();

    // 1. Match Curated Heroes
    let curated = get_curated_avatars();
    let query_lower = trimmed.to_lowercase();
    let mut curated_matches: Vec<GamingAvatarItem> = curated
        .into_iter()
        .filter(|p| {
            if trimmed.is_empty() {
                true
            } else {
                p.name.to_lowercase().contains(&query_lower)
                    || p.subtitle.as_deref().unwrap_or("").to_lowercase().contains(&query_lower)
                    || p.tags.iter().any(|t| t.to_lowercase().contains(&query_lower))
            }
        })
        .collect();

    let curated_slice: Vec<GamingAvatarItem> = curated_matches
        .drain(..)
        .skip(offset_val)
        .take(limit_val)
        .collect();

    for item in curated_slice {
        items.push(item);
    }

    // 2. Query IGDB Characters if configured
    if let (Some(client_id), Some(secret)) = (igdb_client_id, igdb_client_secret) {
        if let Ok(token) = crate::commands::metadata::igdb::get_access_token(&http.0, &token_cache, &client_id, &secret).await {
            let igdb_offset = offset_val;

            if let Ok(chars) = crate::commands::metadata::igdb::search_characters(
                &http.0,
                &client_id,
                &token,
                trimmed,
                igdb_offset,
                limit_val,
            ).await {
                for c in chars {
                    if !items.iter().any(|x| x.name.eq_ignore_ascii_case(&c.name)) {
                        items.push(GamingAvatarItem {
                            id: format!("igdb_{}", c.id),
                            name: c.name,
                            source: "igdb".to_string(),
                            image_url: c.image_url,
                            preview_url: c.thumbnail_url,
                            subtitle: c.game_name,
                            tags: Vec::new(),
                        });
                    }
                }
            }
        }
    }

    // 3. Query Steam Store Search if query is not empty
    if !trimmed.is_empty() && items.len() < limit_val * 2 {
        let steam_items = search_steam_store_avatars(&http.0, trimmed).await;
        for s in steam_items {
            if !items.iter().any(|x| x.name.eq_ignore_ascii_case(&s.name)) {
                items.push(s);
            }
        }
    }

    // 4. Query SteamGridDB Icons if query is not empty and key is configured
    if let Some(sgdb_key) = steamgriddb_key {
        if !trimmed.is_empty() {
            if let Ok(icons) = crate::commands::metadata::steamgriddb::search_icons(&http.0, &sgdb_key, trimmed).await {
                for icon in icons {
                    if !items.iter().any(|x| x.image_url == icon.url) {
                        items.push(GamingAvatarItem {
                            id: format!("sgdb_{}", icon.id),
                            name: format!("{} Icon", trimmed),
                            source: "steamgriddb".to_string(),
                            image_url: icon.url,
                            preview_url: icon.thumbnail_url,
                            subtitle: Some("SteamGridDB".to_string()),
                            tags: Vec::new(),
                        });
                    }
                }
            }
        }
    }

    Ok(items)
}

