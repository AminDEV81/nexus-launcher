mod artwork;
pub(crate) mod igdb;
pub(crate) mod steam_store;
pub(crate) mod steamgriddb;
mod token_cache;

use crate::commands::hub::{HubGameDetails, HubSearchFilters};
use crate::db::models::Game;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::services::metadata::{MetadataProviderResolver, ProviderMode};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};

pub use steamgriddb::GridOption;
pub use token_cache::IgdbTokenCache;

/// Shared `reqwest::Client` managed as Tauri state so every metadata
/// request (and every background auto-fetch task) reuses the same
/// connection pool instead of paying TLS/connection setup repeatedly.
pub struct HttpClient(pub reqwest::Client);

impl Default for HttpClient {
    fn default() -> Self {
        // Bounded by default: 4s connect timeout ensures offline stalls
        // are detected immediately without freezing app startup.
        Self(
            reqwest::Client::builder()
                .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36")
                .redirect(crate::commands::profiles::safe_ssrf_redirect_policy())
                .connect_timeout(std::time::Duration::from_millis(1500))
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new()),
        )
    }
}

struct Credentials {
    igdb_client_id: Option<String>,
    igdb_client_secret: Option<String>,
    steamgriddb_api_key: Option<String>,
}

/// Pure, synchronous DB read — deliberately called *before* any `await`
/// point in every function below, so the connection mutex is never held
/// across network I/O.
fn get_credentials(db: &Database) -> Credentials {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    // Empty strings count as missing — the Settings UI saves a cleared
    // field as "" rather than deleting the row.
    let read = |key: &str| -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .ok()
        .and_then(|value: String| (!value.trim().is_empty()).then_some(value))
    };

    Credentials {
        igdb_client_id: read("igdb_client_id"),
        igdb_client_secret: read("igdb_client_secret"),
        steamgriddb_api_key: read("steamgriddb_api_key"),
    }
}

fn get_game_lookup_fields(db: &Database, game_id: &str) -> (Option<String>, String) {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let steam_app_id = conn
        .query_row(
            "SELECT steam_app_id FROM games WHERE id = ?1",
            [game_id],
            |row| row.get(0),
        )
        .ok();
    let name = conn
        .query_row("SELECT name FROM games WHERE id = ?1", [game_id], |row| {
            row.get(0)
        })
        .unwrap_or_default();
    (steam_app_id, name)
}

/// Resolves the SteamGridDB game id by name search — only needed when
/// there's no Steam AppID to query `/*/steam/{app_id}` with directly.
async fn resolve_sgdb_game_id(
    http: &reqwest::Client,
    sgdb_key: &str,
    steam_app_id: Option<&str>,
    name: &str,
) -> Option<i64> {
    if steam_app_id.is_some() {
        return None;
    }
    steamgriddb::search_game_id(http, sgdb_key, name)
        .await
        .ok()
        .flatten()
}

// ---------------------------------------------------------------------
// IGDB: text metadata only (description, genres, developer/publisher,
// release date, critic score, trailer, and a screenshot gallery for
// Epic 8's details panel). Deliberately does NOT touch `cover_path` any
// more — SteamGridDB is the sole cover source now (see below), both for
// the automatic pipeline and the manual picker.
// ---------------------------------------------------------------------

const MAX_SCREENSHOTS: usize = 8;

async fn apply_igdb_text_metadata(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    token_cache: &IgdbTokenCache,
    game_id: &str,
    igdb_id: i64,
) -> AppResult<()> {
    let credentials = get_credentials(db);
    let (Some(client_id), Some(client_secret)) =
        (credentials.igdb_client_id, credentials.igdb_client_secret)
    else {
        return Err(AppError::Invalid(
            "IGDB Client ID/Secret are not configured in Settings.".into(),
        ));
    };

    let token = igdb::get_access_token(http, token_cache, &client_id, &client_secret).await?;
    let details = igdb::get_game_details(http, &client_id, &token, igdb_id).await?;

    // Screenshot gallery: downloaded into the artwork cache dir and
    // recorded in `artwork_cache` (kind='screenshot', one row per
    // ordinal) rather than a single `background_path` column, since
    // Epic 8's details panel shows a whole gallery, not just one image.
    // `background_path` is kept in sync with the first one for anything
    // that only wants a single hero-style background image.
    let mut background_path = None;
    let mut screenshot_paths: Vec<(i64, String, String)> = Vec::new();
    for (ordinal, image_id) in details
        .screenshot_image_ids
        .iter()
        .take(MAX_SCREENSHOTS)
        .enumerate()
    {
        let url = igdb::cover_image_url(image_id, "1080p");
        let file_stem = format!("screenshot-{ordinal}");
        if let Ok(path) = artwork::download_artwork(http, app, game_id, &file_stem, &url, false).await {
            if ordinal == 0 {
                background_path = Some(path.clone());
            }
            screenshot_paths.push((ordinal as i64, path, url));
        }
    }

    let genres_json = serde_json::to_string(&details.genres).unwrap_or_else(|_| "[]".into());
    let platforms_json = serde_json::to_string(&details.platforms).unwrap_or_else(|_| "[]".into());
    let resolved_scores = crate::services::scores::resolve_critic_scores_live(
        db,
        http,
        &details.name,
        details.release_date.as_deref(),
        None,
        None,
        details.critic_score,
    )
    .await;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE games SET
            description = COALESCE(?1, description),
            developer = COALESCE(?2, developer),
            publisher = COALESCE(?3, publisher),
            release_date = COALESCE(?4, release_date),
            genres = ?5,
            platforms = ?6,
            trailer_url = COALESCE(?7, trailer_url),
            background_path = COALESCE(?8, background_path),
            igdb_id = ?9,
            metacritic_score = COALESCE(?10, metacritic_score),
            opencritic_score = COALESCE(?11, opencritic_score)
         WHERE id = ?12",
        rusqlite::params![
            details.description,
            details.developer,
            details.publisher,
            details.release_date,
            genres_json,
            platforms_json,
            details.trailer_url,
            background_path,
            igdb_id,
            resolved_scores.metacritic,
            resolved_scores.opencritic,
            game_id,
        ],
    )?;

    for (ordinal, path, url) in screenshot_paths {
        conn.execute(
            "INSERT INTO artwork_cache (game_id, kind, ordinal, local_path, source_url, is_custom)
             VALUES (?1, 'screenshot', ?2, ?3, ?4, 0)
             ON CONFLICT (game_id, kind, ordinal)
             DO UPDATE SET local_path = excluded.local_path, source_url = excluded.source_url",
            rusqlite::params![game_id, ordinal, path, url],
        )?;
    }

    Ok(())
}

