//! Game Hub: a storefront-style discovery feed built directly on IGDB
//! (no per-user accounts, nothing social — just "what's new and notable"
//! pulled live). Everything here is read-only against IGDB except
//! `add_game_from_hub`, which turns a hub entry into a library-only
//! game (`is_installed = 0`) whose local install details the user fills
//! in later from the details panel, exactly like any manually-added
//! game.

use crate::commands::metadata::{igdb, HttpClient, IgdbTokenCache};
use crate::db::models::Game;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::services::metadata::{MetadataProviderResolver, ProviderMode};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

/// Standalone playable game categories on IGDB:
/// 0 = Main Game, 4 = Standalone Expansion, 8 = Remake, 9 = Remaster, 10 = Expanded Game.
/// Excludes non-standalone items: DLCs (1), Expansions (2), Bundles (3), Mods (5), Episodes (6), Seasons (7), Packs (13), Updates (14).
pub const STANDALONE_GAME_TYPES: &str = "(0, 8, 9, 10, 4)";

/// One card in the hub. Image URLs point at IGDB's CDN and are rendered
/// by the frontend as remote `<img>`s — nothing is downloaded locally
/// until the game is actually added to the library.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubGame {
    pub igdb_id: i64,
    pub name: String,
    pub summary: Option<String>,
    /// YYYY-MM-DD, IGDB's timestamp normalized the same way the library
    /// stores its own `release_date`.
    pub release_date: Option<String>,
    pub game_type: Option<i64>,
    pub cover_url: Option<String>,
    /// Full-width hero backdrop at IGDB's 1080p size (1920px) — the
    /// banner and detail hero stretch across the whole window, where
    /// the smaller card-sized URLs look visibly blurry. Falls back to
    /// the cover at the same size when a game has no screenshots.
    pub backdrop_url: Option<String>,
    /// IGDB's aggregated critic score (0-100), rounded.
    pub rating: Option<i64>,
    pub rating_count: Option<i64>,
    /// Pre-release follower count — the closest IGDB has to "buzz".
    pub hypes: Option<i64>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
}

const LIST_FIELDS: &str = "fields name, summary, first_release_date, game_type, cover.image_id, \
     screenshots.image_id, total_rating_count, aggregated_rating, hypes, genres.name, platforms.name";

const SECONDS_PER_DAY: i64 = 86_400;

/// Shared fetch+parse for the curated list commands below. `limit` and
/// `offset` are separate APIcalypse statements — IGDB rejects the
/// combined `limit N offset M` form with a 400 Syntax Error.
async fn fetch_hub_games(
    http: &reqwest::Client,
    client_id: &str,
    token: &str,
    where_clause: &str,
    order: &str,
    limit: usize,
    offset: i64,
) -> AppResult<Vec<HubGame>> {
    let body = format!(
        "{LIST_FIELDS};\nwhere {where_clause};\nsort {order};\nlimit {limit};\noffset {offset};"
    );
    let value = igdb::query(http, client_id, token, "games", &body).await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };
    Ok(entries.iter().filter_map(parse_hub_game).collect())
}

pub(crate) fn parse_hub_game(entry: &Value) -> Option<HubGame> {
    let igdb_id = entry.get("id")?.as_i64()?;
    let name = entry.get("name")?.as_str()?.to_string();

    let summary = entry
        .get("summary")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    let release_date = entry
        .get("first_release_date")
        .and_then(Value::as_i64)
        .filter(|timestamp| *timestamp > 0)
        .and_then(unix_to_date);

    let game_type = entry.get("game_type").and_then(Value::as_i64);

    let cover_url = entry
        .get("cover")
        .and_then(|cover| cover.get("image_id"))
        .and_then(Value::as_str)
        .map(|image_id| igdb::cover_image_url(image_id, "cover_big"));

    let screenshot_1080p = entry
        .get("screenshots")
        .and_then(Value::as_array)
        .and_then(|shots| shots.first())
        .and_then(|shot| shot.get("image_id"))
        .and_then(Value::as_str)
        .map(|image_id| igdb::cover_image_url(image_id, "1080p"));
    let cover_1080p = entry
        .get("cover")
        .and_then(|cover| cover.get("image_id"))
        .and_then(Value::as_str)
        .map(|image_id| igdb::cover_image_url(image_id, "1080p"));
    let backdrop_url = screenshot_1080p.or(cover_1080p);

    let rating = entry
        .get("aggregated_rating")
        .and_then(Value::as_f64)
        .filter(|rating| *rating > 0.0)
        .map(|rating| rating.round() as i64);

    let rating_count = entry
        .get("total_rating_count")
        .and_then(Value::as_i64)
        .filter(|count| *count > 0);

    let hypes = entry
        .get("hypes")
        .and_then(Value::as_i64)
        .filter(|hypes| *hypes > 0);

    let genres = string_names(entry, "genres");
    let platforms = string_names(entry, "platforms");

    Some(HubGame {
        igdb_id,
        name,
        summary,
        release_date,
        game_type,
        cover_url,
        backdrop_url,
        rating,
        rating_count,
        hypes,
        genres,
        platforms,
    })
}

fn string_names(entry: &Value, key: &str) -> Vec<String> {
    entry
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str))
                .take(4)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn unix_to_date(timestamp: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(timestamp, 0).map(|dt| dt.format("%Y-%m-%d").to_string())
}

fn igdb_credentials(db: &Database) -> AppResult<(String, String)> {
    let conn = db.connection.lock().expect("db mutex poisoned");
    // Empty strings count as missing: the Settings UI saves a cleared
    // field as "" (the row stays), and letting "" through would defer
    // the failure to a confusing "IGDB returned 401" later — see the
    // empty-credentials guard in metadata::get_credentials too.
    let read = |key: &str| -> Option<String> {
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .ok()
        .and_then(|value: String| (!value.trim().is_empty()).then_some(value))
    };

    match (read("igdb_client_id"), read("igdb_client_secret")) {
        (Some(id), Some(secret)) => Ok((id, secret)),
        _ => Err(AppError::Invalid(
            "Add your IGDB Client ID and Secret in Settings first.".into(),
        )),
    }
}

