use base64::Engine;
use crate::commands::save_manager::error::SaveManagerError;
use crate::commands::save_manager::fs_ops::{get_nexus_profiles_root, is_valid_id_segment, remove_path_all_with_retry, sanitize_safe_id_segment};
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
    let prof_dir = get_nexus_profiles_root().join(sanitize_safe_id_segment(&id)).join("games");
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
    if !is_valid_id_segment(&id) {
        return Err("Invalid profile ID".to_string());
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
            let conn = db_state.connection.lock().unwrap_or_else(|e| e.into_inner());
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

    // Cleanup filesystem safely inside profiles root
    let profiles_root = get_nexus_profiles_root();
    let safe_id = sanitize_safe_id_segment(&id);
    let prof_dir = profiles_root.join(&safe_id);
    if prof_dir.starts_with(&profiles_root) && prof_dir != profiles_root {
        let _ = remove_path_all_with_retry(&prof_dir);
    }

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
                .lock().unwrap_or_else(|e| e.into_inner());
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

        swap_result?;

        // Re-read profile stats after swap so the returned Profile has accurate post-swap games_count and total_save_bytes
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        let mut refreshed: Profile = conn
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
            .unwrap_or(profile);
        refreshed.recent_games = get_profile_recent_games(&conn, &refreshed.id);
        return Ok(refreshed);
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

fn steam_avatar_item(
    id: &str,
    name: &str,
    app_id: u64,
    subtitle: &str,
    tags: &[&str],
) -> GamingAvatarItem {
    let base = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps";
    GamingAvatarItem {
        id: id.to_string(),
        name: name.to_string(),
        source: "curated".to_string(),
        image_url: format!("{base}/{app_id}/library_600x900_2x.jpg"),
        preview_url: format!("{base}/{app_id}/library_600x900.jpg"),
        subtitle: Some(subtitle.to_string()),
        tags: tags.iter().map(|t| (*t).to_string()).collect(),
    }
}

fn get_curated_avatars() -> Vec<GamingAvatarItem> {
    vec![
        // Call of Duty & Tactical
        steam_avatar_item(
            "curated_ghost",
            "Simon \"Ghost\" Riley",
            1938090,
            "Call of Duty: Modern Warfare II",
            &["call of duty", "cod", "mw2", "ghost", "simon riley", "shooter"],
        ),
        steam_avatar_item(
            "curated_price",
            "Captain John Price",
            2000950,
            "Call of Duty: Modern Warfare",
            &["call of duty", "cod", "mw", "price", "captain price", "shooter"],
        ),
        steam_avatar_item(
            "curated_soap",
            "John \"Soap\" MacTavish",
            2519060,
            "Call of Duty: Modern Warfare III",
            &["call of duty", "cod", "mw3", "soap", "mactavish", "shooter"],
        ),
        steam_avatar_item(
            "curated_mason",
            "Alex Mason",
            42700,
            "Call of Duty: Black Ops",
            &["call of duty", "cod", "black ops", "mason", "shooter"],
        ),
        steam_avatar_item(
            "curated_woods",
            "Frank Woods",
            1985810,
            "Call of Duty: Black Ops Cold War",
            &["call of duty", "cod", "black ops", "woods", "shooter"],
        ),

        // PlayStation Icons
        steam_avatar_item(
            "curated_kratos_rag",
            "Kratos",
            2322010,
            "God of War Ragnarök",
            &["god of war", "gow", "kratos", "playstation", "sony"],
        ),
        steam_avatar_item(
            "curated_kratos_2018",
            "Kratos & Atreus",
            1593500,
            "God of War",
            &["god of war", "gow", "atreus", "kratos", "playstation"],
        ),
        steam_avatar_item(
            "curated_spiderman",
            "Peter Parker (Spider-Man)",
            1817070,
            "Marvel's Spider-Man Remastered",
            &["spider-man", "spiderman", "marvel", "peter parker", "playstation"],
        ),
        steam_avatar_item(
            "curated_miles",
            "Miles Morales",
            1817190,
            "Marvel's Spider-Man: Miles Morales",
            &["spider-man", "spiderman", "miles morales", "marvel", "playstation"],
        ),
        steam_avatar_item(
            "curated_ellie_joel",
            "Ellie & Joel",
            1888930,
            "The Last of Us Part I",
            &["the last of us", "tlou", "ellie", "joel", "playstation"],
        ),
        steam_avatar_item(
            "curated_jinsakai",
            "Jin Sakai (The Ghost)",
            2215430,
            "Ghost of Tsushima",
            &["ghost of tsushima", "jin sakai", "samurai", "playstation"],
        ),
        steam_avatar_item(
            "curated_nate",
            "Nathan Drake",
            1659420,
            "Uncharted: Legacy of Thieves",
            &["uncharted", "nathan drake", "drake", "playstation"],
        ),
        steam_avatar_item(
            "curated_aloy_fw",
            "Aloy",
            2420110,
            "Horizon Forbidden West",
            &["horizon", "aloy", "forbidden west", "playstation"],
        ),
        steam_avatar_item(
            "curated_aloy_zd",
            "Aloy (Seeker)",
            1151640,
            "Horizon Zero Dawn",
            &["horizon", "aloy", "zero dawn", "playstation"],
        ),

        // Witcher, Cyberpunk & CRPG
        steam_avatar_item(
            "curated_geralt",
            "Geralt of Rivia",
            292030,
            "The Witcher 3: Wild Hunt",
            &["witcher", "witcher 3", "geralt", "cdpr", "rpg"],
        ),
        steam_avatar_item(
            "curated_v",
            "V (Night City Mercenary)",
            1091500,
            "Cyberpunk 2077",
            &["cyberpunk", "cyberpunk 2077", "v", "johnny silverhand", "cdpr"],
        ),
        steam_avatar_item(
            "curated_phantom_liberty",
            "Songbird & Solomon Reed",
            2138330,
            "Cyberpunk 2077: Phantom Liberty",
            &["cyberpunk", "phantom liberty", "songbird", "cdpr"],
        ),
        steam_avatar_item(
            "curated_bg3",
            "Astarion & Shadowheart",
            1086940,
            "Baldur's Gate 3",
            &["baldurs gate", "bg3", "astarion", "shadowheart", "rpg"],
        ),

        // Rockstar Legends
        steam_avatar_item(
            "curated_arthur",
            "Arthur Morgan",
            1174180,
            "Red Dead Redemption 2",
            &["red dead", "rdr2", "arthur", "morgan", "rockstar"],
        ),
        steam_avatar_item(
            "curated_marston",
            "John Marston",
            2668510,
            "Red Dead Redemption",
            &["red dead", "rdr", "john marston", "marston", "rockstar"],
        ),
        steam_avatar_item(
            "curated_gtav",
            "Michael, Franklin & Trevor",
            271590,
            "Grand Theft Auto V",
            &["gta", "gta5", "gta v", "trevor", "michael", "franklin", "rockstar"],
        ),
        steam_avatar_item(
            "curated_cj",
            "Carl \"CJ\" Johnson",
            1547000,
            "GTA: San Andreas",
            &["gta", "san andreas", "cj", "carl johnson", "rockstar"],
        ),

        // Xbox & Bethesda
        steam_avatar_item(
            "curated_masterchief",
            "Master Chief (John-117)",
            1240440,
            "Halo Infinite",
            &["halo", "master chief", "spartan", "xbox"],
        ),
        steam_avatar_item(
            "curated_doomslayer",
            "Doom Slayer",
            782330,
            "DOOM Eternal",
            &["doom", "doomguy", "slayer", "bethesda", "xbox"],
        ),
        steam_avatar_item(
            "curated_doom_2016",
            "Praetor Doom Marine",
            379720,
            "DOOM (2016)",
            &["doom", "doomguy", "slayer", "bethesda", "xbox"],
        ),
        steam_avatar_item(
            "curated_dragonborn",
            "The Dragonborn (Dovahkiin)",
            489830,
            "The Elder Scrolls V: Skyrim",
            &["skyrim", "dragonborn", "elder scrolls", "dovahkiin", "bethesda", "xbox"],
        ),
        steam_avatar_item(
            "curated_fallout",
            "Brotherhood Power Armor",
            377160,
            "Fallout 4",
            &["fallout", "vault boy", "power armor", "bethesda", "xbox"],
        ),

        // Capcom & Resident Evil
        steam_avatar_item(
            "curated_leon",
            "Leon S. Kennedy",
            2050650,
            "Resident Evil 4",
            &["resident evil", "re4", "leon", "capcom"],
        ),
        steam_avatar_item(
            "curated_jill",
            "Jill Valentine",
            952060,
            "Resident Evil 3",
            &["resident evil", "re3", "jill", "capcom"],
        ),
        steam_avatar_item(
            "curated_claire_leon",
            "Leon & Claire Redfield",
            883710,
            "Resident Evil 2",
            &["resident evil", "re2", "claire", "leon", "capcom"],
        ),
        steam_avatar_item(
            "curated_re_village",
            "Chris Redfield (Hound Wolf)",
            1196590,
            "Resident Evil Village",
            &["resident evil", "re8", "village", "chris", "capcom"],
        ),
        steam_avatar_item(
            "curated_dante",
            "Dante, Nero & Vergil",
            601150,
            "Devil May Cry 5",
            &["devil may cry", "dmc", "dante", "vergil", "nero", "capcom"],
        ),

        // Soulslike, Action & Mythology
        steam_avatar_item(
            "curated_tarnished",
            "The Tarnished (Vyke)",
            1245620,
            "Elden Ring",
            &["elden ring", "tarnished", "fromsoftware", "souls"],
        ),
        steam_avatar_item(
            "curated_messmer",
            "Messmer the Impaler",
            2778580,
            "Elden Ring: Shadow of the Erdtree",
            &["elden ring", "messmer", "malenia", "fromsoftware", "souls"],
        ),
        steam_avatar_item(
            "curated_sekiro",
            "Wolf (One-Armed Shinobi)",
            814380,
            "Sekiro: Shadows Die Twice",
            &["sekiro", "wolf", "fromsoftware", "souls"],
        ),
        steam_avatar_item(
            "curated_ds3",
            "Soul of Cinder (Ashen One)",
            374320,
            "Dark Souls III",
            &["dark souls", "ds3", "ashen one", "fromsoftware", "souls"],
        ),
        steam_avatar_item(
            "curated_wukong",
            "The Destined One (Wukong)",
            2358720,
            "Black Myth: Wukong",
            &["wukong", "black myth", "souls", "action"],
        ),

        // Square Enix & JRPG
        steam_avatar_item(
            "curated_cloud",
            "Cloud Strife",
            1462040,
            "Final Fantasy VII Remake",
            &["final fantasy", "ff7", "cloud", "square enix"],
        ),
        steam_avatar_item(
            "curated_sephiroth",
            "Sephiroth & Cloud",
            2909400,
            "Final Fantasy VII Rebirth",
            &["final fantasy", "ff7", "sephiroth", "cloud", "square enix"],
        ),
        steam_avatar_item(
            "curated_clive",
            "Clive Rosfield (Ifrit)",
            2515020,
            "Final Fantasy XVI",
            &["final fantasy", "ff16", "clive", "square enix"],
        ),
        steam_avatar_item(
            "curated_2b",
            "YoRHa No.2 Type B (2B)",
            524220,
            "NieR:Automata",
            &["nier", "2b", "automata", "square enix", "final fantasy"],
        ),

        // Konami, Fighting & Iconic Legends
        steam_avatar_item(
            "curated_bigboss",
            "Venom Snake (Big Boss)",
            287700,
            "Metal Gear Solid V: The Phantom Pain",
            &["metal gear", "mgs", "snake", "big boss", "konami"],
        ),
        steam_avatar_item(
            "curated_raiden",
            "Raiden (Cyborg Ninja)",
            235460,
            "Metal Gear Rising: Revengeance",
            &["metal gear", "raiden", "ninja", "revengeance"],
        ),
        steam_avatar_item(
            "curated_laracroft",
            "Lara Croft",
            750920,
            "Shadow of the Tomb Raider",
            &["tomb raider", "lara croft", "lara"],
        ),
        steam_avatar_item(
            "curated_gordon",
            "Gordon Freeman",
            220,
            "Half-Life 2",
            &["half life", "half-life", "gordon freeman", "valve"],
        ),
        steam_avatar_item(
            "curated_mk1",
            "Fire God Liu Kang",
            1971870,
            "Mortal Kombat 1",
            &["mortal kombat", "mk1", "liu kang", "scorpion", "sub-zero"],
        ),
        steam_avatar_item(
            "curated_tekken8",
            "Jin Kazama & Kazuya",
            1778820,
            "TEKKEN 8",
            &["tekken", "jin kazama", "kazuya", "fighting"],
        ),
        steam_avatar_item(
            "curated_batman",
            "Batman (The Dark Knight)",
            208650,
            "Batman: Arkham Knight",
            &["batman", "arkham", "dc", "dark knight"],
        ),
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
    let url = "https://store.steampowered.com/api/storesearch/";
    let Ok(resp) = client
        .get(url)
        .query(&[("term", sanitized), ("l", "english"), ("cc", "US")])
        .send()
        .await
    else {
        return Vec::new();
    };
    let Ok(json) = resp.json::<serde_json::Value>().await else {
        return Vec::new();
    };

    let base = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps";
    let mut items = Vec::new();
    if let Some(arr) = json.get("items").and_then(|v| v.as_array()) {
        for it in arr.iter().take(12) {
            let id = it.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
            let name = it.get("name").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
            let lower = name.to_lowercase();
            // Skip soundtracks, demos, artbooks, and trial packs so only genuine games appear
            if lower.contains("soundtrack")
                || lower.ends_with(" demo")
                || lower.contains("artbook")
                || lower.contains("upgrade pack")
            {
                continue;
            }
            if id > 0 && !name.is_empty() {
                let hd_cover = format!("{base}/{id}/library_600x900_2x.jpg");
                let std_cover = format!("{base}/{id}/library_600x900.jpg");
                items.push(GamingAvatarItem {
                    id: format!("steam_{id}"),
                    name,
                    source: "steam".to_string(),
                    image_url: hd_cover,
                    preview_url: std_cover,
                    subtitle: Some("Steam HD Portrait".to_string()),
                    tags: vec!["steam".to_string(), "pc".to_string()],
                });
            }
        }
    }
    items
}

const MAX_AVATAR_BYTES: usize = 10 * 1024 * 1024;

pub(crate) fn is_blocked_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            let o = v4.octets();
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_documentation()
                || o[0] == 0
                // Shared Address Space / CGNAT (100.64.0.0/10)
                || (o[0] == 100 && (o[1] & 0b1100_0000) == 64)
                // IETF Protocol Assignments (192.0.0.0/24)
                || (o[0] == 192 && o[1] == 0 && o[2] == 0)
                // Benchmarking (198.18.0.0/15)
                || (o[0] == 198 && (o[1] & 0xfe) == 18)
                // Reserved for future use (240.0.0.0/4)
                || o[0] >= 240
        }
        std::net::IpAddr::V6(v6) => {
            if let Some(mapped_v4) = v6.to_ipv4_mapped().or_else(|| v6.to_ipv4()) {
                return is_blocked_ip(std::net::IpAddr::V4(mapped_v4));
            }
            let segs = v6.segments();
            v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                // Unique Local Address (fc00::/7)
                || (segs[0] & 0xfe00) == 0xfc00
                // Link-Local (fe80::/10)
                || (segs[0] & 0xffc0) == 0xfe80
                // Documentation (2001:db8::/32)
                || (segs[0] == 0x2001 && segs[1] == 0x0db8)
        }
    }
}