// Threads the shared app state plus IGDB credentials through to the
// fetch; a parameter object would just restate these same fields.
#[allow(clippy::too_many_arguments)]
async fn auto_fetch_igdb_text(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    token_cache: &IgdbTokenCache,
    client_id: &str,
    client_secret: &str,
    game_id: &str,
    game_name: &str,
) -> bool {
    let Ok(token) = igdb::get_access_token(http, token_cache, client_id, client_secret).await
    else {
        return false;
    };
    let Ok(results) = igdb::search(http, client_id, &token, game_name).await else {
        return false;
    };
    let Some(best_match) = results.into_iter().next() else {
        return false;
    };

    apply_igdb_text_metadata(app, db, http, token_cache, game_id, best_match.igdb_id)
        .await
        .is_ok()
}

// ---------------------------------------------------------------------
// Steam Store: the same text metadata IGDB provides — description,
// genres, developer/publisher, release date, Metacritic score, and
// screenshots — but for any game with a `steam_app_id`, entirely
// without an API key. Runs *after* IGDB in `auto_fetch_one` below and
// only ever fills gaps (`COALESCE(existing, new)`) rather than
// overwriting — IGDB's match, when configured, stays authoritative;
// Steam Store just fills in whatever it didn't have, and is the sole
// source for anyone without an IGDB key at all.
// ---------------------------------------------------------------------

async fn auto_fetch_steam_store_text(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    game_id: &str,
    steam_app_id: &str,
) -> bool {
    let Ok(Some(details)) = steam_store::get_app_details(http, steam_app_id).await else {
        return false;
    };

    let already_has_screenshots: bool = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM artwork_cache WHERE game_id = ?1 AND kind = 'screenshot')",
            [game_id],
            |row| row.get(0),
        )
        .unwrap_or(false)
    };

    let mut screenshot_paths: Vec<(i64, String, String)> = Vec::new();
    if !already_has_screenshots {
        for (ordinal, url) in details
            .screenshot_urls
            .iter()
            .take(MAX_SCREENSHOTS)
            .enumerate()
        {
            let file_stem = format!("screenshot-{ordinal}");
            if let Ok(path) = artwork::download_artwork(http, app, game_id, &file_stem, url, false).await {
                screenshot_paths.push((ordinal as i64, path, url.clone()));
            }
        }
    }

    let genres_json = serde_json::to_string(&details.genres).unwrap_or_else(|_| "[]".into());
    let (_, game_name) = get_game_lookup_fields(db, game_id);
    let resolved_scores = crate::services::scores::resolve_critic_scores_live(
        db,
        http,
        &game_name,
        details.release_date.as_deref(),
        details.metacritic_score,
        None,
        None,
    )
    .await;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let changed = conn
        .execute(
            "UPDATE games SET
                description = COALESCE(description, ?1),
                developer = COALESCE(developer, ?2),
                publisher = COALESCE(publisher, ?3),
                release_date = COALESCE(release_date, ?4),
                genres = CASE WHEN genres = '[]' THEN ?5 ELSE genres END,
                metacritic_score = COALESCE(?6, metacritic_score),
                opencritic_score = COALESCE(?7, opencritic_score)
             WHERE id = ?8",
            rusqlite::params![
                details.description,
                details.developer,
                details.publisher,
                details.release_date,
                genres_json,
                resolved_scores.metacritic.or(details.metacritic_score),
                resolved_scores.opencritic,
                game_id,
            ],
        )
        .unwrap_or(0);

    for (ordinal, path, url) in &screenshot_paths {
        conn.execute(
            "INSERT INTO artwork_cache (game_id, kind, ordinal, local_path, source_url, is_custom)
             VALUES (?1, 'screenshot', ?2, ?3, ?4, 0)
             ON CONFLICT (game_id, kind, ordinal)
             DO UPDATE SET local_path = excluded.local_path, source_url = excluded.source_url",
            rusqlite::params![game_id, ordinal, path, url],
        )
        .ok();
    }

    changed > 0 || !screenshot_paths.is_empty()
}

/// Automatic default cover + banner + logo right after a game is
/// added. Prefers a *static* cover for this automatic pick — Live
/// Covers are opt-in via the manual picker rather than something that
/// can surprise-appear because a game's top SteamGridDB result happens
/// to be animated.
async fn auto_fetch_steamgriddb_artwork(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    sgdb_key: &str,
    game_id: &str,
    game_name: &str,
) -> bool {
    let (steam_app_id, _) = get_game_lookup_fields(db, game_id);
    let sgdb_game_id =
        resolve_sgdb_game_id(http, sgdb_key, steam_app_id.as_deref(), game_name).await;

    if steam_app_id.is_none() && sgdb_game_id.is_none() {
        return false;
    }

    let mut cover_path = None;
    let mut cover_is_animated = false;
    if let Ok(options) =
        steamgriddb::search_grid_options(http, sgdb_key, steam_app_id.as_deref(), sgdb_game_id)
            .await
    {
        let chosen = options
            .iter()
            .find(|option| !option.is_animated)
            .or_else(|| options.first());
        if let Some(option) = chosen {
            if let Ok(path) =
                artwork::download_artwork(http, app, game_id, "cover", &option.url, false).await
            {
                cover_path = Some(path);
                cover_is_animated = option.is_animated;
            }
        }
    }

    let mut banner_path = None;
    if let Ok(Some(url)) = steamgriddb::get_artwork_url(
        http,
        sgdb_key,
        steamgriddb::ArtworkKind::Hero,
        steam_app_id.as_deref(),
        sgdb_game_id,
    )
    .await
    {
        banner_path = artwork::download_artwork(http, app, game_id, "banner", &url, false)
            .await
            .ok();
    }

    let mut logo_path = None;
    if let Ok(Some(url)) = steamgriddb::get_artwork_url(
        http,
        sgdb_key,
        steamgriddb::ArtworkKind::Logo,
        steam_app_id.as_deref(),
        sgdb_game_id,
    )
    .await
    {
        logo_path = artwork::download_artwork(http, app, game_id, "logo", &url, false)
            .await
            .ok();
    }

    if cover_path.is_none() && banner_path.is_none() && logo_path.is_none() {
        return false;
    }

    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE games SET
                cover_path = COALESCE(?1, cover_path),
                cover_is_animated = CASE WHEN ?1 IS NOT NULL THEN ?2 ELSE cover_is_animated END,
                banner_path = COALESCE(?3, banner_path),
                logo_path = COALESCE(?4, logo_path)
             WHERE id = ?5",
            rusqlite::params![
                cover_path,
                cover_is_animated,
                banner_path,
                logo_path,
                game_id
            ],
        )
        .ok();
    }

    fetch_steamgriddb_screenshot_fallback(
        app,
        db,
        http,
        sgdb_key,
        game_id,
        steam_app_id.as_deref(),
        sgdb_game_id,
    )
    .await;

    true
}