// Note: IGDB removed the old `category` field — the current equivalent
// for standalone games is `game_type = (0, 8, 9, 10, 4)` (Main Game, Remake,
// Remaster, Expanded Game, Standalone Expansion). This includes remakes like
// Silent Hill 2 (2024) and Dead Space while excluding non-standalone DLCs,
// mods, episodes, and packs.
// Verified live against the API: `category` now matches nothing at all.

/// The where/order pair for one feed, shared by the shelf commands
/// (small fixed limit) and the paginated browse endpoint
/// (`get_hub_feed`). Returns `None` only for "recommended" when the
/// user has no playtime genres to personalize from.
async fn feed_where_clause(
    feed: &str,
    db: &Database,
    http: &reqwest::Client,
    client_id: &str,
    token: &str,
) -> AppResult<Option<(String, &'static str)>> {
    let now = Utc::now().timestamp();
    match feed {
        // Banner: the most-hyped games released in the last 90 days.
        // Sorted by hypes (not release date) because a pure date sort
        // surfaces tiny same-day indie entries nobody has heard of.
        "new-releases" => Ok(Some((
            format!(
                "game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} \
                 & first_release_date > {} & (hypes > 2 | total_rating_count > 10)",
                now - 90 * SECONDS_PER_DAY
            ),
            "hypes desc",
        ))),
        // Upcoming releases with real anticipation behind them.
        "coming-soon" => Ok(Some((
            format!("game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date > {now} & hypes > 1"),
            "first_release_date asc",
        ))),
        // The most-voted well-received games of the last three years.
        "top-rated" => Ok(Some((
            format!(
                "game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} \
                 & first_release_date > {} & total_rating_count > 75",
                now - 3 * 365 * SECONDS_PER_DAY
            ),
            "total_rating_count desc",
        ))),
        // Personalized: the user's most-played genres (same aggregation
        // as the stats page) resolved to IGDB genre ids.
        "recommended" => {
            let top_genres: Vec<String> = {
                let conn = db.connection.lock().expect("db mutex poisoned");
                let active_profile: String = conn
                    .query_row(
                        "SELECT value FROM settings WHERE key = 'active_profile_id'",
                        [],
                        |r| r.get(0),
                    )
                    .unwrap_or_else(|_| "default".to_string());
                let mut stmt = conn.prepare(
                    "SELECT je.value AS genre, SUM(COALESCE(p.duration_seconds, 0)) AS total
                     FROM playtime_sessions p
                     JOIN games g ON g.id = p.game_id
                     JOIN json_each(CASE WHEN json_valid(g.genres) THEN g.genres ELSE '[]' END) AS je
                     WHERE p.profile_id = ?1
                     GROUP BY je.value
                     HAVING total > 0
                     ORDER BY total DESC
                     LIMIT 2",
                )?;
                let rows = stmt
                    .query_map([&active_profile], |row| row.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()?;
                rows
            };
            if top_genres.is_empty() {
                return Ok(None);
            }

            // Resolve genre names → IGDB ids (one small /genres query).
            let quoted = top_genres
                .iter()
                .map(|genre| format!("\"{}\"", igdb::sanitize_query_value(genre)))
                .collect::<Vec<_>>()
                .join(", ");
            let body = format!("fields name; where name = ({quoted}); limit 10;");
            let value = igdb::query(http, client_id, token, "genres", &body).await?;
            let id_list = value
                .as_array()
                .map(|entries| {
                    entries
                        .iter()
                        .filter_map(|entry| entry.get("id").and_then(Value::as_i64))
                        .map(|id| id.to_string())
                        .collect::<Vec<_>>()
                        .join(",")
                })
                .unwrap_or_default();
            if id_list.is_empty() {
                return Ok(None);
            }

            Ok(Some((
                format!(
                    "game_type = {STANDALONE_GAME_TYPES} & cover != null & genres = ({id_list}) \
                     & first_release_date < {now} & total_rating_count > 40"
                ),
                "total_rating_count desc",
            )))
        }
        _ => Err(AppError::Invalid(format!("unknown hub feed: {feed}"))),
    }
}

async fn fetch_feed(
    db: &Database,
    http: &reqwest::Client,
    token_cache: &IgdbTokenCache,
    resolver: &MetadataProviderResolver,
    feed: &str,
    limit: usize,
    offset: i64,
) -> AppResult<Vec<HubGame>> {
    let config = resolver.get_config(db);
    if config.mode == ProviderMode::Public {
        let norm_feed = feed.replace('-', "_");
        let mut games = resolver.fetch_feed(db, &norm_feed, offset).await?;
        if games.len() > limit {
            games.truncate(limit);
        }
        return Ok(games);
    }

    let (client_id, client_secret) = igdb_credentials(db)?;
    let token = igdb::get_access_token(http, token_cache, &client_id, &client_secret).await?;
    let Some((where_clause, order)) = feed_where_clause(feed, db, http, &client_id, &token).await?
    else {
        return Ok(Vec::new());
    };
    fetch_hub_games(
        http,
        &client_id,
        &token,
        &where_clause,
        order,
        limit,
        offset,
    )
    .await
}

/// Banner: the most-hyped games released in the last 90 days — see
/// `feed_where_clause("new-releases")`.
#[tauri::command]
pub async fn get_hub_new_releases(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_feed(&db, &http.0, &token_cache, &resolver, "new-releases", 10, 0).await
}

/// Upcoming releases with real anticipation behind them, soonest first.
#[tauri::command]
pub async fn get_hub_coming_soon(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_feed(&db, &http.0, &token_cache, &resolver, "coming-soon", 14, 0).await
}

/// The most-voted well-received games of the last three years — the
/// "everyone played this" shelf.
#[tauri::command]
pub async fn get_hub_top_rated(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_feed(&db, &http.0, &token_cache, &resolver, "top-rated", 14, 0).await
}

/// Personalized row: highly-rated games from the user's most-played
/// genres. Empty when the user has no tagged playtime yet — the
/// frontend simply hides the row.
#[tauri::command]
pub async fn get_hub_recommended(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_feed(&db, &http.0, &token_cache, &resolver, "recommended", 14, 0).await
}

/// Full paginated listing behind a shelf's "More" button — same feed
/// definitions as the shelves themselves, but 24 per page by offset so
/// the browse page can keep loading.
#[tauri::command]
pub async fn get_hub_feed(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    feed: String,
    offset: Option<i64>,
) -> AppResult<Vec<HubGame>> {
    let offset = offset.unwrap_or(0).max(0);
    fetch_feed(&db, &http.0, &token_cache, &resolver, &feed, 24, offset).await
}

/// IGDB's genre list (~25 fixed values) — the genre filter chips in the
/// hub. One tiny query, cacheable by TanStack Query like everything else.
#[derive(Debug, Clone, Serialize)]
pub struct HubGenre {
    pub id: i64,
    pub name: String,
}

#[tauri::command]
pub async fn list_hub_genres(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGenre>> {
    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        return match resolver.list_genres(&db).await {
            Ok(genres) => Ok(genres
                .into_iter()
                .map(|item| HubGenre {
                    id: item.id,
                    name: item.name,
                })
                .collect()),
            Err(err) => {
                log::warn!("Could not load genres from public gateway (offline or unreachable): {err}");
                Ok(Vec::new())
            }
        };
    }

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;
    let value = igdb::query(
        &http.0,
        &client_id,
        &token,
        "genres",
        "fields name; limit 50; sort name asc;",
    )
    .await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };
    Ok(entries
        .iter()
        .filter_map(|entry| {
            Some(HubGenre {
                id: entry.get("id")?.as_i64()?,
                name: entry.get("name")?.as_str()?.to_string(),
            })
        })
        .collect())
}