pub(crate) fn is_blocked_host_or_ip(host: &str) -> bool {
    let lower = host
        .trim()
        .trim_matches(['[', ']'])
        .trim_end_matches('.')
        .to_ascii_lowercase();
    if lower.is_empty()
        || lower == "localhost"
        || lower.ends_with(".localhost")
        || lower.ends_with(".local")
        || lower.ends_with(".internal")
        || lower.ends_with(".lan")
        || lower.ends_with(".home")
        || lower.ends_with(".arpa")
    {
        return true;
    }
    if let Ok(ip) = lower.parse::<std::net::IpAddr>() {
        return is_blocked_ip(ip);
    }
    // Reject numeric/hex/octal IPv4 encodings (e.g. 0x7f000001 or 2130706433)
    if lower.chars().all(|c| c.is_ascii_digit() || c == '.' || c == 'x' || c == 'X') {
        return true;
    }
    // Resolve hostname via system DNS and block if any resolved IP is private/local
    use std::net::ToSocketAddrs;
    if let Ok(addrs) = (lower.as_str(), 80u16).to_socket_addrs() {
        for sock in addrs {
            if is_blocked_ip(sock.ip()) {
                return true;
            }
        }
    }
    false
}

pub(crate) fn safe_ssrf_redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 10 {
            return attempt.error("too many redirects");
        }
        let url = attempt.url();
        if !matches!(url.scheme(), "http" | "https") {
            return attempt.error("redirect to unsupported URL scheme blocked");
        }
        let Some(host) = url.host_str() else {
            return attempt.error("redirect URL missing host");
        };
        if is_blocked_host_or_ip(host) {
            return attempt.error("redirect to private or local network address blocked");
        }
        attempt.follow()
    })
}