/// SteamGridDB has no real "screenshots" concept — this fills the
/// details panel's screenshot gallery with hero artwork instead, but
/// only when the game doesn't already have real screenshots from IGDB.
/// IGDB screenshots always win when both sources are configured; this
/// is strictly a fallback for "no IGDB key" or "IGDB has none for this
/// title", not a second gallery stacked on top of the first.
async fn fetch_steamgriddb_screenshot_fallback(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    sgdb_key: &str,
    game_id: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) {
    const MAX_FALLBACK_SCREENSHOTS: usize = 5;

    let already_has_screenshots: bool = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM artwork_cache WHERE game_id = ?1 AND kind = 'screenshot')",
            [game_id],
            |row| row.get(0),
        )
        .unwrap_or(false)
    };
    if already_has_screenshots {
        return;
    }

    let Ok(hero_urls) =
        steamgriddb::list_hero_urls(http, sgdb_key, steam_app_id, sgdb_game_id).await
    else {
        return;
    };

    let mut saved: Vec<(i64, String, String)> = Vec::new();
    for (ordinal, url) in hero_urls.iter().take(MAX_FALLBACK_SCREENSHOTS).enumerate() {
        let file_stem = format!("screenshot-{ordinal}");
        if let Ok(path) = artwork::download_artwork(http, app, game_id, &file_stem, url, false).await {
            saved.push((ordinal as i64, path, url.clone()));
        }
    }
    if saved.is_empty() {
        return;
    }

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    for (ordinal, path, url) in saved {
        conn.execute(
            "INSERT INTO artwork_cache (game_id, kind, ordinal, local_path, source_url, is_custom)
             VALUES (?1, 'screenshot', ?2, ?3, ?4, 0)
             ON CONFLICT (game_id, kind, ordinal)
             DO UPDATE SET local_path = excluded.local_path, source_url = excluded.source_url",
            rusqlite::params![game_id, ordinal, path, url],
        )
        .ok();
    }
}

// ---------------------------------------------------------------------
// Background orchestration
// ---------------------------------------------------------------------

/// Fire-and-forget: called from `commands::games::create_game` and
/// `commands::scan::import_scanned_games` via `tauri::async_runtime::spawn`
/// right after a game is inserted. Never surfaces an error to the user —
/// this is a background enhancement layered on top of a library entry
/// that already exists and works without it. IGDB, Steam Store, and
/// SteamGridDB are each entirely optional and independent: having only
/// one (or none) configured/available is a completely normal, silent
/// no-op for the others.
fn upgrade_cover_url_to_highres(raw: &str) -> String {
    raw.replace("/t_cover_big/", "/t_1080p/")
        .replace("/t_720p/", "/t_1080p/")
        .replace("/library_600x900.jpg", "/library_600x900_2x.jpg")
}

/// Automatically resolves Steam AppID (if missing) and fetches high-resolution
/// Cover (`library_600x900_2x.jpg` / `t_1080p`), Sidebar Hero Banner (`library_hero.jpg`),
/// and Official Transparent Game Logo (`logo.png`) across Steam CDN + SteamGridDB / Nexus Cloud.
async fn auto_fetch_highres_artwork_and_logo(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    resolver: &MetadataProviderResolver,
    game_id: &str,
    game_name: &str,
    fallback_cover_url: Option<&str>,
) -> bool {
    let (mut steam_app_id, existing_cover, existing_banner, existing_logo) = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let row_opt = conn
            .query_row(
                "SELECT steam_app_id, cover_path, banner_path, logo_path FROM games WHERE id = ?1",
                [game_id],
                |row| {
                    Ok((
                        row.get::<_, Option<String>>(0)?,
                        row.get::<_, Option<String>>(1)?,
                        row.get::<_, Option<String>>(2)?,
                        row.get::<_, Option<String>>(3)?,
                    ))
                },
            )
            .ok();
        match row_opt {
            Some(r) => r,
            None => return false,
        }
    };

    if steam_app_id.as_deref().map(str::trim).filter(|s| !s.is_empty()).is_none() {
        let steam_provider = crate::services::providers::SteamArtworkProvider::new(http.clone());
        if let Some(resolved_aid) = steam_provider.resolve_app_id(game_name).await {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            conn.execute(
                "UPDATE games SET steam_app_id = COALESCE(steam_app_id, ?1) WHERE id = ?2",
                rusqlite::params![&resolved_aid, game_id],
            )
            .ok();
            steam_app_id = Some(resolved_aid);
        }
    }

    let need_cover = existing_cover.is_none();
    let need_banner = existing_banner.is_none();
    let need_logo = existing_logo.is_none();

    if !need_cover && !need_banner && !need_logo {
        return false;
    }

    let aid_ref = steam_app_id.as_deref();
    let (cover_opts, hero_opts, logo_opts) = tokio::join!(
        async {
            if need_cover {
                resolver
                    .get_artwork_options(db, "cover", aid_ref, game_name)
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if need_banner {
                resolver
                    .get_artwork_options(db, "hero", aid_ref, game_name)
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if need_logo {
                resolver
                    .get_artwork_options(db, "logo", aid_ref, game_name)
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        }
    );

    let mut updated = false;

    if need_cover {
        let mut downloaded_cover: Option<(String, String, bool)> = None;
        for opt in cover_opts.iter().filter(|o| !o.is_animated).chain(cover_opts.iter()) {
            let hi_url = upgrade_cover_url_to_highres(&opt.url);
            if let Ok(path) = artwork::download_artwork(http, app, game_id, "cover", &hi_url, false).await {
                downloaded_cover = Some((path, hi_url, opt.is_animated));
                break;
            }
        }
        if downloaded_cover.is_none() {
            if let Some(fb_url) = fallback_cover_url {
                let hi_fb = upgrade_cover_url_to_highres(fb_url);
                if let Ok(path) = artwork::download_artwork(http, app, game_id, "cover", &hi_fb, false).await {
                    downloaded_cover = Some((path, hi_fb, false));
                } else if hi_fb != fb_url {
                    if let Ok(path) = artwork::download_artwork(http, app, game_id, "cover", fb_url, false).await {
                        downloaded_cover = Some((path, fb_url.to_string(), false));
                    }
                }
            }
        }
        if let Some((path, url, is_anim)) = downloaded_cover {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            conn.execute(
                "UPDATE games SET cover_path = ?1, cover_is_animated = ?2 WHERE id = ?3",
                rusqlite::params![&path, is_anim, game_id],
            )
            .ok();
            artwork::record_artwork_cache(&conn, game_id, "cover", &path, Some(&url), false).ok();
            updated = true;
        }
    }

    if need_banner {
        for opt in &hero_opts {
            if let Ok(path) = artwork::download_artwork(http, app, game_id, "banner", &opt.url, false).await {
                let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
                conn.execute(
                    "UPDATE games SET banner_path = ?1 WHERE id = ?2",
                    rusqlite::params![&path, game_id],
                )
                .ok();
                artwork::record_artwork_cache(&conn, game_id, "banner", &path, Some(&opt.url), false).ok();
                updated = true;
                break;
            }
        }
    }

    if need_logo {
        for opt in &logo_opts {
            if let Ok(path) = artwork::download_artwork(http, app, game_id, "logo", &opt.url, false).await {
                let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
                conn.execute(
                    "UPDATE games SET logo_path = ?1 WHERE id = ?2",
                    rusqlite::params![&path, game_id],
                )
                .ok();
                artwork::record_artwork_cache(&conn, game_id, "logo", &path, Some(&opt.url), false).ok();
                updated = true;
                break;
            }
        }
    }

    updated
}

async fn auto_fetch_one(app: &AppHandle, game_id: &str, game_name: &str) {
    let db = app.state::<Database>();
    let http = app.state::<HttpClient>();
    let token_cache = app.state::<IgdbTokenCache>();
    let resolver = app.state::<Arc<MetadataProviderResolver>>();
    let credentials = get_credentials(&db);

    let mut updated = false;
    let mut igdb_cover_fallback: Option<String> = None;

    // 1. Automatic full IGDB / Nexus Cloud metadata sync (same pipeline as manual Sync button)
    let existing_igdb_id: Option<i64> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT igdb_id FROM games WHERE id = ?1",
            [game_id],
            |row| row.get(0),
        )
        .ok()
        .flatten()
    };

    let target_igdb_id = match existing_igdb_id {
        Some(id) if id > 0 => Some(id),
        _ => {
            if let Ok(candidates) = resolver
                .search_games(&db, game_name, 0, &HubSearchFilters::default())
                .await
            {
                candidates.into_iter().next().map(|g| g.igdb_id)
            } else {
                None
            }
        }
    };

    if let Some(igdb_id) = target_igdb_id {
        if let Ok(Some(details)) = resolver.get_game_details(&db, igdb_id).await {
            igdb_cover_fallback = details.game.cover_url.clone();
            if apply_hub_details_to_game(app, &db, &http.0, game_id, &details)
                .await
                .is_ok()
            {
                updated = true;
            }
        }
    }

    if !updated {
        if let (Some(client_id), Some(client_secret)) =
            (&credentials.igdb_client_id, &credentials.igdb_client_secret)
        {
            updated |= auto_fetch_igdb_text(
                app,
                &db,
                &http.0,
                &token_cache,
                client_id,
                client_secret,
                game_id,
                game_name,
            )
            .await;
        }
    }

    // 2. High-res Cover, Hero Banner, and Official Transparent Game Logo
    updated |= auto_fetch_highres_artwork_and_logo(
        app,
        &db,
        &http.0,
        &resolver,
        game_id,
        game_name,
        igdb_cover_fallback.as_deref(),
    )
    .await;

    // 3. Steam Store gap-fill (screenshots, developer/publisher, description)
    let (steam_app_id, _) = get_game_lookup_fields(&db, game_id);
    if let Some(steam_app_id) = &steam_app_id {
        updated |= auto_fetch_steam_store_text(app, &db, &http.0, game_id, steam_app_id).await;
    }

    if let Some(sgdb_key) = &credentials.steamgriddb_api_key {
        updated |=
            auto_fetch_steamgriddb_artwork(app, &db, &http.0, sgdb_key, game_id, game_name).await;
    }

    // 4. Ensure Metacritic & OpenCritic scores are always resolved and persisted
    let release_date_opt: Option<String> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT release_date FROM games WHERE id = ?1",
            [game_id],
            |row| row.get(0),
        )
        .ok()
        .flatten()
    };
    let live_scores = crate::services::scores::resolve_critic_scores_live(
        &db,
        &http.0,
        game_name,
        release_date_opt.as_deref(),
        None,
        None,
        None,
    )
    .await;
    if live_scores.metacritic.is_some() || live_scores.opencritic.is_some() {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let changed = conn
            .execute(
                "UPDATE games SET
                    metacritic_score = COALESCE(metacritic_score, ?1),
                    opencritic_score = COALESCE(opencritic_score, ?2)
                 WHERE id = ?3",
                rusqlite::params![live_scores.metacritic, live_scores.opencritic, game_id],
            )
            .unwrap_or(0);
        if changed > 0 {
            updated = true;
        }
    }

    if updated {
        let _ = app.emit("metadata-updated", game_id);
    }
}