/// Curated modern platforms for the hub's platform filter — IGDB has
/// ~200 platform records and most are obsolete, so rather than a
/// 200-entry dropdown the filter offers the ones a 2026 storefront
/// shopper actually picks between. Ids verified live against IGDB
/// (508 = Nintendo Switch 2 is the newest).
const HUB_PLATFORM_IDS: &str = "(3,6,14,48,49,130,167,169,508)";

#[derive(Debug, Clone, Serialize)]
pub struct HubPlatform {
    pub id: i64,
    pub name: String,
    pub abbreviation: String,
}

#[tauri::command]
pub async fn list_hub_platforms(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubPlatform>> {
    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        return match resolver.list_platforms(&db).await {
            Ok(platforms) => Ok(platforms
                .into_iter()
                .map(|item| HubPlatform {
                    id: item.id,
                    name: item.name,
                    abbreviation: String::new(),
                })
                .collect()),
            Err(err) => {
                log::warn!("Could not load platforms from public gateway (offline or unreachable): {err}");
                Ok(Vec::new())
            }
        };
    }

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;
    let body = format!("fields name, abbreviation; where id = {HUB_PLATFORM_IDS}; limit 50;");
    let value = igdb::query(&http.0, &client_id, &token, "platforms", &body).await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };
    Ok(entries
        .iter()
        .filter_map(|entry| {
            Some(HubPlatform {
                id: entry.get("id")?.as_i64()?,
                name: entry.get("name")?.as_str()?.to_string(),
                abbreviation: entry.get("abbreviation")?.as_str()?.to_string(),
            })
        })
        .collect())
}

/// Maps a release-date filter key to a `first_release_date` clause.
/// Fixed presets, single years ("2025"), year ranges ("2005-2010"), or
/// open-ended bounds ("2005+", "-2010") — a whitelist, never a raw
/// timestamp from the frontend, so the query body stays predictable.
/// Returns `Ok(None)` for absent/empty (no clause).
fn release_clause(filter: Option<&str>, now: i64) -> AppResult<Option<String>> {
    let Some(filter) = filter.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };

    fn between(from: i64, to: i64) -> String {
        format!("first_release_date > {from} & first_release_date < {to}")
    }

    let clause = match filter {
        "upcoming" => format!("first_release_date > {now}"),
        "new" => between(now - 90 * SECONDS_PER_DAY, now),
        "last-year" => between(now - 365 * SECONDS_PER_DAY, now),
        "last-3-years" => between(now - 3 * 365 * SECONDS_PER_DAY, now),
        _ => {
            if filter.ends_with('+') {
                let year_str = filter.trim_end_matches('+').trim();
                let year: i32 = year_str
                    .parse()
                    .map_err(|_| AppError::Invalid(format!("unknown release filter '{filter}'")))?;
                if !(1970..=2100).contains(&year) {
                    return Err(AppError::Invalid(format!(
                        "release year {year} is out of range"
                    )));
                }
                let start = chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, year, 1, 1, 0, 0, 0)
                    .single()
                    .ok_or_else(|| AppError::Invalid("invalid release year".into()))?;
                format!("first_release_date >= {}", start.timestamp())
            } else if filter.starts_with('-') {
                let year_str = filter.trim_start_matches('-').trim();
                let year: i32 = year_str
                    .parse()
                    .map_err(|_| AppError::Invalid(format!("unknown release filter '{filter}'")))?;
                if !(1970..=2100).contains(&year) {
                    return Err(AppError::Invalid(format!(
                        "release year {year} is out of range"
                    )));
                }
                let end =
                    chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, year + 1, 1, 1, 0, 0, 0)
                        .single()
                        .ok_or_else(|| AppError::Invalid("invalid release year".into()))?;
                format!("first_release_date < {}", end.timestamp())
            } else if let Some((start_str, end_str)) = filter.split_once('-') {
                let start_year: i32 = start_str
                    .trim()
                    .parse()
                    .map_err(|_| AppError::Invalid(format!("unknown release filter '{filter}'")))?;
                let end_year: i32 = end_str
                    .trim()
                    .parse()
                    .map_err(|_| AppError::Invalid(format!("unknown release filter '{filter}'")))?;
                let (min_year, max_year) = if start_year <= end_year {
                    (start_year, end_year)
                } else {
                    (end_year, start_year)
                };
                if !(1970..=2100).contains(&min_year) || !(1970..=2100).contains(&max_year) {
                    return Err(AppError::Invalid(format!(
                        "release year range {min_year}-{max_year} is out of range"
                    )));
                }
                let start =
                    chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, min_year, 1, 1, 0, 0, 0)
                        .single()
                        .ok_or_else(|| AppError::Invalid("invalid release year".into()))?;
                let end =
                    chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, max_year + 1, 1, 1, 0, 0, 0)
                        .single()
                        .ok_or_else(|| AppError::Invalid("invalid release year".into()))?;
                format!(
                    "first_release_date >= {} & first_release_date < {}",
                    start.timestamp(),
                    end.timestamp()
                )
            } else {
                let year: i32 = filter
                    .parse()
                    .map_err(|_| AppError::Invalid(format!("unknown release filter '{filter}'")))?;
                if !(1970..=2100).contains(&year) {
                    return Err(AppError::Invalid(format!(
                        "release year {year} is out of range"
                    )));
                }
                let start = chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, year, 1, 1, 0, 0, 0)
                    .single()
                    .ok_or_else(|| AppError::Invalid("invalid release year".into()))?;
                let end =
                    chrono::TimeZone::with_ymd_and_hms(&chrono::Utc, year + 1, 1, 1, 0, 0, 0)
                        .single()
                        .ok_or_else(|| AppError::Invalid("invalid release year".into()))?;
                format!(
                    "first_release_date >= {} & first_release_date < {}",
                    start.timestamp(),
                    end.timestamp()
                )
            }
        }
    };
    Ok(Some(clause))
}