fn validate_avatar_url(raw_url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(raw_url.trim())
        .map_err(|e| format!("Invalid avatar URL: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("Only http and https avatar URLs are allowed.".into());
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| "Avatar URL is missing a host.".to_string())?;
    if is_blocked_host_or_ip(host) {
        return Err("Private or local network URLs are not permitted.".into());
    }
    Ok(parsed)
}

fn sanitize_avatar_mime(raw: &str) -> &'static str {
    let base = raw.split(';').next().unwrap_or("").trim().to_ascii_lowercase();
    match base.as_str() {
        "image/png" => "image/png",
        "image/webp" => "image/webp",
        "image/gif" => "image/gif",
        "image/avif" => "image/avif",
        _ => "image/jpeg",
    }
}

#[tauri::command]
pub async fn download_avatar_data_url(
    http: State<'_, crate::commands::metadata::HttpClient>,
    url: String,
) -> Result<String, String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(url);
    }

    let parsed_url = validate_avatar_url(&url)?;

    let resp = http
        .0
        .get(parsed_url)
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

    if let Some(len) = resp.content_length() {
        if len as usize > MAX_AVATAR_BYTES {
            return Err("Avatar image exceeds the 10 MB size limit.".into());
        }
    }

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(sanitize_avatar_mime)
        .unwrap_or("image/jpeg");

    use futures_util::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut bytes = Vec::new();
    while let Some(chunk_res) = stream.next().await {
        let chunk = chunk_res.map_err(|e| format!("Failed to read avatar bytes: {e}"))?;
        if bytes.len() + chunk.len() > MAX_AVATAR_BYTES {
            return Err("Avatar image exceeds the 10 MB size limit.".into());
        }
        bytes.extend_from_slice(&chunk);
    }

    let b64 = base64::prelude::BASE64_STANDARD.encode(&bytes);
    Ok(format!("data:{content_type};base64,{b64}"))
}