/// Runs `auto_fetch_one` for several newly-added games one at a time,
/// with a short pause in between, rather than firing them all
/// concurrently — the "respect rate limits" requirement from a bulk
/// import (Epic 5's scan can add many games in one go).
pub fn spawn_auto_fetch_queue(app: AppHandle, games: Vec<(String, String)>) {
    tauri::async_runtime::spawn(async move {
        for (game_id, game_name) in games {
            auto_fetch_one(&app, &game_id, &game_name).await;
            tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        }
    });
}

pub fn spawn_auto_fetch_one(app: AppHandle, game_id: String, game_name: String) {
    tauri::async_runtime::spawn(async move {
        auto_fetch_one(&app, &game_id, &game_name).await;
    });
}

/// Game Hub variant of the background fetch: the IGDB match is already
/// known exactly (no name search to guess) and text metadata was written
/// at insert time by `commands::hub::add_game_from_hub`, so this only
/// fills artwork — the same SteamGridDB-first pipeline a manually-added
/// game gets (static cover preference, banner, logo, hero-shot gallery
/// fallback), with IGDB's own cover as the final fallback so a hub entry
/// never sits coverless even when SteamGridDB isn't configured.
pub fn spawn_hub_artwork_fetch(
    app: AppHandle,
    game_id: String,
    game_name: String,
    igdb_cover_url: Option<String>,
) {
    tauri::async_runtime::spawn(async move {
        let db = app.state::<Database>();
        let http = app.state::<HttpClient>();
        let resolver = app.state::<Arc<MetadataProviderResolver>>();
        let credentials = get_credentials(&db);

        let mut updated = false;

        updated |= auto_fetch_highres_artwork_and_logo(
            &app,
            &db,
            &http.0,
            &resolver,
            &game_id,
            &game_name,
            igdb_cover_url.as_deref(),
        )
        .await;

        if let Some(sgdb_key) = &credentials.steamgriddb_api_key {
            updated |=
                auto_fetch_steamgriddb_artwork(&app, &db, &http.0, sgdb_key, &game_id, &game_name)
                    .await;
        }

        if let Some(url) = igdb_cover_url {
            let has_cover: Option<String> = {
                let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
                conn.query_row(
                    "SELECT cover_path FROM games WHERE id = ?1",
                    [&game_id],
                    |row| row.get(0),
                )
                .ok()
                .flatten()
            };
            if has_cover.is_none() {
                if let Ok(path) =
                    artwork::download_artwork(&http.0, &app, &game_id, "cover", &url, false).await
                {
                    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
                    conn.execute(
                        "UPDATE games SET cover_path = ?1, cover_is_animated = 0 WHERE id = ?2",
                        rusqlite::params![path, game_id],
                    )
                    .ok();
                    artwork::record_artwork_cache(
                        &conn,
                        &game_id,
                        "cover",
                        &path,
                        Some(&url),
                        false,
                    )
                    .ok();
                    updated = true;
                }
            }
        }

        if updated {
            let _ = app.emit("metadata-updated", game_id);
        }
    });
}

// ---------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------