/// The hub's catalog filters, all optional and combinable — travels as
/// one IPC payload (`filters: { genreIds, ... }`) so adding a filter
/// never grows the command's argument list.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HubSearchFilters {
    pub genre_id: Option<i64>,
    pub genre_ids: Option<Vec<i64>>,
    pub platform_id: Option<i64>,
    pub platform_ids: Option<Vec<i64>>,
    /// Preset key, 4-digit year, year range ("2005-2010"), or open bound ("2005+") — see `release_clause`.
    pub release: Option<String>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    pub min_rating: Option<i64>,
    /// Sort key — see `sort_clause`. `None` means the mode's default
    /// (search relevance, or popularity in filter mode).
    pub sort: Option<String>,
}

/// Maps a sort key to an APIcalypse `sort` statement. A whitelist —
/// the frontend never sends a raw field/direction pair. `Ok(None)`
/// means "not chosen" (use the mode default).
fn sort_clause(sort: Option<&str>) -> AppResult<Option<&'static str>> {
    let Some(sort) = sort.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    match sort {
        "popularity" => Ok(Some("total_rating_count desc")),
        "rating" => Ok(Some("aggregated_rating desc")),
        "newest" => Ok(Some("first_release_date desc")),
        "oldest" => Ok(Some("first_release_date asc")),
        "name" => Ok(Some("name asc")),
        _ => Err(AppError::Invalid(format!("unknown sort '{sort}'"))),
    }
}

/// Per-word wildcard name clauses (`name ~ *"witcher"* & name ~ *"wild"*`),
/// the loosest match we can express in APIcalypse. Unlike `search`, this
/// finds partial words ("battlef" → Battlefield) and tolerates word
/// order/extra words — but it can't rank by relevance, so it's only used
/// where `search` can't be (filters active) or after it came back empty.
fn name_wildcard_clause(trimmed: &str) -> Option<String> {
    let clause = trimmed
        .split_whitespace()
        .map(igdb::sanitize_query_value)
        .filter(|word| !word.is_empty())
        .map(|word| format!("name ~ *\"{word}\"*"))
        .collect::<Vec<_>>()
        .join(" & ");
    (!clause.is_empty()).then_some(clause)
}

/// Full-catalog search for the hub's search box, optionally narrowed by
/// genre, platform, release window, and minimum rating, and optionally
/// reordered — any of which also works alone (no term) as a browse mode.
///
/// IGDB does not allow `where` to combine with `search`, so as soon as
/// any filter or an explicit sort is active the query switches to a
/// per-word wildcard name match — the documented workaround, verified
/// live. That mode defaults to popularity ordering (search relevance
/// only exists for `search`). In plain mode the relevance search runs
/// first and, when it comes back empty, retries with the same wildcard
/// match so partial words still find games. All shapes were tested
/// against the real API before landing here.
#[tauri::command]
pub async fn search_hub_games(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    query: String,
    offset: Option<i64>,
    filters: Option<HubSearchFilters>,
) -> AppResult<Vec<HubGame>> {
    let trimmed = query.trim();
    let offset = offset.unwrap_or(0).max(0);
    let filters = filters.unwrap_or_default();

    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        let gid = filters.genre_id.or_else(|| filters.genre_ids.as_ref().and_then(|ids| ids.first().copied()));
        let pid = filters.platform_id.or_else(|| filters.platform_ids.as_ref().and_then(|ids| ids.first().copied()));
        return resolver.search_games(&db, trimmed, offset, gid, pid).await;
    }

    let effective_release = match (&filters.release, filters.year_from, filters.year_to) {
        (Some(r), _, _) if !r.trim().is_empty() => Some(r.trim().to_string()),
        (_, Some(from), Some(to)) => Some(format!("{from}-{to}")),
        (_, Some(from), None) => Some(format!("{from}+")),
        (_, None, Some(to)) => Some(format!("-{to}")),
        _ => None,
    };
    let release = release_clause(effective_release.as_deref(), Utc::now().timestamp())?;
    let sort = sort_clause(filters.sort.as_deref())?;

    let mut genre_ids: Vec<i64> = Vec::new();
    if let Some(ids) = &filters.genre_ids {
        genre_ids.extend(ids.iter().copied().filter(|&id| id > 0));
    } else if let Some(id) = filters.genre_id {
        if id > 0 {
            genre_ids.push(id);
        }
    }
    genre_ids.sort_unstable();
    genre_ids.dedup();

    let mut platform_ids: Vec<i64> = Vec::new();
    if let Some(ids) = &filters.platform_ids {
        platform_ids.extend(ids.iter().copied().filter(|&id| id > 0));
    } else if let Some(id) = filters.platform_id {
        if id > 0 {
            platform_ids.push(id);
        }
    }
    platform_ids.sort_unstable();
    platform_ids.dedup();

    let has_filters = !genre_ids.is_empty()
        || !platform_ids.is_empty()
        || release.is_some()
        || filters.min_rating.is_some()
        || sort.is_some();

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;

    let run = |body: String| {
        let http = &http.0;
        let client_id = client_id.as_str();
        let token = token.as_str();
        async move { igdb::query(http, client_id, token, "games", &body).await }
    };

    if has_filters {
        let mut clauses = vec![
            format!("game_type = {STANDALONE_GAME_TYPES}"),
            "cover != null".to_string(),
        ];
        // When multiple genres are selected, the game must contain ALL of them (conjunction / AND).
        for id in &genre_ids {
            clauses.push(format!("genres = ({id})"));
        }
        if !platform_ids.is_empty() {
            let list = platform_ids
                .iter()
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(",");
            clauses.push(format!("platforms = ({list})"));
        }
        if let Some(release) = release {
            clauses.push(release);
        }
        if let Some(min_rating) = filters.min_rating {
            clauses.push(format!("aggregated_rating >= {min_rating}"));
        }
        if trimmed.len() >= 2 {
            if let Some(name_clause) = name_wildcard_clause(trimmed) {
                clauses.push(name_clause);
            }
        }
        // An explicit sort wins; otherwise filter mode falls back to
        // popularity rather than an arbitrary engine default.
        let sort = sort.unwrap_or("total_rating_count desc");
        let body = format!(
            "{LIST_FIELDS};\nwhere {};\nsort {sort};\nlimit 24;\noffset {offset};",
            clauses.join(" & ")
        );
        let value = run(body).await?;
        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };
        return Ok(entries.iter().filter_map(parse_hub_game).collect());
    }

    if trimmed.len() < 2 {
        return Ok(Vec::new());
    }

    // Plain search: IGDB's `search` ranks by relevance and handles full
    // words out of order ("duty call" → Call of Duty), but it's strict —
    // a partial word like "battlef" matches nothing. So on an empty
    // first page, retry with per-word wildcards ordered by popularity
    // (verified live: the two shapes complement each other exactly).
    let sanitized = igdb::sanitize_query_value(trimmed);
    let search_body = format!(
        "{LIST_FIELDS};\nsearch \"{sanitized}\";\nwhere game_type = {STANDALONE_GAME_TYPES} & cover != null;\nlimit 24;\noffset {offset};"
    );
    let value = run(search_body).await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };
    if !entries.is_empty() {
        return Ok(entries.iter().filter_map(parse_hub_game).collect());
    }

    let Some(name_clause) = name_wildcard_clause(trimmed) else {
        return Ok(Vec::new());
    };
    let fallback_body = format!(
        "{LIST_FIELDS};\nwhere game_type = {STANDALONE_GAME_TYPES} & cover != null & {name_clause};\n\
         sort total_rating_count desc;\nlimit 24;\noffset {offset};"
    );
    let value = run(fallback_body).await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };
    Ok(entries.iter().filter_map(parse_hub_game).collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubVideo {
    pub name: Option<String>,
    pub video_id: String,
}

/// Full details for one hub game — everything `igdb::get_game_details`
/// returns plus ready-to-render image URLs for the detail page.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubGameDetails {
    #[serde(flatten)]
    pub game: HubGame,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub trailer_url: Option<String>,
    pub videos: Vec<HubVideo>,
    /// Gallery images, already ordered.
    pub screenshot_urls: Vec<String>,
    /// The *real* Metacritic score, fetched live from Steam's store API
    /// (which republishes it) via the game's Steam AppID resolved from
    /// IGDB `external_games`. `None` when the game isn't on Steam or
    /// Metacritic hasn't rated it — the UI falls back to the IGDB
    /// aggregate in `game.rating`.
    pub metacritic_score: Option<i64>,
    pub steam_app_id: Option<String>,
}