#[tauri::command]
pub async fn search_gaming_avatars(
    db: State<'_, Database>,
    http: State<'_, crate::commands::metadata::HttpClient>,
    token_cache: State<'_, crate::commands::metadata::IgdbTokenCache>,
    resolver: State<'_, std::sync::Arc<crate::services::metadata::MetadataProviderResolver>>,
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

    // 1. Match Curated High-Resolution Heroes
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

    // 2. If user is browsing (query empty) and clicked "Load More" past our 48 curated heroes,
    // pull high-resolution (t_720p) top-rated games from the metadata resolver!
    if trimmed.is_empty() && items.len() < limit_val {
        let feed_offset = (offset_val.saturating_sub(24)) as i64;
        if let Ok(feed_games) = resolver.fetch_feed(&db, "top_rated", feed_offset).await {
            for g in feed_games {
                if let Some(cov) = g.cover_url {
                    let hd_url = cov.replace("/t_cover_big/", "/t_720p/");
                    if !items.iter().any(|x| x.name.eq_ignore_ascii_case(&g.name)) {
                        items.push(GamingAvatarItem {
                            id: format!("hub_{}", g.igdb_id),
                            name: g.name,
                            source: "igdb".to_string(),
                            image_url: hd_url.clone(),
                            preview_url: cov,
                            subtitle: g.genres.first().cloned().or_else(|| Some("IGDB HD".into())),
                            tags: g.genres,
                        });
                    }
                }
            }
        }
    }

    // 3. When searching by keyword, query Steam Store HD Portraits & Metadata Resolver in parallel
    if !trimmed.is_empty() && items.len() < limit_val {
        let steam_items = search_steam_store_avatars(&http.0, trimmed).await;
        for s in steam_items {
            if !items.iter().any(|x| x.name.eq_ignore_ascii_case(&s.name)) {
                items.push(s);
            }
        }

        let default_filters = crate::commands::hub::HubSearchFilters::default();
        if let Ok(hub_games) = resolver
            .search_games(&db, trimmed, offset_val as i64, &default_filters)
            .await
        {
            for g in hub_games.into_iter().take(12) {
                if let Some(cov) = g.cover_url {
                    let hd_url = cov.replace("/t_cover_big/", "/t_720p/");
                    if !items.iter().any(|x| x.name.eq_ignore_ascii_case(&g.name)) {
                        items.push(GamingAvatarItem {
                            id: format!("igdb_game_{}", g.igdb_id),
                            name: g.name,
                            source: "igdb".to_string(),
                            image_url: hd_url,
                            preview_url: cov,
                            subtitle: g.genres.first().cloned().or_else(|| Some("IGDB HD".into())),
                            tags: g.genres,
                        });
                    }
                }
            }
        }
    }

    // 4. Query Direct IGDB Characters if custom credentials are configured and query is non-empty
    if !trimmed.is_empty() {
        if let (Some(client_id), Some(secret)) = (igdb_client_id, igdb_client_secret) {
            if let Ok(token) = crate::commands::metadata::igdb::get_access_token(&http.0, &token_cache, &client_id, &secret).await {
                if let Ok(chars) = crate::commands::metadata::igdb::search_characters(
                    &http.0,
                    &client_id,
                    &token,
                    trimmed,
                    offset_val,
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
    }

    // 5. Query SteamGridDB Icons if query is not empty and key is configured
    if let Some(sgdb_key) = steamgriddb_key {
        if !trimmed.is_empty() {
            if let Ok(icons) = crate::commands::metadata::steamgriddb::search_icons(&http.0, &sgdb_key, trimmed).await {
                for icon in icons {
                    if !items.iter().any(|x| x.image_url == icon.url) {
                        items.push(GamingAvatarItem {
                            id: format!("sgdb_{}", icon.id),
                            name: format!("{} Icon", trimmed),
                            source: "steamgriddb".to_string(),
                            image_url: icon.url.clone(),
                            preview_url: icon.url,
                            subtitle: Some("SteamGridDB HD".to_string()),
                            tags: Vec::new(),
                        });
                    }
                }
            }
        }
    }

    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_avatar_url_blocks_ssrf_and_allows_public_https() {
        assert!(validate_avatar_url("https://images.igdb.com/igdb/image/upload/t_thumb/abc.jpg").is_ok());
        assert!(validate_avatar_url("http://127.0.0.1:8080/secret").is_err());
        assert!(validate_avatar_url("http://localhost:3000/avatar.png").is_err());
        assert!(validate_avatar_url("http://169.254.169.254/latest/meta-data").is_err());
        assert!(validate_avatar_url("http://192.168.1.1/admin").is_err());
        assert!(validate_avatar_url("file:///C:/Windows/System32/cmd.exe").is_err());
    }

    #[test]
    fn test_sanitize_avatar_mime_restricts_to_safe_image_types() {
        assert_eq!(sanitize_avatar_mime("image/png; charset=utf-8"), "image/png");
        assert_eq!(sanitize_avatar_mime("image/webp"), "image/webp");
        assert_eq!(sanitize_avatar_mime("text/html"), "image/jpeg");
        assert_eq!(sanitize_avatar_mime("image/svg+xml"), "image/jpeg");
    }
}