pub(crate) async fn apply_hub_details_to_game(
    app: &AppHandle,
    db: &Database,
    http: &reqwest::Client,
    game_id: &str,
    details: &HubGameDetails,
) -> AppResult<()> {
    let mut background_path = None;
    let mut screenshot_paths: Vec<(i64, String, String)> = Vec::new();
    for (ordinal, url) in details
        .screenshot_urls
        .iter()
        .take(MAX_SCREENSHOTS)
        .enumerate()
    {
        let file_stem = format!("screenshot-{ordinal}");
        if let Ok(path) = artwork::download_artwork(http, app, game_id, &file_stem, url, false).await {
            if ordinal == 0 {
                background_path = Some(path.clone());
            }
            screenshot_paths.push((ordinal as i64, path, url.clone()));
        }
    }

    let genres_json = serde_json::to_string(&details.game.genres).unwrap_or_else(|_| "[]".into());
    let platforms_json = serde_json::to_string(&details.game.platforms).unwrap_or_else(|_| "[]".into());
    let resolved_scores = crate::services::scores::resolve_critic_scores_live(
        db,
        http,
        &details.game.name,
        details.game.release_date.as_deref(),
        details.metacritic_score.or(details.game.metacritic_score),
        details.opencritic_score.or(details.game.opencritic_score),
        details.game.rating,
    )
    .await;

    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE games SET
                description = COALESCE(?1, description),
                developer = COALESCE(?2, developer),
                publisher = COALESCE(?3, publisher),
                release_date = COALESCE(?4, release_date),
                genres = ?5,
                platforms = ?6,
                trailer_url = COALESCE(?7, trailer_url),
                background_path = COALESCE(?8, background_path),
                igdb_id = COALESCE(?9, igdb_id),
                metacritic_score = COALESCE(?10, metacritic_score),
                opencritic_score = COALESCE(?11, opencritic_score)
             WHERE id = ?12",
            rusqlite::params![
                details.game.summary,
                details.developer,
                details.publisher,
                details.game.release_date,
                genres_json,
                platforms_json,
                details.trailer_url,
                background_path,
                details.game.igdb_id,
                resolved_scores.metacritic,
                resolved_scores.opencritic,
                game_id,
            ],
        )?;

        for (ordinal, path, url) in screenshot_paths {
            conn.execute(
                "INSERT INTO artwork_cache (game_id, kind, ordinal, local_path, source_url, is_custom)
                 VALUES (?1, 'screenshot', ?2, ?3, ?4, 0)
                 ON CONFLICT (game_id, kind, ordinal)
                 DO UPDATE SET local_path = excluded.local_path, source_url = excluded.source_url",
                rusqlite::params![game_id, ordinal, path, url],
            )?;
        }
    }

    if let Some(ref aid) = details.steam_app_id {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE games SET steam_app_id = COALESCE(steam_app_id, ?1) WHERE id = ?2",
            rusqlite::params![aid, game_id],
        )
        .ok();
    }

    let resolver = app.state::<Arc<MetadataProviderResolver>>();
    let _ = auto_fetch_highres_artwork_and_logo(
        app,
        db,
        http,
        &resolver,
        game_id,
        &details.game.name,
        details.game.cover_url.as_deref(),
    )
    .await;

    // Fallback banner from first 1080p screenshot if banner_path is still None
    if let Some(ref bg) = background_path {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE games SET banner_path = COALESCE(banner_path, ?1) WHERE id = ?2",
            rusqlite::params![bg, game_id],
        )
        .ok();
    }

    Ok(())
}

/// Manual search, for a future "fix wrong match" UI (Epic 8) — the
/// automatic pipeline above always takes the top result itself.
#[tauri::command]
pub async fn search_metadata_candidates(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    query: String,
) -> AppResult<Vec<igdb::IgdbSearchResult>> {
    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        let results = resolver
            .search_games(&db, &query, 0, &HubSearchFilters::default())
            .await?;
        return Ok(results
            .into_iter()
            .map(|g| {
                let release_year = g
                    .release_date
                    .as_deref()
                    .and_then(|d| d.split('-').next())
                    .and_then(|y| y.parse::<i32>().ok());
                igdb::IgdbSearchResult {
                    igdb_id: g.igdb_id,
                    name: g.name,
                    release_year,
                    cover_url: g.cover_url,
                }
            })
            .collect());
    }

    let credentials = get_credentials(&db);
    let (Some(client_id), Some(client_secret)) =
        (credentials.igdb_client_id, credentials.igdb_client_secret)
    else {
        return Err(AppError::Invalid(
            "Add your IGDB Client ID and Secret in Settings first.".into(),
        ));
    };

    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;
    igdb::search(&http.0, &client_id, &token, &query).await
}

/// Applies a specific IGDB match chosen by the user (or re-applies the
/// pipeline on demand) and returns the freshly updated game.
#[tauri::command]
pub async fn apply_metadata(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    game_id: String,
    igdb_id: i64,
) -> AppResult<Game> {
    if let Ok(Some(details)) = resolver.get_game_details(&db, igdb_id).await {
        apply_hub_details_to_game(&app, &db, &http.0, &game_id, &details).await?;
    } else {
        apply_igdb_text_metadata(&app, &db, &http.0, &token_cache, &game_id, igdb_id).await?;
    }

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

/// Fetches fresh metadata from IGDB for a specific game and updates the database.
/// Seamlessly works in both Nexus Cloud mode (no keys required) and Custom API mode.
#[tauri::command]
pub async fn sync_game_metadata(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    _token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    game_id: String,
) -> AppResult<Game> {
    let (igdb_id_opt, name) = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT igdb_id, name FROM games WHERE id = ?1",
            rusqlite::params![game_id],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, String>(1)?)),
        )?
    };

    let resolved_igdb_id = match igdb_id_opt {
        Some(id) if id > 0 => id,
        _ => {
            let candidates = resolver
                .search_games(&db, &name, 0, &HubSearchFilters::default())
                .await?;
            let best = candidates.into_iter().next().ok_or_else(|| {
                AppError::NotFound(format!("No matching game found for '{name}'"))
            })?;
            best.igdb_id
        }
    };

    let details = resolver
        .get_game_details(&db, resolved_igdb_id)
        .await?
        .ok_or_else(|| AppError::NotFound(format!("Details not found for game id {resolved_igdb_id}")))?;

    apply_hub_details_to_game(&app, &db, &http.0, &game_id, &details).await?;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    let _ = app.emit("metadata-updated", &game_id);
    Ok(game)
}