#[tauri::command]
pub async fn get_hub_game_details(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    igdb_id: i64,
) -> AppResult<HubGameDetails> {
    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        return match resolver.get_game_details(&db, igdb_id).await? {
            Some(details) => Ok(details),
            None => Err(AppError::NotFound("Game not found on IGDB".into())),
        };
    }

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;
    let details = igdb::get_game_details(&http.0, &client_id, &token, igdb_id).await?;

    // One game, one Steam lookup — cheap enough for a detail page (the
    // hub's *card grids* deliberately stay IGDB-only so paging stays a
    // single bulk request).
    let steam_app_id = igdb::get_steam_app_id(&http.0, &client_id, &token, igdb_id)
        .await
        .ok()
        .flatten();
    let metacritic_score = match steam_app_id.as_deref() {
        Some(app_id) => {
            match crate::commands::metadata::steam_store::get_app_details(&http.0, app_id).await {
                Ok(Some(steam)) => steam.metacritic_score,
                _ => None,
            }
        }
        None => None,
    };

    let screenshot_urls: Vec<String> = details
        .screenshot_image_ids
        .iter()
        .take(6)
        .map(|image_id| igdb::cover_image_url(image_id, "screenshot_huge"))
        .collect();
    // The detail hero spans the window width — give it the 1080p master
    // rather than the gallery-sized URL (see HubGame::backdrop_url).
    let hero_screenshot_1080p = details
        .screenshot_image_ids
        .first()
        .map(|image_id| igdb::cover_image_url(image_id, "1080p"));
    let cover_1080p = details
        .cover_image_id
        .as_deref()
        .map(|image_id| igdb::cover_image_url(image_id, "1080p"));

    let videos: Vec<HubVideo> = details
        .videos
        .into_iter()
        .map(|v| HubVideo {
            name: v.name,
            video_id: v.video_id,
        })
        .collect();

    Ok(HubGameDetails {
        game: HubGame {
            igdb_id,
            name: details.name,
            summary: details.description,
            release_date: details.release_date,
            game_type: details.game_type,
            cover_url: details
                .cover_image_id
                .as_deref()
                .map(|image_id| igdb::cover_image_url(image_id, "720p")),
            backdrop_url: hero_screenshot_1080p.or(cover_1080p),
            rating: details.critic_score,
            rating_count: None,
            hypes: None,
            genres: details.genres,
            platforms: details.platforms,
        },
        developer: details.developer,
        publisher: details.publisher,
        trailer_url: details.trailer_url,
        videos,
        screenshot_urls,
        metacritic_score,
        steam_app_id,
    })
}