/// Syncs all wishlist games with fresh IGDB metadata (release dates, genres, descriptions, scores).
/// Seamlessly works in both Nexus Cloud mode (no keys required) and Custom API mode.
#[tauri::command]
pub async fn sync_wishlist_metadata(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    _token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<Game>> {
    let games_to_sync: Vec<(String, String, Option<i64>)> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare(
            "SELECT id, name, igdb_id FROM games
             WHERE is_wishlist = 1 OR (release_date IS NOT NULL AND release_date >= date('now') AND is_installed = 0)",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<i64>>(2)?,
            ))
        })?;
        rows.filter_map(Result::ok).collect()
    };

    for (game_id, name, igdb_id_opt) in &games_to_sync {
        let resolved_id = match *igdb_id_opt {
            Some(id) if id > 0 => Some(id),
            _ => {
                if let Ok(results) = resolver
                    .search_games(&db, name, 0, &HubSearchFilters::default())
                    .await
                {
                    results.into_iter().next().map(|m| m.igdb_id)
                } else {
                    None
                }
            }
        };

        if let Some(igdb_id) = resolved_id {
            if let Ok(Some(details)) = resolver.get_game_details(&db, igdb_id).await {
                let _ = apply_hub_details_to_game(&app, &db, &http.0, game_id, &details).await;
            }
        }

        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let sql = format!(
        "SELECT {} FROM games WHERE is_wishlist = 1 OR (release_date IS NOT NULL AND release_date >= date('now') AND is_installed = 0)",
        Game::SELECT_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let updated_games = stmt.query_map([], Game::from_row)?.filter_map(Result::ok).collect();
    let _ = app.emit("wishlist-metadata-synced", ());
    Ok(updated_games)
}

/// Every cover SteamGridDB has for this game (static + Live Covers
/// alike) — the manual "Change Cover" picker's data source. The
/// frontend pages through the full list 10 at a time rather than this
/// command taking a page number, since SteamGridDB's grid endpoints
/// don't paginate server-side and the full list is rarely large enough
/// for that to matter.
#[tauri::command]
pub async fn search_cover_options(
    db: State<'_, Database>,
    resolver: State<'_, std::sync::Arc<crate::services::metadata::MetadataProviderResolver>>,
    game_id: String,
) -> AppResult<Vec<GridOption>> {
    let (steam_app_id, name) = get_game_lookup_fields(&db, &game_id);
    let options = resolver
        .get_artwork_options(&db, "cover", steam_app_id.as_deref(), &name)
        .await?;

    if options.is_empty() {
        return Err(AppError::NotFound(
            "No covers found for this game.".into(),
        ));
    }

    Ok(options.into_iter().map(|opt| opt.to_grid_option()).collect())
}

/// Downloads and applies a specific cover the user picked from
/// `search_cover_options`'s results.
#[tauri::command]
pub async fn apply_cover(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    game_id: String,
    url: String,
    is_animated: bool,
    allow_large: Option<bool>,
) -> AppResult<Game> {
    let cover_path = artwork::download_artwork(
        &http.0,
        &app,
        &game_id,
        "cover",
        &url,
        allow_large.unwrap_or(false),
    )
    .await?;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE games SET cover_path = ?1, cover_is_animated = ?2 WHERE id = ?3",
        rusqlite::params![cover_path, is_animated, game_id],
    )?;
    artwork::record_artwork_cache(&conn, &game_id, "cover", &cover_path, Some(&url), false)?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

/// Applies a cover image the user picked from their own computer via
/// the native file dialog — the "manual" option in the cover picker,
/// alongside SteamGridDB's suggestions. A plain filesystem copy, no
/// network involved. `is_animated` is guessed from the extension
/// (`.gif`/`.webp` can be animated); it's a best-effort label for the
/// "Live Cover" badge, not a guarantee the specific file actually
/// animates.
#[tauri::command]
pub fn apply_custom_cover(
    app: AppHandle,
    db: State<'_, Database>,
    game_id: String,
    file_path: String,
) -> AppResult<Game> {
    let is_animated = file_path
        .rsplit('.')
        .next()
        .map(|ext| ext.eq_ignore_ascii_case("gif") || ext.eq_ignore_ascii_case("webp"))
        .unwrap_or(false);

    let cover_path = artwork::copy_local_artwork(&app, &game_id, "cover", &file_path)?;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE games SET cover_path = ?1, cover_is_animated = ?2 WHERE id = ?3",
        rusqlite::params![cover_path, is_animated, game_id],
    )?;
    artwork::record_artwork_cache(&conn, &game_id, "cover", &cover_path, None, true)?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

/// Every hero/banner SteamGridDB has for this game — the "Change
/// Banner" picker's data source, mirroring `search_cover_options`
/// exactly except for the `heroes` endpoint.
#[tauri::command]
pub async fn search_banner_options(
    db: State<'_, Database>,
    resolver: State<'_, std::sync::Arc<crate::services::metadata::MetadataProviderResolver>>,
    game_id: String,
) -> AppResult<Vec<GridOption>> {
    let (steam_app_id, name) = get_game_lookup_fields(&db, &game_id);
    let options = resolver
        .get_artwork_options(&db, "hero", steam_app_id.as_deref(), &name)
        .await?;

    if options.is_empty() {
        return Err(AppError::NotFound(
            "No banners found for this game.".into(),
        ));
    }

    Ok(options.into_iter().map(|opt| opt.to_grid_option()).collect())
}

#[tauri::command]
pub async fn search_logo_options(
    db: State<'_, Database>,
    resolver: State<'_, std::sync::Arc<crate::services::metadata::MetadataProviderResolver>>,
    game_id: String,
) -> AppResult<Vec<GridOption>> {
    let (steam_app_id, name) = get_game_lookup_fields(&db, &game_id);
    let options = resolver
        .get_artwork_options(&db, "logo", steam_app_id.as_deref(), &name)
        .await?;

    if options.is_empty() {
        return Err(AppError::NotFound(
            "No logos found for this game.".into(),
        ));
    }

    Ok(options.into_iter().map(|opt| opt.to_grid_option()).collect())
}

#[tauri::command]
pub async fn apply_logo(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    game_id: String,
    url: String,
    allow_large: Option<bool>,
) -> AppResult<Game> {
    let logo_path = artwork::download_artwork(
        &http.0,
        &app,
        &game_id,
        "logo",
        &url,
        allow_large.unwrap_or(false),
    )
    .await?;
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE games SET logo_path = ?1 WHERE id = ?2",
        rusqlite::params![logo_path, game_id],
    )?;
    artwork::record_artwork_cache(&conn, &game_id, "logo", &logo_path, Some(&url), false)?;
    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    Ok(conn.query_row(&sql, [&game_id], Game::from_row)?)
}

/// Downloads and applies a specific banner the user picked from
/// `search_banner_options`'s results. No `banner_is_animated` column is
/// needed the way covers have one: the details panel's hero always
/// renders through `CoverMedia`, which already tells video from image
/// apart by file extension/mime on its own.
#[tauri::command]
pub async fn apply_banner(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    game_id: String,
    url: String,
    allow_large: Option<bool>,
) -> AppResult<Game> {
    let banner_path = artwork::download_artwork(
        &http.0,
        &app,
        &game_id,
        "banner",
        &url,
        allow_large.unwrap_or(false),
    )
    .await?;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE games SET banner_path = ?1 WHERE id = ?2",
        rusqlite::params![banner_path, game_id],
    )?;
    artwork::record_artwork_cache(&conn, &game_id, "banner", &banner_path, Some(&url), false)?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