/// Fetches games similar to a given hub game from IGDB's graph of similar
/// titles, enriched with full card metadata (genres, platforms, ratings,
/// covers, game types). Falls back to same-genre titles if the target game
/// has sparse similar_games links on IGDB.
#[tauri::command]
pub async fn get_hub_similar_games(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    igdb_id: i64,
) -> AppResult<Vec<HubGame>> {
    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        return resolver.get_similar_games(&db, igdb_id).await;
    }

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;

    let body = format!(
        "fields similar_games.id, similar_games.name, similar_games.summary, \
         similar_games.first_release_date, similar_games.game_type, \
         similar_games.cover.image_id, similar_games.screenshots.image_id, \
         similar_games.total_rating_count, similar_games.aggregated_rating, \
         similar_games.hypes, similar_games.genres.name, similar_games.platforms.name, \
         genres.id;\n\
         where id = {igdb_id};"
    );

    let value = igdb::query(&http.0, &client_id, &token, "games", &body).await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };

    let target_entry = entries.into_iter().next();
    let mut games: Vec<HubGame> = Vec::new();
    let mut seen_ids = std::collections::HashSet::new();
    seen_ids.insert(igdb_id);

    let mut genre_ids = Vec::new();

    if let Some(entry) = target_entry {
        if let Some(genres_arr) = entry.get("genres").and_then(Value::as_array) {
            for g in genres_arr {
                if let Some(gid) = g.get("id").and_then(Value::as_i64) {
                    genre_ids.push(gid);
                }
            }
        }

        if let Some(similar) = entry.get("similar_games").and_then(Value::as_array) {
            for sim in similar {
                if let Some(game) = parse_hub_game(sim) {
                    if seen_ids.insert(game.igdb_id) {
                        let is_standalone = match game.game_type {
                            Some(t) => [0, 4, 8, 9, 10].contains(&t),
                            None => true,
                        };
                        if is_standalone && game.cover_url.is_some() {
                            games.push(game);
                        }
                    }
                }
            }
        }
    }

    // Fallback if fewer than 4 similar games found and we have genres
    if games.len() < 4 && !genre_ids.is_empty() {
        let genre_clause = genre_ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let fallback_body = format!(
            "{LIST_FIELDS};\n\
             where game_type = {STANDALONE_GAME_TYPES} & cover != null & genres = ({genre_clause}) & id != {igdb_id};\n\
             sort total_rating_count desc;\n\
             limit 12;\n\
             offset 0;"
        );
        if let Ok(Value::Array(fallback_entries)) =
            igdb::query(&http.0, &client_id, &token, "games", &fallback_body).await
        {
            for entry in fallback_entries {
                if let Some(game) = parse_hub_game(&entry) {
                    if seen_ids.insert(game.igdb_id) {
                        games.push(game);
                        if games.len() >= 8 {
                            break;
                        }
                    }
                }
            }
        }
    }

    Ok(games)
}

/// Shared insert behind "Add to Library", "Add to Wishlist", and the
/// download manager's game linkage. Fetches the IGDB details once,
/// writes text metadata immediately, and lets the background artwork
/// pipeline fill covers in.
#[derive(Clone, Copy, PartialEq)]
enum HubInsertMode {
    Library,
    Wishlist,
    /// "Make sure this game exists in the library" — reuses the existing
    /// row instead of erroring on duplicates (the download manager needs
    /// a game id, and refusing would block the download).
    Ensure,
}

async fn insert_hub_game(
    app: &AppHandle,
    db: &Database,
    http: &HttpClient,
    token_cache: &IgdbTokenCache,
    igdb_id: i64,
    mode: HubInsertMode,
) -> AppResult<Game> {
    let is_wishlist = mode == HubInsertMode::Wishlist;
    let resolver = app.state::<Arc<MetadataProviderResolver>>();
    let config = resolver.get_config(db);

    let (
        details_name,
        details_description,
        details_developer,
        details_publisher,
        details_release_date,
        genres_json,
        platforms_json,
        trailer_url,
        igdb_cover_url,
        steam_app_id,
        metacritic_score,
    ) = if config.mode == ProviderMode::Public {
        let details = resolver.get_game_details(db, igdb_id).await?.ok_or_else(|| {
            AppError::NotFound("game details not found".into())
        })?;
        let genres_json = serde_json::to_string(&details.game.genres).unwrap_or_else(|_| "[]".into());
        let platforms_json = serde_json::to_string(&details.game.platforms).unwrap_or_else(|_| "[]".into());
        (
            details.game.name,
            details.game.summary,
            details.developer,
            details.publisher,
            details.game.release_date,
            genres_json,
            platforms_json,
            details.trailer_url,
            details.game.cover_url,
            details.steam_app_id,
            details.metacritic_score,
        )
    } else {
        let (client_id, client_secret) = igdb_credentials(db)?;
        let token = igdb::get_access_token(&http.0, token_cache, &client_id, &client_secret).await?;
        let details = igdb::get_game_details(&http.0, &client_id, &token, igdb_id).await?;
        let genres_json = serde_json::to_string(&details.genres).unwrap_or_else(|_| "[]".into());
        let platforms_json = serde_json::to_string(&details.platforms).unwrap_or_else(|_| "[]".into());
        let igdb_cover_url = details
            .cover_image_id
            .as_deref()
            .map(|image_id| igdb::cover_image_url(image_id, "cover_big"));

        let steam_app_id = igdb::get_steam_app_id(&http.0, &client_id, &token, igdb_id)
            .await
            .ok()
            .flatten();
        let metacritic_score = match steam_app_id.as_deref() {
            Some(app_id) => {
                match crate::commands::metadata::steam_store::get_app_details(&http.0, app_id).await {
                    Ok(Some(steam)) => steam.metacritic_score,
                    _ => None,
                }
            }
            None => None,
        };

        (
            details.name,
            details.description,
            details.developer,
            details.publisher,
            details.release_date,
            genres_json,
            platforms_json,
            details.trailer_url,
            igdb_cover_url,
            steam_app_id,
            metacritic_score,
        )
    };

    if details_name.trim().is_empty() {
        return Err(AppError::Invalid("this entry has no name".into()));
    }

    let id = Uuid::new_v4().to_string();

    {
        let conn = db.connection.lock().expect("db mutex poisoned");

        let existing: Option<(String, bool)> = conn
            .query_row(
                "SELECT id, is_wishlist FROM games WHERE igdb_id = ?1 OR LOWER(name) = LOWER(?2) LIMIT 1",
                rusqlite::params![igdb_id, &details_name],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        match existing {
            // Promoting a wishlisted game to the library is the natural
            // "Add to Library" click on a game already tracked — flip
            // the flag rather than refusing.
            Some((existing_id, true)) if !is_wishlist => {
                conn.execute(
                    "UPDATE games SET is_wishlist = 0, steam_app_id = COALESCE(steam_app_id, ?1) WHERE id = ?2",
                    rusqlite::params![&steam_app_id, &existing_id],
                )?;
                let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
                return Ok(conn.query_row(&sql, [&existing_id], Game::from_row)?);
            }
            // The Ensure variant is the download manager's "give me a
            // library entry for this game" — an existing row is a hit,
            // not a conflict.
            Some((existing_id, _)) if mode == HubInsertMode::Ensure => {
                let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
                return Ok(conn.query_row(&sql, [&existing_id], Game::from_row)?);
            }
            Some(_) => {
                return Err(AppError::Invalid(
                    "this game is already in your library".into(),
                ));
            }
            None => {}
        }

        conn.execute(
            "INSERT INTO games (
                id, name, is_installed, source, igdb_id, is_wishlist,
                description, developer, publisher, release_date,
                genres, platforms, metacritic_score, trailer_url, steam_app_id
             ) VALUES (?1, ?2, 0, 'igdb_hub', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                &id,
                &details_name,
                igdb_id,
                is_wishlist,
                &details_description,
                &details_developer,
                &details_publisher,
                &details_release_date,
                &genres_json,
                &platforms_json,
                &metacritic_score,
                &trailer_url,
                &steam_app_id,
            ],
        )?;
    }

    crate::commands::metadata::spawn_hub_artwork_fetch(
        app.clone(),
        id.clone(),
        details_name,
        igdb_cover_url,
    );

    let conn = db.connection.lock().expect("db mutex poisoned");
    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Resolves (or creates) the library entry for a game the download
/// manager is about to fetch. Existing rows — including wishlist
/// entries, which get promoted — are returned as-is so a download can
/// never be blocked by a duplicate.
pub(crate) async fn ensure_library_game(
    app: &AppHandle,
    db: &Database,
    http: &HttpClient,
    token_cache: &IgdbTokenCache,
    igdb_id: i64,
) -> AppResult<Game> {
    insert_hub_game(app, db, http, token_cache, igdb_id, HubInsertMode::Ensure).await
}

/// Adds a hub game to the library as a not-installed entry. Text
/// metadata from IGDB is written immediately (the details were just
/// fetched for the page anyway); artwork is filled in the background by
/// the same SteamGridDB-first pipeline a manually-added game gets, with
/// IGDB's own cover as the fallback so the entry never sits coverless.
#[tauri::command]
pub async fn add_game_from_hub(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    igdb_id: i64,
) -> AppResult<Game> {
    insert_hub_game(&app, &db, &http, &token_cache, igdb_id, HubInsertMode::Library).await
}

/// The wishlist counterpart: same row and same metadata/artwork
/// pipeline, flagged `is_wishlist` so it shows in the Wishlist view and
/// stays out of the main library until promoted.
#[tauri::command]
pub async fn add_game_to_wishlist(
    app: AppHandle,
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    igdb_id: i64,
) -> AppResult<Game> {
    insert_hub_game(&app, &db, &http, &token_cache, igdb_id, HubInsertMode::Wishlist).await
}

const THEATER_INIT_SCRIPT: &str = r#"
    (function() {
        function inject() {
            if (document.getElementById('nexus-theater-style')) return;
            const style = document.createElement('style');
            style.id = 'nexus-theater-style';
            style.textContent = `
                #masthead-container, ytd-masthead, #masthead,
                #secondary, #below, #comments, #chat, #clarify-box,
                #meta, #info, ytd-merch-shelf-renderer,
                ytd-reel-shelf-renderer, #ticker, #guide, ytd-mini-guide-renderer,
                tp-yt-app-drawer, #voice-search-button, .ytp-chrome-top {
                    display: none !important;
                }
                html, body {
                    overflow: hidden !important;
                    background: #000 !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                #page-manager, ytd-app, #content, #player, #player-container, #movie_player, ytd-watch-flexy {
                    width: 100vw !important;
                    height: 100vh !important;
                    max-width: 100vw !important;
                    max-height: 100vh !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    position: fixed !important;
                    top: 0 !important;
                    left: 0 !important;
                    bottom: 0 !important;
                    right: 0 !important;
                }
                .html5-video-container, video {
                    width: 100% !important;
                    height: 100% !important;
                    object-fit: contain !important;
                }
            `;
            (document.head || document.documentElement).appendChild(style);
        }
        inject();
        document.addEventListener('DOMContentLoaded', inject);
        setInterval(inject, 500);
    })();
"#;

/// Opens a dedicated Google / YouTube login window in Tauri WebView2.
/// The session cookies (including YouTube age-verification) are persisted
/// across all WebView2 instances in the launcher.
/// Sized dynamically to fit comfortably within the user's screen without overflowing.
#[tauri::command]
pub async fn open_google_auth_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("google_auth") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let auth_url = "https://accounts.google.com/ServiceLogin?service=youtube&continue=https://www.youtube.com"
        .parse()
        .map_err(|err| AppError::Other(format!("invalid auth URL: {err}")))?;

    let (width, height) = if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = main_win.current_monitor() {
            let scale = monitor.scale_factor();
            let screen = monitor.size().to_logical::<f64>(scale);
            (
                480.0f64.min(screen.width * 0.85).max(360.0),
                580.0f64.min(screen.height * 0.80).max(460.0),
            )
        } else {
            (480.0, 580.0)
        }
    } else {
        (480.0, 580.0)
    };

    let app_handle = app.clone();
    let window = WebviewWindowBuilder::new(&app, "google_auth", WebviewUrl::External(auth_url))
        .title("Sign in to Google — YouTube Age Verification")
        .inner_size(width, height)
        .center()
        .focused(true)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            // When user finishes logging in and Google redirects back to YouTube, auth is complete!
            if url_str.starts_with("https://www.youtube.com")
                || url_str.starts_with("https://m.youtube.com")
            {
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(600)).await;
                    if let Some(w) = handle.get_webview_window("google_auth") {
                        let _ = w.close();
                    }
                    let _ = handle.emit("google-auth-success", ());
                });
                return true;
            }
            true
        })
        .build()
        .map_err(|err| AppError::Other(format!("could not open Google auth window: {err}")))?;

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