/// Applies a banner image the user picked from their own computer via
/// the native file dialog — the "Browse" option in the banner picker.
#[tauri::command]
pub fn apply_custom_banner(
    app: AppHandle,
    db: State<'_, Database>,
    game_id: String,
    file_path: String,
) -> AppResult<Game> {
    let banner_path = artwork::copy_local_artwork(&app, &game_id, "banner", &file_path)?;

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.execute(
        "UPDATE games SET banner_path = ?1 WHERE id = ?2",
        rusqlite::params![banner_path, game_id],
    )?;
    artwork::record_artwork_cache(&conn, &game_id, "banner", &banner_path, None, true)?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

/// Which `games` column a given artwork kind lives in — shared by
/// `crop_and_save_image` and `reset_artwork` so both stay in sync if a
/// kind is ever added.
fn artwork_column(kind: &str) -> AppResult<&'static str> {
    match kind {
        "cover" => Ok("cover_path"),
        "banner" => Ok("banner_path"),
        "logo" => Ok("logo_path"),
        "background" => Ok("background_path"),
        _ => Err(AppError::Invalid(format!("unknown artwork kind '{kind}'"))),
    }
}

/// Crops a region out of `source_path` (either a freshly Browse-picked
/// file or the currently-applied artwork, reused for a re-crop) and
/// applies the result as the game's cover/banner/logo/background. The
/// crop always re-encodes to a static PNG — cropping an animated Live
/// Cover would require re-encoding every frame, which the `image` crate
/// doesn't support for GIF/WebP here, so a cropped cover always becomes
/// a static one (`cover_is_animated` is cleared to match).
#[tauri::command]
// Args map 1:1 to the frontend's `cropAndSaveImage` invoke payload —
// grouping them into a struct would just move the list elsewhere.
#[allow(clippy::too_many_arguments)]
pub fn crop_and_save_image(
    app: AppHandle,
    db: State<'_, Database>,
    game_id: String,
    source_path: String,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    target_kind: String,
) -> AppResult<Game> {
    let column = artwork_column(&target_kind)?;
    if width == 0 || height == 0 {
        return Err(AppError::Invalid("crop dimensions must be greater than zero".into()));
    }

    let src = std::path::Path::new(&source_path);
    if src.components().any(|c| matches!(c, std::path::Component::ParentDir)) || !src.is_file() {
        return Err(AppError::Invalid("selected image file does not exist or is invalid".into()));
    }
    let file_len = src.metadata().map(|m| m.len()).unwrap_or(0);
    if file_len == 0 || file_len > artwork::MAX_ARTWORK_BYTES {
        return Err(AppError::Invalid("selected image file exceeds maximum allowed size (150 MB)".into()));
    }
    let ext_ok = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            matches!(
                ext.to_ascii_lowercase().as_str(),
                "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "ico" | "avif"
            )
        })
        .unwrap_or(false);
    if !ext_ok {
        return Err(AppError::Invalid(
            "selected file must be a supported image (.png, .jpg, .webp, .gif, .bmp, .ico)".into(),
        ));
    }

    // Check image header dimensions BEFORE decoding the full bitmap into memory
    let (img_w, img_h) = image::ImageReader::open(src)
        .map_err(|err| AppError::Other(format!("could not open image: {err}")))?
        .with_guessed_format()
        .map_err(|err| AppError::Other(format!("could not inspect image format: {err}")))?
        .into_dimensions()
        .map_err(|err| AppError::Other(format!("could not read image dimensions: {err}")))?;

    if img_w == 0 || img_h == 0 || img_w > 16384 || img_h > 16384 || (img_w as u64) * (img_h as u64) > 64_000_000 {
        return Err(AppError::Invalid(
            "image dimensions exceed the maximum safe limit (16384x16384 / 64 MP)".into(),
        ));
    }
    if x >= img_w || y >= img_h {
        return Err(AppError::Invalid("crop coordinates are outside the image bounds".into()));
    }

    let source = image::open(src)
        .map_err(|err| AppError::Other(format!("could not read image: {err}")))?;
    let cropped = source.crop_imm(x, y, width, height);

    let dir = artwork::artwork_dir(&app, &game_id)?;
    let dest = artwork::prepare_unique_path(&dir, &target_kind, "png");
    cropped
        .save(&dest)
        .map_err(|err| AppError::Other(format!("could not save cropped image: {err}")))?;
    let saved_path = dest.to_string_lossy().to_string();

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    if target_kind == "cover" {
        conn.execute(
            "UPDATE games SET cover_path = ?1, cover_is_animated = 0 WHERE id = ?2",
            rusqlite::params![saved_path, game_id],
        )?;
    } else {
        conn.execute(
            &format!("UPDATE games SET {column} = ?1 WHERE id = ?2"),
            rusqlite::params![saved_path, game_id],
        )?;
    }
    artwork::record_artwork_cache(&conn, &game_id, &target_kind, &saved_path, None, true)?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