/// Opens an in-app player window for a YouTube trailer. Because this is a first-party
/// Webview window loading youtube.com (not an iframe), the user's logged-in Google session
/// plays age-restricted trailers directly with zero embed restrictions.
/// Sized responsively in 16:9 aspect ratio and stripped of YouTube clutter.
#[tauri::command]
pub async fn open_trailer_window(app: AppHandle, video_id: String, title: String) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("trailer_player") {
        let _ = window.close();
    }

    let watch_url = format!("https://www.youtube.com/watch?v={video_id}&autoplay=1")
        .parse()
        .map_err(|err| AppError::Other(format!("invalid trailer URL: {err}")))?;

    let (width, height) = if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = main_win.current_monitor() {
            let scale = monitor.scale_factor();
            let screen = monitor.size().to_logical::<f64>(scale);
            let max_w = (screen.width * 0.85).min(1080.0);
            let max_h = (screen.height * 0.82).min(640.0);
            let w = max_w.min(max_h * (16.0 / 9.0));
            let h = w * (9.0 / 16.0);
            (w.max(640.0), h.max(360.0))
        } else {
            (960.0, 540.0)
        }
    } else {
        (960.0, 540.0)
    };

    let window = WebviewWindowBuilder::new(&app, "trailer_player", WebviewUrl::External(watch_url))
        .title(format!("{title} — Official Trailer"))
        .initialization_script(THEATER_INIT_SCRIPT)
        .inner_size(width, height)
        .center()
        .focused(true)
        .build()
        .map_err(|err| AppError::Other(format!("could not open trailer player window: {err}")))?;

    let _ = window.show();
    let _ = window.set_focus();

    Ok(())
}

/// Attaches an in-app native child Webview directly inside the main launcher window.
/// Because this is a first-party native Webview loading youtube.com (not an iframe),
/// the user's logged-in Google session works and age-restricted trailers play directly.
/// Custom theater CSS is injected to strip all YouTube UI clutter (header, comments,
/// sidebar) and expand the video player to fill the exact container bounds.
#[tauri::command]
pub async fn mount_embedded_trailer(
    app: AppHandle,
    video_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> AppResult<()> {
    if let Some(child) = app.get_webview_window("trailer_child") {
        let _ = child.close();
    }

    let main_window = app
        .get_webview_window("main")
        .ok_or_else(|| AppError::Other("main window not found".into()))?;

    let scale_factor = main_window.scale_factor().unwrap_or(1.0);
    let main_pos = main_window
        .outer_position()
        .map(|p| p.to_logical::<f64>(scale_factor))
        .unwrap_or(tauri::LogicalPosition::new(0.0, 0.0));

    let screen_x = main_pos.x + x;
    let screen_y = main_pos.y + y;

    let watch_url = format!("https://www.youtube.com/watch?v={video_id}&autoplay=1")
        .parse()
        .map_err(|err| AppError::Other(format!("invalid trailer URL: {err}")))?;

    let child = WebviewWindowBuilder::new(&app, "trailer_child", WebviewUrl::External(watch_url))
        .initialization_script(THEATER_INIT_SCRIPT)
        .parent(&main_window)
        .map_err(|err| AppError::Other(err.to_string()))?
        .decorations(false)
        .position(screen_x, screen_y)
        .inner_size(width, height)
        .focused(true)
        .build()
        .map_err(|err| AppError::Other(format!("could not attach embedded trailer: {err}")))?;

    let _ = child.show();
    let _ = child.set_focus();

    Ok(())
}

/// Unmounts and destroys the in-app native child Webview if it is currently active.
#[tauri::command]
pub async fn unmount_embedded_trailer(app: AppHandle) -> AppResult<()> {
    if let Some(child) = app.get_webview_window("trailer_child") {
        let _ = child.close();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{release_clause, sort_clause};

    const NOW: i64 = 1_750_000_000;

    #[test]
    fn release_clause_presets_map_to_windows() {
        assert_eq!(
            release_clause(Some("upcoming"), NOW).unwrap().unwrap(),
            format!("first_release_date > {NOW}")
        );
        let recent = release_clause(Some("new"), NOW).unwrap().unwrap();
        assert!(recent.starts_with("first_release_date > "));
        assert!(recent.ends_with(&format!(" & first_release_date < {NOW}")));
        assert_eq!(release_clause(None, NOW).unwrap(), None);
        assert_eq!(release_clause(Some("  "), NOW).unwrap(), None);
    }

    #[test]
    fn release_clause_years_are_bounded() {
        let year = release_clause(Some("2025"), NOW).unwrap().unwrap();
        assert!(year.contains("first_release_date >= "));
        assert!(year.contains(" & first_release_date < "));
        // 2025-01-01 UTC in timestamps is Jan 1, not Dec 31 of 2024.
        assert!(!year.contains("173560"));

        assert!(release_clause(Some("bogus"), NOW).is_err());
        assert!(release_clause(Some("1899"), NOW).is_err());
        assert!(release_clause(Some("2150"), NOW).is_err());
    }

    #[test]
    fn release_clause_ranges_map_to_spans() {
        let range = release_clause(Some("2005-2010"), NOW).unwrap().unwrap();
        assert!(range.contains("first_release_date >= "));
        assert!(range.contains(" & first_release_date < "));

        // Inverted range gets normalized (2010-2005 behaves same as 2005-2010)
        let inverted = release_clause(Some("2010-2005"), NOW).unwrap().unwrap();
        assert_eq!(range, inverted);

        // Open-ended range 2005+
        let open_ended = release_clause(Some("2005+"), NOW).unwrap().unwrap();
        assert!(open_ended.starts_with("first_release_date >= "));
        assert!(!open_ended.contains('&'));

        // Open-ended range -2010
        let upper_bound = release_clause(Some("-2010"), NOW).unwrap().unwrap();
        assert!(upper_bound.starts_with("first_release_date < "));
        assert!(!upper_bound.contains('&'));
    }

    #[test]
    fn sort_clause_is_a_whitelist() {
        assert_eq!(
            sort_clause(Some("rating")).unwrap().unwrap(),
            "aggregated_rating desc"
        );
        assert_eq!(sort_clause(Some("name")).unwrap().unwrap(), "name asc");
        assert_eq!(sort_clause(None).unwrap(), None);
        assert_eq!(sort_clause(Some("")).unwrap(), None);
        assert!(sort_clause(Some("name; DROP TABLE games")).is_err());
    }
}