/// Discards a manually-replaced cover/banner/logo/background and
/// re-downloads the auto-fetched original from its source (SteamGridDB
/// for the first three; the IGDB/SteamGridDB screenshot already cached
/// as the background fallback for the fourth).
#[tauri::command]
pub async fn reset_artwork(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    game_id: String,
    kind: String,
) -> AppResult<Game> {
    let column = artwork_column(&kind)?;

    if kind == "background" {
        // No standalone SteamGridDB/IGDB endpoint for "background" — it
        // was originally filled from the first cached screenshot, so
        // resetting re-downloads that same source URL rather than
        // querying anything fresh.
        let source_url: Option<String> = {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            conn.query_row(
                "SELECT source_url FROM artwork_cache WHERE game_id = ?1 AND kind = 'screenshot' AND ordinal = 0",
                [&game_id],
                |row| row.get(0),
            )
            .ok()
            .flatten()
        };
        let Some(url) = source_url else {
            return Err(AppError::NotFound(
                "No downloaded background available for this game — try Browse instead.".into(),
            ));
        };
        let background_path =
            artwork::download_artwork(&http.0, &app, &game_id, "background", &url, false).await?;
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.execute(
            "UPDATE games SET background_path = ?1 WHERE id = ?2",
            rusqlite::params![background_path, game_id],
        )?;
        artwork::record_artwork_cache(
            &conn,
            &game_id,
            "background",
            &background_path,
            Some(&url),
            false,
        )?;
        let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
        return Ok(conn.query_row(&sql, [&game_id], Game::from_row)?);
    }

    let credentials = get_credentials(&db);
    let Some(sgdb_key) = credentials.steamgriddb_api_key else {
        return Err(AppError::Invalid(
            "Add your SteamGridDB API key in Settings first.".into(),
        ));
    };
    let (steam_app_id, name) = get_game_lookup_fields(&db, &game_id);
    let sgdb_game_id =
        resolve_sgdb_game_id(&http.0, &sgdb_key, steam_app_id.as_deref(), &name).await;
    if steam_app_id.is_none() && sgdb_game_id.is_none() {
        return Err(AppError::NotFound(
            "SteamGridDB doesn't have a match for this game.".into(),
        ));
    }

    let (path, url, is_animated) = match kind.as_str() {
        "cover" => {
            let options = steamgriddb::search_grid_options(
                &http.0,
                &sgdb_key,
                steam_app_id.as_deref(),
                sgdb_game_id,
            )
            .await?;
            let chosen = options
                .iter()
                .find(|option| !option.is_animated)
                .or_else(|| options.first())
                .ok_or_else(|| {
                    AppError::NotFound("SteamGridDB has no cover for this game.".into())
                })?;
            let path =
                artwork::download_artwork(&http.0, &app, &game_id, "cover", &chosen.url, false).await?;
            (path, chosen.url.clone(), chosen.is_animated)
        }
        "banner" => {
            let url = steamgriddb::get_artwork_url(
                &http.0,
                &sgdb_key,
                steamgriddb::ArtworkKind::Hero,
                steam_app_id.as_deref(),
                sgdb_game_id,
            )
            .await?
            .ok_or_else(|| AppError::NotFound("SteamGridDB has no banner for this game.".into()))?;
            let path = artwork::download_artwork(&http.0, &app, &game_id, "banner", &url, false).await?;
            (path, url, false)
        }
        "logo" => {
            let url = steamgriddb::get_artwork_url(
                &http.0,
                &sgdb_key,
                steamgriddb::ArtworkKind::Logo,
                steam_app_id.as_deref(),
                sgdb_game_id,
            )
            .await?
            .ok_or_else(|| AppError::NotFound("SteamGridDB has no logo for this game.".into()))?;
            let path = artwork::download_artwork(&http.0, &app, &game_id, "logo", &url, false).await?;
            (path, url, false)
        }
        _ => return Err(AppError::Invalid(format!("unknown artwork kind '{kind}'"))),
    };

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    if kind == "cover" {
        conn.execute(
            "UPDATE games SET cover_path = ?1, cover_is_animated = ?2 WHERE id = ?3",
            rusqlite::params![path, is_animated, game_id],
        )?;
    } else {
        conn.execute(
            &format!("UPDATE games SET {column} = ?1 WHERE id = ?2"),
            rusqlite::params![path, game_id],
        )?;
    }
    artwork::record_artwork_cache(&conn, &game_id, &kind, &path, Some(&url), false)?;

    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&game_id], Game::from_row)?;
    Ok(game)
}

#[tauri::command]
pub fn get_orphaned_artwork_summary(
    app: AppHandle,
    db: State<'_, Database>,
) -> AppResult<artwork::OrphanedArtworkSummary> {
    artwork::get_orphaned_artwork_summary(&app, &db)
}

#[tauri::command]
pub fn cleanup_orphaned_artworks(
    app: AppHandle,
    db: State<'_, Database>,
) -> AppResult<artwork::OrphanedArtworkSummary> {
    artwork::cleanup_orphaned_artworks(&app, &db)
}

#[derive(serde::Serialize)]
pub struct CoverRepairResult {
    pub repaired_count: usize,
    pub total_missing: usize,
}

#[tauri::command]
pub async fn repair_missing_covers(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<CoverRepairResult> {
    use crate::services::providers::traits::MetadataProvider;

    struct MissingTarget {
        id: String,
        name: String,
        steam_app_id: Option<String>,
        igdb_id: Option<i64>,
    }

    // 1. Gather all games whose cover_path is null or points to a non-existent file
    let targets: Vec<MissingTarget> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let mut stmt = conn.prepare("SELECT id, name, cover_path, steam_app_id, igdb_id FROM games")?;
        let rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let cover_path: Option<String> = row.get(2)?;
            let steam_app_id: Option<String> = row.get(3)?;
            let igdb_id: Option<i64> = row.get(4)?;
            Ok((id, name, cover_path, steam_app_id, igdb_id))
        })?;

        rows.filter_map(Result::ok)
            .filter(|(_, _, cover_path, _, _)| match cover_path {
                Some(ref p) => !std::path::Path::new(p).exists(),
                None => true,
            })
            .map(|(id, name, _, steam_app_id, igdb_id)| MissingTarget {
                id,
                name,
                steam_app_id,
                igdb_id,
            })
            .collect()
    };

    let total_missing = targets.len();
    if total_missing == 0 {
        return Ok(CoverRepairResult {
            repaired_count: 0,
            total_missing: 0,
        });
    }

    let mut repaired_count = 0;

    for target in targets {
        // a) First check artwork_cache for existing source_url
        let cached_source_url: Option<String> = {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            conn.query_row(
                "SELECT source_url FROM artwork_cache WHERE game_id = ?1 AND kind = 'cover' AND source_url IS NOT NULL ORDER BY ordinal ASC LIMIT 1",
                [&target.id],
                |row| row.get(0),
            )
            .ok()
        };

        let mut resolved_url = cached_source_url;

        // b) If no cached URL, resolve via provider resolver
        if resolved_url.is_none() {
            if let Ok(options) = resolver
                .get_artwork_options(&db, "cover", target.steam_app_id.as_deref(), &target.name)
                .await
            {
                if let Some(first) = options.into_iter().find(|o| !o.url.is_empty()) {
                    resolved_url = Some(first.url);
                }
            }
        }

        // c) Fallback: if igdb_id exists, fetch details directly from cloud
        if resolved_url.is_none() {
            if let Some(igdb_id) = target.igdb_id {
                let cloud = crate::services::providers::nexus_cloud::NexusCloudProvider::new(
                    http.0.clone(),
                    None,
                );
                if let Ok(Some(details)) = cloud.get_game_details(igdb_id).await {
                    if let Some(cover) = details.game.cover_url {
                        resolved_url = Some(cover);
                    }
                }
            }
        }

        // d) Download and apply if URL was resolved (keeping cover_is_animated in sync)
        if let Some(url) = resolved_url {
            let is_anim = url
                .rsplit('.')
                .next()
                .and_then(|ext| ext.split(['?', '#']).next())
                .map(|ext| ext.eq_ignore_ascii_case("gif") || ext.eq_ignore_ascii_case("webm") || ext.eq_ignore_ascii_case("mp4"))
                .unwrap_or(false);
            if let Ok(local_path) = artwork::download_artwork(&http.0, &app, &target.id, "cover", &url, false).await {
                let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
                let _ = conn.execute(
                    "UPDATE games SET cover_path = ?1, cover_is_animated = ?2 WHERE id = ?3",
                    rusqlite::params![local_path, is_anim, target.id],
                );
                let _ = artwork::record_artwork_cache(&conn, &target.id, "cover", &local_path, Some(&url), false);
                repaired_count += 1;
            }
        }
    }

    Ok(CoverRepairResult {
        repaired_count,
        total_missing,
    })
}

