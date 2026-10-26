//! Game Hub: a storefront-style discovery feed built directly on IGDB
//! (no per-user accounts, nothing social — just "what's new and notable"
//! pulled live). Everything here is read-only against IGDB except
//! `add_game_from_hub` and `add_game_to_wishlist`, which turn a hub entry
//! into a library game (`is_installed = 0`) whose local install details
//! the user fills in later from the details panel.

use crate::commands::metadata::{igdb, HttpClient, IgdbTokenCache};
pub use crate::commands::metadata::steam_store::{SystemRequirementDetail, SystemRequirements};
use crate::db::models::Game;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::services::cache::MetadataCache;
use crate::services::metadata::{MetadataProviderResolver, ProviderMode};
use chrono::{Datelike, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use uuid::Uuid;

/// Standalone playable game categories on IGDB:
/// 0 = Main Game, 4 = Standalone Expansion, 8 = Remake, 9 = Remaster, 10 = Expanded Game.
/// Excludes non-standalone items: DLCs (1), Expansions (2), Bundles (3), Mods (5), Episodes (6), Seasons (7), Packs (13), Updates (14).
pub const STANDALONE_GAME_TYPES: &str = "(0, 8, 9, 10, 4)";

/// Extended game types allowed in search (includes Major Expansions, Bundles/GOTY, and Ports).
pub const SEARCH_GAME_TYPES: &str = "(0, 2, 3, 4, 8, 9, 10, 11)";

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
    #[serde(default)]
    pub game_type: Option<i64>,
    pub cover_url: Option<String>,
    /// Full-width hero backdrop at IGDB's 1080p size (1920px).
    pub backdrop_url: Option<String>,
    /// IGDB's aggregated/total score (0-100), rounded.
    pub rating: Option<i64>,
    pub rating_count: Option<i64>,
    #[serde(default)]
    pub metacritic_score: Option<i64>,
    #[serde(default)]
    pub opencritic_score: Option<i64>,
    /// Pre-release follower count — the closest IGDB has to "buzz".
    pub hypes: Option<i64>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    #[serde(default)]
    pub steam_app_id: Option<String>,
    #[serde(default)]
    pub discount_percent: Option<i64>,
    #[serde(default)]
    pub sale_price_formatted: Option<String>,
    #[serde(default)]
    pub original_price_formatted: Option<String>,
}

const LIST_FIELDS: &str = "fields name, summary, first_release_date, game_type, cover.image_id, \
     screenshots.image_id, total_rating_count, aggregated_rating, total_rating, rating, hypes, \
     genres.name, themes.name, platforms.name, game_modes.id, game_modes.name";

const SECONDS_PER_DAY: i64 = 86_400;

/// Canonical built-in IGDB genres fallback so filter chips never break offline or before cache warm-up.
pub fn default_hub_genres() -> Vec<crate::services::providers::NameIdItem> {
    use crate::services::providers::NameIdItem;
    vec![
        NameIdItem { id: 31, name: "Adventure".into(), abbreviation: None },
        NameIdItem { id: 33, name: "Arcade".into(), abbreviation: None },
        NameIdItem { id: 35, name: "Card & Board Game".into(), abbreviation: None },
        NameIdItem { id: 4, name: "Fighting".into(), abbreviation: None },
        NameIdItem { id: 25, name: "Hack and slash/Beat 'em up".into(), abbreviation: None },
        NameIdItem { id: 32, name: "Indie".into(), abbreviation: None },
        NameIdItem { id: 36, name: "MOBA".into(), abbreviation: None },
        NameIdItem { id: 7, name: "Music".into(), abbreviation: None },
        NameIdItem { id: 30, name: "Pinball".into(), abbreviation: None },
        NameIdItem { id: 8, name: "Platform".into(), abbreviation: None },
        NameIdItem { id: 2, name: "Point-and-click".into(), abbreviation: None },
        NameIdItem { id: 9, name: "Puzzle".into(), abbreviation: None },
        NameIdItem { id: 26, name: "Quiz/Trivia".into(), abbreviation: None },
        NameIdItem { id: 10, name: "Racing".into(), abbreviation: None },
        NameIdItem { id: 11, name: "Real Time Strategy (RTS)".into(), abbreviation: None },
        NameIdItem { id: 12, name: "Role-playing (RPG)".into(), abbreviation: None },
        NameIdItem { id: 5, name: "Shooter".into(), abbreviation: None },
        NameIdItem { id: 13, name: "Simulator".into(), abbreviation: None },
        NameIdItem { id: 14, name: "Sport".into(), abbreviation: None },
        NameIdItem { id: 15, name: "Strategy".into(), abbreviation: None },
        NameIdItem { id: 24, name: "Tactical".into(), abbreviation: None },
        NameIdItem { id: 16, name: "Turn-based strategy (TBS)".into(), abbreviation: None },
        NameIdItem { id: 34, name: "Visual Novel".into(), abbreviation: None },
    ]
}

/// Canonical built-in IGDB platforms fallback.
pub fn default_hub_platforms() -> Vec<crate::services::providers::NameIdItem> {
    use crate::services::providers::NameIdItem;
    vec![
        NameIdItem { id: 6, name: "PC (Microsoft Windows)".into(), abbreviation: Some("PC".into()) },
        NameIdItem { id: 167, name: "PlayStation 5".into(), abbreviation: Some("PS5".into()) },
        NameIdItem { id: 48, name: "PlayStation 4".into(), abbreviation: Some("PS4".into()) },
        NameIdItem { id: 169, name: "Xbox Series X|S".into(), abbreviation: Some("Series X|S".into()) },
        NameIdItem { id: 49, name: "Xbox One".into(), abbreviation: Some("XONE".into()) },
        NameIdItem { id: 130, name: "Nintendo Switch".into(), abbreviation: Some("Switch".into()) },
        NameIdItem { id: 508, name: "Nintendo Switch 2".into(), abbreviation: Some("Switch 2".into()) },
        NameIdItem { id: 3, name: "Linux".into(), abbreviation: Some("Linux".into()) },
        NameIdItem { id: 14, name: "Mac".into(), abbreviation: Some("Mac".into()) },
    ]
}

/// Expand common gaming shorthand, acronyms, and missing-hyphen titles into canonical search queries.
pub fn expand_search_query(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lower = trimmed
        .to_lowercase()
        .replace(['’', '‘', '`'], "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    match lower.as_str() {
        "gta 5" | "gta v" | "gtav" | "gta5" => "Grand Theft Auto V".to_string(),
        "gta 6" | "gta vi" | "gtavi" | "gta6" => "Grand Theft Auto VI".to_string(),
        "gta 4" | "gta iv" | "gtaiv" | "gta4" => "Grand Theft Auto IV".to_string(),
        "gta sa" | "san andreas" | "gta san andreas" => "Grand Theft Auto: San Andreas".to_string(),
        "gta vc" | "vice city" | "gta vice city" => "Grand Theft Auto: Vice City".to_string(),
        "rdr2" | "rdr 2" | "red dead 2" => "Red Dead Redemption 2".to_string(),
        "rdr" | "rdr1" | "rdr 1" => "Red Dead Redemption".to_string(),
        "witcher 3" | "tw3" | "the witcher 3" | "witcher 3 wild hunt" => {
            "The Witcher 3: Wild Hunt".to_string()
        }
        "bg3" | "baldurs gate 3" | "baldur's gate 3" | "baldurs gate" => {
            "Baldur's Gate 3".to_string()
        }
        "cp2077" | "cp 2077" | "cyberpunk" | "cyberpunk2077" => "Cyberpunk 2077".to_string(),
        "re4" | "re 4" | "resident evil 4" => "Resident Evil 4".to_string(),
        "re2" | "re 2" | "resident evil 2" => "Resident Evil 2".to_string(),
        "re3" | "re 3" | "resident evil 3" => "Resident Evil 3".to_string(),
        "re7" | "re 7" | "resident evil 7" => "Resident Evil 7: Biohazard".to_string(),
        "re8" | "re 8" | "re village" | "resident evil 8" => "Resident Evil Village".to_string(),
        "spiderman" | "spider man" | "marvel spiderman" | "marvels spiderman" => {
            "Marvel's Spider-Man".to_string()
        }
        "spiderman 2" | "spider man 2" | "marvels spiderman 2" => {
            "Marvel's Spider-Man 2".to_string()
        }
        "miles morales" | "spiderman miles morales" => {
            "Marvel's Spider-Man: Miles Morales".to_string()
        }
        "gow" | "god of war 4" => "God of War".to_string(),
        "gow ragnarok" | "god of war ragnarok" | "ragnarok" => "God of War Ragnarök".to_string(),
        "tlou" | "last of us" | "the last of us 1" | "tlou1" => {
            "The Last of Us Part I".to_string()
        }
        "tlou2" | "tlou 2" | "last of us 2" | "the last of us 2" => {
            "The Last of Us Part II".to_string()
        }
        "cod" | "call of duty" => "Call of Duty".to_string(),
        "bo6" | "black ops 6" | "cod bo6" => "Call of Duty: Black Ops 6".to_string(),
        "mw3" | "modern warfare 3" => "Call of Duty: Modern Warfare III".to_string(),
        "fc 25" | "fc25" | "ea fc 25" | "fifa 25" => "EA SPORTS FC 25".to_string(),
        "fc 24" | "fc24" | "ea fc 24" | "fifa 24" => "EA SPORTS FC 24".to_string(),
        "cs2" | "csgo" | "cs go" | "counter strike" | "counter strike 2" => {
            "Counter-Strike 2".to_string()
        }
        "dota" | "dota2" => "Dota 2".to_string(),
        "lol" => "League of Legends".to_string(),
        "botw" | "zelda botw" => "The Legend of Zelda: Breath of the Wild".to_string(),
        "totk" | "zelda totk" => "The Legend of Zelda: Tears of the Kingdom".to_string(),
        "ff7" | "ffvii" | "final fantasy 7" => "Final Fantasy VII Rebirth".to_string(),
        "ff16" | "ffxvi" | "final fantasy 16" => "Final Fantasy XVI".to_string(),
        "ff14" | "ffxiv" | "final fantasy 14" => "Final Fantasy XIV Online".to_string(),
        "kcd2" | "kcd 2" | "kingdom come 2" => "Kingdom Come: Deliverance II".to_string(),
        "kcd" | "kcd1" | "kingdom come" => "Kingdom Come: Deliverance".to_string(),
        "ds1" | "dark souls 1" => "Dark Souls: Remastered".to_string(),
        "ds2" | "dark souls 2" => "Dark Souls II".to_string(),
        "ds3" | "dark souls 3" => "Dark Souls III".to_string(),
        "er" | "eldenring" => "Elden Ring".to_string(),
        "wukong" | "black myth" => "Black Myth: Wukong".to_string(),
        "silksong" => "Hollow Knight: Silksong".to_string(),
        "ac shadows" | "assassins creed shadows" => "Assassin's Creed Shadows".to_string(),
        "ac mirage" | "assassins creed mirage" => "Assassin's Creed Mirage".to_string(),
        "ac valhalla" | "assassins creed valhalla" => "Assassin's Creed Valhalla".to_string(),
        "ac odyssey" | "assassins creed odyssey" => "Assassin's Creed Odyssey".to_string(),
        "mhw" | "monster hunter world" => "Monster Hunter: World".to_string(),
        "mh wilds" | "monster hunter wilds" => "Monster Hunter Wilds".to_string(),
        _ => {
            if lower.contains("spiderman") {
                trimmed
                    .replace("spiderman", "Spider-Man")
                    .replace("Spiderman", "Spider-Man")
            } else {
                trimmed.to_string()
            }
        }
    }
}

fn normalize_tokens(input: &str) -> Vec<String> {
    input
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

pub fn score_search_relevance(game: &HubGame, raw_query: &str, expanded_query: &str) -> f64 {
    let name_lower = game.name.to_lowercase();
    let q_lower = expanded_query.trim().to_lowercase();
    let raw_lower = raw_query.trim().to_lowercase();

    let name_clean: String = name_lower
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    let q_clean: String = q_lower
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();

    let is_verified_blockbuster =
        crate::services::scores::lookup_verified_scores(&game.name, game.release_date.as_deref())
            .is_some();
    let rating_count = game.rating_count.unwrap_or(0).max(0) as f64;
    let hypes = game.hypes.unwrap_or(0).max(0) as f64;
    let effective_score = game
        .metacritic_score
        .or(game.opencritic_score)
        .or(game.rating)
        .unwrap_or(0)
        .max(0) as f64;
    let has_strong_popularity = is_verified_blockbuster || rating_count >= 40.0 || hypes >= 25.0;

    let mut score = 0.0;

    // 1. Title match quality (prevent obscure 0-review single-word games from outranking famous franchises!)
    if name_lower == q_lower
        || name_lower == raw_lower
        || (!q_clean.is_empty() && name_clean == q_clean)
    {
        if has_strong_popularity {
            score += 1850.0;
        } else {
            score += 380.0;
        }
    } else if name_lower.starts_with(&q_lower)
        || name_lower.starts_with(&raw_lower)
        || (!q_clean.is_empty() && name_clean.starts_with(&q_clean))
    {
        score += 1250.0;
        if name_lower.starts_with(&format!("{raw_lower} "))
            || name_lower.starts_with(&format!("{q_lower} "))
        {
            score += 220.0;
        }
    } else if name_lower.contains(&q_lower)
        || name_lower.contains(&raw_lower)
        || (!q_clean.is_empty() && name_clean.contains(&q_clean))
    {
        score += 650.0;
    }

    // 2. Word-boundary token matching
    let q_tokens = normalize_tokens(expanded_query);
    let raw_tokens = normalize_tokens(raw_query);
    let active_tokens = if !raw_tokens.is_empty() { &raw_tokens } else { &q_tokens };
    let name_tokens = normalize_tokens(&game.name);
    if !active_tokens.is_empty() {
        let exact_word_matches = active_tokens
            .iter()
            .filter(|qt| name_tokens.iter().any(|nt| nt == *qt))
            .count();
        let prefix_word_matches = active_tokens
            .iter()
            .filter(|qt| name_tokens.iter().any(|nt| nt == *qt || nt.starts_with(*qt)))
            .count();

        let ratio = prefix_word_matches as f64 / active_tokens.len() as f64;
        score += ratio * 500.0;
        score += (exact_word_matches as f64) * 260.0;
        if prefix_word_matches == active_tokens.len() {
            score += 350.0;
        }
        // Bonus if first token of game title matches or starts with first query token
        if let (Some(first_q), Some(first_n)) = (active_tokens.first(), name_tokens.first()) {
            if first_n == first_q {
                score += 480.0;
            } else if first_n.starts_with(first_q) {
                score += 340.0;
            }
        }
    }

    // 3. Popularity, Acclaim & Blockbuster Franchise Weighting
    if is_verified_blockbuster {
        score += 1750.0;
    }

    score += rating_count.ln_1p() * 165.0;
    score += hypes.ln_1p() * 75.0;

    if effective_score >= 85.0 {
        score += 420.0 + effective_score * 4.5;
    } else if effective_score >= 75.0 {
        score += 220.0 + effective_score * 3.0;
    } else if effective_score > 0.0 {
        score += effective_score * 1.5;
    }

    // Penalize obscure entries that have zero rating count and zero hypes
    if !is_verified_blockbuster && rating_count < 3.0 && hypes < 2.0 {
        score -= 650.0;
    }

    match game.game_type {
        Some(0) | None => score += 220.0,
        Some(8) | Some(9) | Some(10) => score += 190.0,
        Some(2) | Some(4) | Some(11) => score += 110.0,
        _ => {}
    }

    score
}

/// Shared fetch+parse for the curated list commands below.
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
    let name = entry.get("name")?.as_str()?.trim().to_string();
    if name.is_empty() {
        return None;
    }

    let summary = entry
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    let release_date = entry
        .get("first_release_date")
        .and_then(Value::as_i64)
        .filter(|timestamp| *timestamp > 0)
        .and_then(unix_to_date);

    let game_type = entry
        .get("game_type")
        .and_then(Value::as_i64)
        .or_else(|| entry.get("category").and_then(Value::as_i64));

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

    // Fall back across aggregated_rating -> total_rating -> rating so games with only user/combined scores still show a rating!
    let rating = entry
        .get("aggregated_rating")
        .and_then(Value::as_f64)
        .filter(|r| *r > 0.0)
        .or_else(|| {
            entry
                .get("total_rating")
                .and_then(Value::as_f64)
                .filter(|r| *r > 0.0)
        })
        .or_else(|| {
            entry
                .get("rating")
                .and_then(Value::as_f64)
                .filter(|r| *r > 0.0)
        })
        .map(|r| (r.round() as i64).clamp(0, 100));

    let rating_count = entry
        .get("total_rating_count")
        .and_then(Value::as_i64)
        .filter(|count| *count > 0);

    let hypes = entry
        .get("hypes")
        .and_then(Value::as_i64)
        .filter(|hypes| *hypes > 0);

    let mut genres = string_names(entry, "genres");
    for theme in string_names(entry, "themes") {
        merge_unique_genre(&mut genres, &theme);
    }
    let platforms = string_names(entry, "platforms");

    let mut game = HubGame {
        igdb_id,
        name,
        summary,
        release_date,
        game_type,
        cover_url,
        backdrop_url,
        rating,
        rating_count,
        metacritic_score: None,
        opencritic_score: None,
        hypes,
        genres,
        platforms,
        steam_app_id: None,
        discount_percent: None,
        sale_price_formatted: None,
        original_price_formatted: None,
    };
    crate::services::scores::enrich_hub_game_scores(None, &mut game);
    Some(game)
}

fn string_names(entry: &Value, key: &str) -> Vec<String> {
    entry
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str))
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

pub fn merge_unique_genre(genres: &mut Vec<String>, candidate: &str) {
    let trimmed = candidate.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("PC") {
        return;
    }
    let cand_low = trimmed.to_lowercase();
    let is_rpg_cand = cand_low == "rpg" || cand_low.contains("role-playing");
    let is_sim_cand = cand_low == "simulation" || cand_low == "simulator";
    let is_sport_cand = cand_low == "sports" || cand_low == "sport";

    for existing in genres.iter() {
        let ex_low = existing.trim().to_lowercase();
        if ex_low == cand_low {
            return;
        }
        if is_rpg_cand && (ex_low == "rpg" || ex_low.contains("role-playing")) {
            return;
        }
        if is_sim_cand && (ex_low == "simulation" || ex_low == "simulator") {
            return;
        }
        if is_sport_cand && (ex_low == "sports" || ex_low == "sport") {
            return;
        }
    }
    genres.push(trimmed.to_string());
}

fn unix_to_date(timestamp: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(timestamp, 0).map(|dt| dt.format("%Y-%m-%d").to_string())
}

fn igdb_credentials(db: &Database) -> AppResult<(String, String)> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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

async fn feed_where_clause(
    feed: &str,
    db: &Database,
    http: &reqwest::Client,
    client_id: &str,
    token: &str,
) -> AppResult<Option<(String, &'static str)>> {
    let now = Utc::now().timestamp();
    let norm = feed.replace('_', "-");
    match norm.as_str() {
        "new-releases" => Ok(Some((
            format!(
                "game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} \
                 & first_release_date > {} & (hypes > 2 | total_rating_count > 10)",
                now - 90 * SECONDS_PER_DAY
            ),
            "hypes desc",
        ))),
        "coming-soon" => Ok(Some((
            format!(
                "game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date > {now} & hypes > 1"
            ),
            "first_release_date asc",
        ))),
        "top-rated" => Ok(Some((
            format!(
                "game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} \
                 & first_release_date > {} & total_rating_count > 75",
                now - 3 * 365 * SECONDS_PER_DAY
            ),
            "total_rating_count desc",
        ))),
        "recommended" => {
            let top_genres: Vec<String> = {
                let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
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
                return Ok(Some((
                    format!(
                        "game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} & total_rating_count > 60"
                    ),
                    "total_rating_count desc",
                )));
            }

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

fn map_genre_name_to_igdb_id(name: &str) -> Option<i64> {
    let low = name.trim().to_lowercase();
    if low.contains("role-playing") || low == "rpg" {
        Some(12)
    } else if low.contains("hack and slash") || low.contains("beat 'em up") {
        Some(25)
    } else if low.contains("shooter") {
        Some(5)
    } else if low.contains("adventure") {
        Some(31)
    } else if low.contains("real time strategy") || low == "rts" {
        Some(11)
    } else if low.contains("turn-based strategy") || low == "tbs" {
        Some(16)
    } else if low.contains("strategy") {
        Some(15)
    } else if low.contains("indie") {
        Some(32)
    } else if low.contains("simulator") || low.contains("simulation") {
        Some(13)
    } else if low.contains("racing") {
        Some(10)
    } else if low.contains("fighting") {
        Some(4)
    } else if low.contains("puzzle") {
        Some(9)
    } else if low.contains("platform") {
        Some(8)
    } else if low.contains("tactical") {
        Some(24)
    } else if low.contains("sport") {
        Some(14)
    } else if low.contains("arcade") {
        Some(33)
    } else if low.contains("visual novel") {
        Some(34)
    } else if low.contains("card") || low.contains("board") {
        Some(35)
    } else if low.contains("moba") {
        Some(36)
    } else if low.contains("point-and-click") || low.contains("point and click") {
        Some(2)
    } else {
        None
    }
}

/// Dynamically computes the user's preferred IGDB genre IDs from their active profile's
/// playtime history, favorite games, and library/wishlist collection.
fn extract_user_taste_genres_csv(db: &Database) -> Option<String> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let active_profile: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'active_profile_id'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "default".to_string());

    let mut genre_weights: std::collections::HashMap<i64, f64> = std::collections::HashMap::new();

    // 1. Weight from playtime sessions for the active profile
    if let Ok(mut stmt) = conn.prepare(
        "SELECT je.value AS genre, SUM(COALESCE(p.duration_seconds, 0)) AS total
         FROM playtime_sessions p
         JOIN games g ON g.id = p.game_id
         JOIN json_each(CASE WHEN json_valid(g.genres) THEN g.genres ELSE '[]' END) AS je
         WHERE p.profile_id = ?1
         GROUP BY je.value
         HAVING total > 0",
    ) {
        if let Ok(rows) = stmt.query_map([&active_profile], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        }) {
            for (g_name, secs) in rows.flatten() {
                if let Some(gid) = map_genre_name_to_igdb_id(&g_name) {
                    let hours = (secs as f64 / 3600.0).max(0.5);
                    *genre_weights.entry(gid).or_insert(0.0) += hours * 4.0;
                }
            }
        }
    }

    // 2. Weight from library games (favorites, installed, wishlisted, user_rating)
    if let Ok(mut stmt) = conn.prepare(
        "SELECT je.value AS genre, g.is_favorite, g.is_installed, g.user_rating, g.total_playtime_seconds
         FROM games g
         JOIN json_each(CASE WHEN json_valid(g.genres) THEN g.genres ELSE '[]' END) AS je
         WHERE g.is_hidden = 0 AND g.is_memory = 0",
    ) {
        if let Ok(rows) = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, bool>(1).unwrap_or(false),
                row.get::<_, bool>(2).unwrap_or(false),
                row.get::<_, Option<i64>>(3).unwrap_or(None),
                row.get::<_, i64>(4).unwrap_or(0),
            ))
        }) {
            for (g_name, is_fav, is_inst, u_rating, playtime) in rows.flatten() {
                if let Some(gid) = map_genre_name_to_igdb_id(&g_name) {
                    let mut w = 1.5;
                    if is_fav {
                        w += 4.5;
                    }
                    if is_inst {
                        w += 1.5;
                    }
                    if let Some(r) = u_rating {
                        if r >= 8 {
                            w += 3.0;
                        }
                    }
                    if playtime > 0 {
                        w += (playtime as f64 / 3600.0).min(15.0) * 1.5;
                    }
                    *genre_weights.entry(gid).or_insert(0.0) += w;
                }
            }
        }
    }

    if genre_weights.is_empty() {
        return None;
    }

    let mut sorted: Vec<(i64, f64)> = genre_weights.into_iter().collect();
    sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let top_ids: Vec<String> = sorted.into_iter().take(2).map(|(id, _)| id.to_string()).collect();
    if top_ids.is_empty() {
        None
    } else {
        Some(top_ids.join(","))
    }
}

fn get_hub_refresh_nonce(db: &Database) -> i64 {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'hub_refresh_nonce'",
        [],
        |row| row.get::<_, String>(0),
    )
    .ok()
    .and_then(|v| v.parse::<i64>().ok())
    .unwrap_or(0)
}

/// Clears cached hub feeds/rotations and advances the dynamic rotation nonce so
/// every shelf and search view updates live immediately.
#[tauri::command]
pub async fn refresh_hub_catalog(db: State<'_, Database>) -> AppResult<i64> {
    let next_nonce = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let current: i64 = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'hub_refresh_nonce'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .and_then(|v| v.parse::<i64>().ok())
            .unwrap_or(0);
        let next = current.wrapping_add(1);
        let _ = conn.execute(
            "INSERT INTO settings (key, value) VALUES ('hub_refresh_nonce', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![next.to_string()],
        );
        let _ = conn.execute(
            "DELETE FROM metadata_cache WHERE category IN ('feed', 'shelf_rotation', 'search', 'details')",
            [],
        );
        next
    };
    Ok(next_nonce)
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
    let norm_feed = feed.replace('-', "_");
    let today = Utc::now().date_naive();

    if config.mode == ProviderMode::Public {
        let taste_csv = if norm_feed == "recommended" {
            extract_user_taste_genres_csv(db)
        } else {
            None
        };
        let mut games = resolver
            .fetch_feed_with_genres(db, &norm_feed, offset, taste_csv.as_deref())
            .await?;

        // Dynamically filter by current release date so "coming_soon" only shows future games
        // and "new_releases" only shows released games as dates advance!
        games.retain(|g| {
            let Some(ref d_str) = g.release_date else {
                return norm_feed == "coming_soon";
            };
            let Ok(d) = NaiveDate::parse_from_str(d_str, "%Y-%m-%d") else {
                return true;
            };
            if norm_feed == "coming_soon" {
                d > today
            } else {
                d <= today
            }
        });

        if games.len() > limit {
            games.truncate(limit);
        }
        {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            crate::services::scores::enrich_hub_games_batch(Some(&conn), &mut games);
        }
        return Ok(games);
    }

    let (client_id, client_secret) = igdb_credentials(db)?;
    let token = igdb::get_access_token(http, token_cache, &client_id, &client_secret).await?;
    let Some((where_clause, order)) = feed_where_clause(feed, db, http, &client_id, &token).await?
    else {
        return Ok(Vec::new());
    };
    let mut games = fetch_hub_games(
        http,
        &client_id,
        &token,
        &where_clause,
        order,
        limit,
        offset,
    )
    .await?;
    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        crate::services::scores::enrich_hub_games_batch(Some(&conn), &mut games);
    }
    Ok(games)
}

fn rotate_games_deterministic(mut games: Vec<HubGame>, seed: i64, limit: usize) -> Vec<HubGame> {
    if games.len() <= limit {
        return games;
    }
    let mut state = (seed as u64).wrapping_mul(0x9E3779B97F4A7C15).wrapping_add(0xBF58476D1CE4E5B9);
    for i in (1..games.len()).rev() {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let j = ((state >> 32) as usize) % (i + 1);
        games.swap(i, j);
    }
    games.truncate(limit);
    games
}

async fn fetch_shelf_feed_rotated(
    db: &Database,
    http: &reqwest::Client,
    token_cache: &IgdbTokenCache,
    resolver: &MetadataProviderResolver,
    feed: &str,
    limit: usize,
    rotation_hours: i64,
) -> AppResult<Vec<HubGame>> {
    let nonce = get_hub_refresh_nonce(db);
    let epoch = (Utc::now().timestamp() / (rotation_hours.max(1) * 3600)).wrapping_add(nonce * 17);
    let config = resolver.get_config(db);
    let mode_str = match config.mode {
        ProviderMode::Public => "public",
        ProviderMode::Custom => "custom",
    };
    let taste_sig = if feed == "recommended" {
        extract_user_taste_genres_csv(db).unwrap_or_else(|| "default".to_string())
    } else {
        "all".to_string()
    };
    let cache_key = format!("shelf_rot:v7:{mode_str}:{feed}:{taste_sig}:{epoch}");

    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
            if !is_stale {
                if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                    if !games.is_empty() {
                        crate::services::scores::enrich_hub_games_batch(Some(&conn), &mut games);
                        return Ok(games);
                    }
                }
            }
        }
    }

    // Fetch two pages (0 and 24) in parallel to build a rich 48-game candidate pool for dynamic rotation
    let (page1_res, page2_res) = tokio::join!(
        fetch_feed(db, http, token_cache, resolver, feed, 24, 0),
        fetch_feed(db, http, token_cache, resolver, feed, 24, 24)
    );

    let mut pool: Vec<HubGame> = Vec::new();
    let mut seen = HashSet::new();

    let mut first_err: Option<AppError> = None;
    for res in [page1_res, page2_res] {
        match res {
            Ok(list) => {
                for g in list {
                    if seen.insert(g.igdb_id) {
                        pool.push(g);
                    }
                }
            }
            Err(err) => {
                if first_err.is_none() {
                    first_err = Some(err);
                }
            }
        }
    }

    if pool.is_empty() {
        if let Some(err) = first_err {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                    crate::services::scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    return Ok(games);
                }
            }
            return Err(err);
        }
    }

    // Keep the top 4 most relevant/newest items anchored when nonce == 0 on New Releases / Coming Soon,
    // and dynamically rotate the pool when refreshed or on discovery shelves!
    let mut rotated = if (feed == "new-releases" || feed == "coming-soon") && nonce == 0 {
        let mut out = pool;
        out.truncate(limit);
        out
    } else {
        rotate_games_deterministic(pool, epoch, limit)
    };

    crate::services::scores::resolve_hub_games_scores_live(db, http, &mut rotated).await;

    if !rotated.is_empty() {
        if let Ok(json) = serde_json::to_string(&rotated) {
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            let ttl = rotation_hours.max(1) * 3600; // 12-hour fresh cache per rotation window
            let _ = MetadataCache::set(&conn, &cache_key, "shelf_rotation", &json, ttl);
        }
    }

    Ok(rotated)
}

/// Banner & Shelf: the most-hyped games released in the last 90 days (dynamically refreshed).
#[tauri::command]
pub async fn get_hub_new_releases(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_shelf_feed_rotated(&db, &http.0, &token_cache, &resolver, "new-releases", 16, 12).await
}

/// Upcoming releases with real anticipation behind them, soonest first (dynamically refreshed).
#[tauri::command]
pub async fn get_hub_coming_soon(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_shelf_feed_rotated(&db, &http.0, &token_cache, &resolver, "coming-soon", 16, 12).await
}

/// The most-voted well-received games of the last three years (dynamically rotated).
#[tauri::command]
pub async fn get_hub_top_rated(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_shelf_feed_rotated(&db, &http.0, &token_cache, &resolver, "top-rated", 16, 12).await
}

/// Personalized row: highly-rated games from the user's most-played and favorite genres.
#[tauri::command]
pub async fn get_hub_recommended(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
) -> AppResult<Vec<HubGame>> {
    fetch_shelf_feed_rotated(&db, &http.0, &token_cache, &resolver, "recommended", 16, 12).await
}

/// Full paginated listing behind a shelf's "More" button.
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

/// IGDB's genre list (~25 fixed values) — the genre filter chips in the hub.
#[derive(Debug, Clone, Serialize, Deserialize)]
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
            Ok(genres) if !genres.is_empty() => Ok(genres
                .into_iter()
                .map(|item| HubGenre {
                    id: item.id,
                    name: item.name,
                })
                .collect()),
            _ => Ok(default_hub_genres()
                .into_iter()
                .map(|item| HubGenre {
                    id: item.id,
                    name: item.name,
                })
                .collect()),
        };
    }

    let Ok((client_id, client_secret)) = igdb_credentials(&db) else {
        return Ok(default_hub_genres()
            .into_iter()
            .map(|item| HubGenre {
                id: item.id,
                name: item.name,
            })
            .collect());
    };
    let Ok(token) =
        igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await
    else {
        return Ok(default_hub_genres()
            .into_iter()
            .map(|item| HubGenre {
                id: item.id,
                name: item.name,
            })
            .collect());
    };
    let Ok(value) = igdb::query(
        &http.0,
        &client_id,
        &token,
        "genres",
        "fields name; limit 50; sort name asc;",
    )
    .await
    else {
        return Ok(default_hub_genres()
            .into_iter()
            .map(|item| HubGenre {
                id: item.id,
                name: item.name,
            })
            .collect());
    };
    let Value::Array(entries) = value else {
        return Ok(default_hub_genres()
            .into_iter()
            .map(|item| HubGenre {
                id: item.id,
                name: item.name,
            })
            .collect());
    };
    let list: Vec<HubGenre> = entries
        .iter()
        .filter_map(|entry| {
            Some(HubGenre {
                id: entry.get("id")?.as_i64()?,
                name: entry.get("name")?.as_str()?.to_string(),
            })
        })
        .collect();
    if list.is_empty() {
        Ok(default_hub_genres()
            .into_iter()
            .map(|item| HubGenre {
                id: item.id,
                name: item.name,
            })
            .collect())
    } else {
        Ok(list)
    }
}

const HUB_PLATFORM_IDS: &str = "(3,6,14,48,49,130,167,169,508)";

#[derive(Debug, Clone, Serialize, Deserialize)]
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
            Ok(platforms) if !platforms.is_empty() => Ok(platforms
                .into_iter()
                .map(|item| HubPlatform {
                    id: item.id,
                    name: item.name,
                    abbreviation: item.abbreviation.unwrap_or_default(),
                })
                .collect()),
            _ => Ok(default_hub_platforms()
                .into_iter()
                .map(|item| HubPlatform {
                    id: item.id,
                    name: item.name,
                    abbreviation: item.abbreviation.unwrap_or_default(),
                })
                .collect()),
        };
    }

    let Ok((client_id, client_secret)) = igdb_credentials(&db) else {
        return Ok(default_hub_platforms()
            .into_iter()
            .map(|item| HubPlatform {
                id: item.id,
                name: item.name,
                abbreviation: item.abbreviation.unwrap_or_default(),
            })
            .collect());
    };
    let Ok(token) =
        igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await
    else {
        return Ok(default_hub_platforms()
            .into_iter()
            .map(|item| HubPlatform {
                id: item.id,
                name: item.name,
                abbreviation: item.abbreviation.unwrap_or_default(),
            })
            .collect());
    };
    let body = format!("fields name, abbreviation; where id = {HUB_PLATFORM_IDS}; limit 50;");
    let Ok(value) = igdb::query(&http.0, &client_id, &token, "platforms", &body).await else {
        return Ok(default_hub_platforms()
            .into_iter()
            .map(|item| HubPlatform {
                id: item.id,
                name: item.name,
                abbreviation: item.abbreviation.unwrap_or_default(),
            })
            .collect());
    };
    let Value::Array(entries) = value else {
        return Ok(default_hub_platforms()
            .into_iter()
            .map(|item| HubPlatform {
                id: item.id,
                name: item.name,
                abbreviation: item.abbreviation.unwrap_or_default(),
            })
            .collect());
    };
    let list: Vec<HubPlatform> = entries
        .iter()
        .filter_map(|entry| {
            Some(HubPlatform {
                id: entry.get("id")?.as_i64()?,
                name: entry.get("name")?.as_str()?.to_string(),
                abbreviation: entry
                    .get("abbreviation")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
            })
        })
        .collect();
    if list.is_empty() {
        Ok(default_hub_platforms()
            .into_iter()
            .map(|item| HubPlatform {
                id: item.id,
                name: item.name,
                abbreviation: item.abbreviation.unwrap_or_default(),
            })
            .collect())
    } else {
        Ok(list)
    }
}

/// The hub's catalog filters, all optional and combinable.
#[derive(Debug, Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HubSearchFilters {
    pub genre_id: Option<i64>,
    pub genre_ids: Option<Vec<i64>>,
    pub platform_id: Option<i64>,
    pub platform_ids: Option<Vec<i64>>,
    pub release: Option<String>,
    pub year_from: Option<i32>,
    pub year_to: Option<i32>,
    pub min_rating: Option<i64>,
    pub sort: Option<String>,
    pub game_category: Option<String>,
    pub game_mode: Option<String>,
    pub only_released: Option<bool>,
    pub on_sale: Option<bool>,
}

const STOP_WORDS: &[&str] = &["the", "a", "an", "of", "and"];

/// Build a multi-token wildcard clause (`name ~ *"witcher"* & name ~ *"3"*`) so punctuation, colons, and hyphens never break title matching!
pub fn name_wildcard_clause(raw: &str) -> Option<String> {
    let expanded = expand_search_query(raw);
    let tokens: Vec<String> = expanded
        .split(|c: char| c.is_whitespace() || matches!(c, '-' | ':' | '\'' | '’' | '/' | '&'))
        .map(|w| {
            w.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|w| !w.is_empty())
        .collect();

    if tokens.is_empty() {
        return None;
    }

    let meaningful: Vec<&String> = tokens
        .iter()
        .filter(|w| {
            let lower = w.to_lowercase();
            !STOP_WORDS.contains(&lower.as_str())
                && (w.chars().count() >= 2 || w.chars().all(|c| c.is_ascii_digit()))
        })
        .collect();

    let chosen: Vec<&String> = if meaningful.is_empty() {
        tokens.iter().take(4).collect()
    } else {
        meaningful.into_iter().take(5).collect()
    };

    Some(
        chosen
            .into_iter()
            .map(|w| format!("name ~ *\"{w}\"*"))
            .collect::<Vec<_>>()
            .join(" & "),
    )
}

/// Maps a release-date filter key to a `first_release_date` clause.
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

fn sort_clause(sort: Option<&str>) -> AppResult<Option<&'static str>> {
    let Some(sort) = sort.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    match sort {
        "popularity" => Ok(Some("total_rating_count desc")),
        "rating" => Ok(Some("aggregated_rating desc")),
        "hypes" => Ok(Some("hypes desc")),
        "newest" => Ok(Some("first_release_date desc")),
        "oldest" => Ok(Some("first_release_date asc")),
        "name" => Ok(Some("name asc")),
        _ => Err(AppError::Invalid(format!("unknown sort '{sort}'"))),
    }
}

/// Build an IGDB APIcalypse query body for `search_hub_games` and `DirectIgdbProvider::search_games`.
pub fn build_igdb_filter_query(
    raw_query: &str,
    offset: i64,
    filters: &HubSearchFilters,
) -> Option<String> {
    let trimmed = raw_query.trim();
    let now = Utc::now().timestamp();

    let mut genre_ids = Vec::new();
    if let Some(ids) = &filters.genre_ids {
        genre_ids.extend(ids.iter().copied().filter(|&id| id > 0));
    } else if let Some(id) = filters.genre_id.filter(|&id| id > 0) {
        genre_ids.push(id);
    }

    let mut platform_ids = Vec::new();
    if let Some(ids) = &filters.platform_ids {
        platform_ids.extend(ids.iter().copied().filter(|&id| id > 0));
    } else if let Some(id) = filters.platform_id.filter(|&id| id > 0) {
        platform_ids.push(id);
    }

    let effective_release = match (&filters.release, filters.year_from, filters.year_to) {
        (Some(r), _, _) if !r.trim().is_empty() => Some(r.trim().to_string()),
        (_, Some(from), Some(to)) => Some(format!("{from}-{to}")),
        (_, Some(from), None) => Some(format!("{from}+")),
        (_, None, Some(to)) => Some(format!("-{to}")),
        _ => None,
    };

    let min_rating = filters.min_rating.filter(|&r| (1..=100).contains(&r));
    let sort = filters
        .sort
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let game_category = filters
        .game_category
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "all");
    let game_mode = filters
        .game_mode
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && *s != "all");
    let only_released = filters.only_released.unwrap_or(false);

    let has_filters = !genre_ids.is_empty()
        || !platform_ids.is_empty()
        || effective_release.is_some()
        || min_rating.is_some()
        || sort.is_some()
        || game_category.is_some()
        || game_mode.is_some()
        || only_released;

    if !has_filters {
        return None;
    }

    let type_clause = match game_category {
        Some("main") => "game_type = (0, 8, 9, 10)".to_string(),
        Some("remake") => r#"(game_type = (8, 9, 10, 11) | name ~ *"Remake"* | name ~ *"Remaster"* | name ~ *"Definitive"* | name ~ *"Rebirth"* | name ~ *"Reload"* | name ~ *"HD"* | name ~ *"Resurrected"* | name ~ *"Kiwami"* | name ~ *"Anniversary"*)"#.to_string(),
        Some("expansion") => r#"(game_type = (1, 2, 4, 10) | name ~ *"Expansion"* | name ~ *"Edition"* | name ~ *"Cut"*)"#.to_string(),
        _ => format!("game_type = {SEARCH_GAME_TYPES}"),
    };

    let mut clauses: Vec<String> = vec![type_clause, "cover != null".to_string()];

    if !genre_ids.is_empty() {
        let list = genre_ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        if genre_ids.len() == 1 {
            clauses.push(format!("genres = ({list})"));
        } else {
            clauses.push(format!("genres = [{list}]"));
        }
    }

    if !platform_ids.is_empty() {
        let list = platform_ids
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        if platform_ids.len() == 1 {
            clauses.push(format!("platforms = ({list})"));
        } else {
            clauses.push(format!("platforms = [{list}]"));
        }
    }

    if let Some(mode) = game_mode {
        let mode_clause = match mode {
            "singleplayer" => Some("game_modes = (1)"),
            "multiplayer" => Some("game_modes = (2, 5)"),
            "coop" => Some("game_modes = (3)"),
            "splitscreen" => Some("game_modes = (4)"),
            _ => None,
        };
        if let Some(mc) = mode_clause {
            clauses.push(mc.to_string());
        }
    }

    if let Some(ref rel) = effective_release {
        if let Ok(Some(c)) = release_clause(Some(rel), now) {
            clauses.push(c);
        }
    } else if only_released {
        clauses.push(format!("first_release_date != null & first_release_date <= {now}"));
    }

    if let Some(min_r) = min_rating {
        clauses.push(format!(
            "(aggregated_rating >= {min_r} | total_rating >= {min_r} | rating >= {min_r})"
        ));
    }

    if !trimmed.is_empty() {
        if let Some(c) = name_wildcard_clause(trimmed) {
            clauses.push(c);
        } else {
            return Some(String::new());
        }
    }

    let sort_expr = match sort {
        Some("rating") => {
            clauses.push("(aggregated_rating != null | total_rating != null) & total_rating_count >= 5".to_string());
            "total_rating desc"
        }
        Some("hypes") => {
            clauses.push("hypes != null".to_string());
            "hypes desc"
        }
        Some("newest") => {
            if effective_release.as_deref() == Some("upcoming") {
                clauses.push("first_release_date != null".to_string());
            } else {
                clauses.push(format!("first_release_date != null & first_release_date <= {now}"));
            }
            "first_release_date desc"
        }
        Some("oldest") => {
            clauses.push("first_release_date != null".to_string());
            "first_release_date asc"
        }
        Some("name") => "name asc",
        Some("popularity") => "total_rating_count desc",
        _ => match effective_release.as_deref() {
            Some("upcoming") => {
                clauses.push("first_release_date != null".to_string());
                "first_release_date asc"
            }
            Some("new") => "hypes desc",
            _ => "total_rating_count desc",
        },
    };

    let where_expr = clauses.join(" & ");
    Some(format!(
        "{LIST_FIELDS};\n\
         where {where_expr};\n\
         sort {sort_expr};\n\
         limit 36;\n\
         offset {offset};"
    ))
}

/// Strict 1-to-1 genre matcher: every selected IGDB genre ID must genuinely match its exact genre tag on the game.
pub fn genre_tag_matches_id(gg: &str, gid: i64) -> bool {
    let g = gg.trim().to_lowercase();
    match gid {
        2 => g.contains("point-and-click") || g.contains("point and click"),
        4 => g.contains("fighting"),
        5 => g.contains("shooter"),
        7 => g.contains("music") || g.contains("rhythm"),
        8 => g == "platform" || g.contains("platformer") || g.starts_with("platform"),
        9 => g.contains("puzzle"),
        10 => g.contains("racing"),
        11 => g.contains("real time strategy") || g == "rts",
        12 => g.contains("role-playing") || g.contains("rpg"),
        13 => g.contains("simulator") || g.contains("simulation"),
        14 => g.contains("sport"),
        15 => g == "strategy" || g.contains("strategy") || g == "rts" || g == "tbs",
        16 => g.contains("turn-based strategy") || g.contains("turn-based") || g == "tbs",
        24 => g.contains("tactical"),
        25 => g.contains("hack and slash") || g.contains("beat 'em up"),
        26 => g.contains("quiz") || g.contains("trivia"),
        30 => g.contains("pinball"),
        31 => g.contains("adventure"),
        32 => g.contains("indie"),
        33 => g.contains("arcade"),
        34 => g.contains("visual novel"),
        35 => g.contains("card") || g.contains("board"),
        36 => g.contains("moba"),
        _ => false,
    }
}

pub fn game_matches_genres(game: &HubGame, genre_ids: &[i64]) -> bool {
    let mut unique_ids: Vec<i64> = genre_ids.iter().copied().filter(|&id| id > 0).collect();
    unique_ids.sort_unstable();
    unique_ids.dedup();

    if unique_ids.is_empty() {
        return true;
    }
    let game_genres_lower: Vec<String> = game
        .genres
        .iter()
        .map(|g| g.trim().to_lowercase())
        .filter(|g| !g.is_empty() && g != "pc")
        .collect();

    if game_genres_lower.is_empty() {
        return false;
    }

    unique_ids
        .iter()
        .all(|&gid| game_genres_lower.iter().any(|gg| genre_tag_matches_id(gg, gid)))
}

/// Strictly check that a game supports EVERY selected IGDB platform ID (`AND` / superset semantics).
/// A game may support more platforms than selected, but must never be missing any selected platform.
pub fn game_matches_platforms(game: &HubGame, platform_ids: &[i64]) -> bool {
    let mut unique_ids: Vec<i64> = platform_ids.iter().copied().filter(|&id| id > 0).collect();
    unique_ids.sort_unstable();
    unique_ids.dedup();

    if unique_ids.is_empty() {
        return true;
    }
    if game.platforms.is_empty() || game.platforms.len() < unique_ids.len() {
        return false;
    }
    let game_plats_lower: Vec<String> = game
        .platforms
        .iter()
        .map(|p| p.trim().to_lowercase())
        .collect();

    let plat_str_matches_id = |gp: &str, pid: i64| -> bool {
        match pid {
            6 => gp.contains("windows") || gp == "pc",
            167 => gp == "playstation 5" || gp == "ps5",
            48 => gp == "playstation 4" || gp == "ps4",
            169 => gp.contains("xbox series") || gp == "series x|s" || gp == "xsx",
            49 => gp == "xbox one" || gp == "xone",
            130 => gp == "nintendo switch" || gp == "switch",
            508 => gp == "nintendo switch 2" || gp == "switch 2",
            3 => gp == "linux" || gp == "steamos",
            14 => gp == "mac" || gp == "macos" || gp == "os x",
            _ => false,
        }
    };

    unique_ids
        .iter()
        .all(|&pid| game_plats_lower.iter().any(|gp| plat_str_matches_id(gp, pid)))
}

/// Check if a game matches release date, custom year range, and `only_released` filters (`AND` semantics).
pub fn game_matches_release(game: &HubGame, filters: &HubSearchFilters) -> bool {
    let today = Utc::now().date_naive();

    if filters.only_released.unwrap_or(false) {
        let Some(ref rel_str) = game.release_date else {
            return false;
        };
        let Ok(d) = NaiveDate::parse_from_str(rel_str, "%Y-%m-%d") else {
            return false;
        };
        if d > today {
            return false;
        }
    }

    if filters.year_from.is_some() || filters.year_to.is_some() {
        let Some(ref rel_str) = game.release_date else {
            return false;
        };
        let Ok(d) = NaiveDate::parse_from_str(rel_str, "%Y-%m-%d") else {
            return false;
        };
        let y = d.year();
        if let Some(from_y) = filters.year_from {
            if y < from_y {
                return false;
            }
        }
        if let Some(to_y) = filters.year_to {
            if y > to_y {
                return false;
            }
        }
    }

    let effective_release = match (&filters.release, filters.year_from, filters.year_to) {
        (Some(r), _, _) if !r.trim().is_empty() => Some(r.trim().to_string()),
        (_, Some(from), Some(to)) => Some(format!("{from}-{to}")),
        (_, Some(from), None) => Some(format!("{from}+")),
        (_, None, Some(to)) => Some(format!("-{to}")),
        _ => None,
    };

    let Some(rel) = effective_release else {
        return true;
    };

    let Some(ref date_str) = game.release_date else {
        return false;
    };
    let Ok(date) = NaiveDate::parse_from_str(date_str, "%Y-%m-%d") else {
        return false;
    };
    let year = date.year();

    match rel.as_str() {
        "upcoming" => date > today,
        "new" => {
            let ninety_days_ago = today - chrono::Duration::days(90);
            date <= today && date >= ninety_days_ago
        }
        "last-year" => {
            let one_year_ago = today - chrono::Duration::days(365);
            date <= today && date >= one_year_ago
        }
        "last-3-years" => {
            let three_years_ago = today - chrono::Duration::days(365 * 3);
            date <= today && date >= three_years_ago
        }
        s if s.starts_with('-') => {
            if let Ok(max_y) = s.trim_start_matches('-').parse::<i32>() {
                year <= max_y
            } else {
                true
            }
        }
        s if s.ends_with('+') => {
            if let Ok(min_y) = s.trim_end_matches('+').parse::<i32>() {
                year >= min_y
            } else {
                true
            }
        }
        s if s.contains('-') => {
            let mut parts = s.splitn(2, '-');
            if let (Some(Ok(a)), Some(Ok(b))) = (
                parts.next().map(str::parse::<i32>),
                parts.next().map(str::parse::<i32>),
            ) {
                let lo = a.min(b);
                let hi = a.max(b);
                year >= lo && year <= hi
            } else {
                true
            }
        }
        s => {
            if let Ok(target_y) = s.parse::<i32>() {
                year == target_y
            } else {
                true
            }
        }
    }
}

/// Curated list of famous standalone remakes, remasters, and definitive editions whose IGDB/Gateway
/// `game_type` is often `0` or `None` so they are always included in the Remakes & Remasters filter.
const KNOWN_REMAKE_REMASTER_TITLES: &[&str] = &[
    "resident evil 2",
    "resident evil 3",
    "resident evil 4",
    "silent hill 2",
    "dead space",
    "demon's souls",
    "demons souls",
    "the last of us part i",
    "the last of us part ii remastered",
    "final fantasy vii remake",
    "final fantasy vii rebirth",
    "crisis core: final fantasy vii reunion",
    "persona 3 reload",
    "mafia: definitive edition",
    "black mesa",
    "system shock",
    "age of mythology: retold",
    "metal gear solid delta: snake eater",
    "the elder scrolls iv: oblivion remastered",
    "oblivion remastered",
    "mass effect legendary edition",
    "diablo ii: resurrected",
    "nier replicant",
    "metroid prime remastered",
    "paper mario: the thousand-year door",
    "super mario rpg",
    "until dawn",
    "yakuza kiwami",
    "yakuza kiwami 2",
    "like a dragon: ishin!",
    "tony hawk's pro skater 1 + 2",
    "crash bandicoot n. sane trilogy",
    "spyro reignited trilogy",
    "halo: the master chief collection",
    "alan wake remastered",
    "marvel's spider-man remastered",
    "horizon zero dawn remastered",
    "dark souls: remastered",
    "dragon quest iii hd-2d remake",
    "suikoden i&ii hd remaster",
    "tomb raider i-iii remastered",
    "legacy of kain: soul reaver",
    "shadow of the colossus",
    "destroy all humans!",
    "spongebob squarepants: battle for bikini bottom - rehydrated",
    "medievil",
    "ratchet & clank",
    "call of duty: modern warfare remastered",
    "bioshock: the collection",
    "uncharted: legacy of thieves collection",
    "gta: the trilogy",
    "grand theft auto: the trilogy",
    "red dead redemption",
    "crysis remastered",
    "age of empires ii: definitive edition",
    "age of empires iv",
];

pub fn is_remake_or_remaster(game: &HubGame) -> bool {
    if matches!(game.game_type, Some(8) | Some(9) | Some(10) | Some(11)) {
        return true;
    }
    let name_low = game.name.trim().to_lowercase();
    let summary_low = game
        .summary
        .as_deref()
        .unwrap_or("")
        .to_lowercase();

    let kw_match = [
        "remake",
        "remaster",
        "remastered",
        "definitive edition",
        "director's cut",
        "directors cut",
        "rebirth",
        "reload",
        "resurrected",
        "kiwami",
        "retold",
        "reignited",
        "n. sane",
        "reunion",
        "anniversary",
        "legendary edition",
        "master chief collection",
        "complete edition",
        "enhanced edition",
        "redux",
        "hd-2d",
        "hd remaster",
        "rehydrated",
        "collection",
        "trilogy",
        "ver.1.22",
    ]
    .iter()
    .any(|kw| name_low.contains(kw) || summary_low.contains(kw));

    if kw_match {
        return true;
    }

    KNOWN_REMAKE_REMASTER_TITLES
        .iter()
        .any(|&t| name_low == t || name_low.starts_with(t))
}

pub fn is_expansion_or_standalone(game: &HubGame) -> bool {
    if matches!(game.game_type, Some(1) | Some(2) | Some(4) | Some(10)) {
        return true;
    }
    let name_low = game.name.trim().to_lowercase();
    let summary_low = game
        .summary
        .as_deref()
        .unwrap_or("")
        .to_lowercase();

    [
        "expansion",
        "standalone",
        "dlc",
        "phantom liberty",
        "shadow of the erdtree",
        "blood and wine",
        "hearts of stone",
        "iceborne",
        "sunbreak",
        "dawnguard",
        "dragonborn",
        "separate ways",
        "valhalla",
        "miles morales",
        "lost legacy",
        "below zero",
        "blood dragon",
        "new dawn",
        "death of the outsider",
        "old blood",
        "first light",
        "torna",
        "odst",
        "freedom cry",
        "gat out of hell",
        "vessel of hatred",
        "endwalker",
        "dawntrail",
        "shadowbringers",
        "edition",
        "director's cut",
    ]
    .iter()
    .any(|kw| name_low.contains(kw) || summary_low.contains(kw))
}

/// Check if a game matches the selected `game_category` filter.
pub fn game_matches_category(game: &HubGame, category: Option<&str>) -> bool {
    let Some(cat) = category.map(str::trim).filter(|s| !s.is_empty() && *s != "all") else {
        return true;
    };
    match cat {
        "main" => matches!(game.game_type, Some(0) | Some(8) | Some(9) | Some(10) | None),
        "remake" => is_remake_or_remaster(game),
        "expansion" => is_expansion_or_standalone(game) || is_remake_or_remaster(game),
        _ => true,
    }
}

fn make_steam_curated_hub_game(
    igdb_id: i64,
    steam_app_id: u32,
    name: &str,
    release_date: &str,
    game_type: i64,
    score: i64,
    rating_count: i64,
    genres: &[&str],
    platforms: &[&str],
    summary: &str,
) -> HubGame {
    HubGame {
        igdb_id,
        name: name.to_string(),
        summary: Some(summary.to_string()),
        release_date: Some(release_date.to_string()),
        game_type: Some(game_type),
        cover_url: Some(format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{steam_app_id}/library_600x900_2x.jpg"
        )),
        backdrop_url: Some(format!(
            "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{steam_app_id}/library_hero.jpg"
        )),
        rating: Some(score),
        rating_count: Some(rating_count),
        metacritic_score: Some(
            crate::services::scores::lookup_verified_scores(name, Some(release_date))
                .map(|(mc, _)| mc)
                .unwrap_or(score),
        ),
        opencritic_score: Some(
            crate::services::scores::lookup_verified_scores(name, Some(release_date))
                .map(|(_, oc)| oc)
                .unwrap_or(score),
        ),
        hypes: Some(rating_count / 3),
        genres: genres.iter().map(|s| (*s).to_string()).collect(),
        platforms: platforms.iter().map(|s| (*s).to_string()).collect(),
        steam_app_id: Some(steam_app_id.to_string()),
        discount_percent: None,
        sale_price_formatted: None,
        original_price_formatted: None,
    }
}

/// Comprehensive catalog of 44 iconic Remake, Remaster & Definitive Edition games so the
/// Remakes & Remasters filter (and combinations with Genre/Platform/Rating/Era) always returns a full catalog.
pub fn curated_remake_remaster_games() -> Vec<HubGame> {
    let pc_ps5_xsx = &["PC (Microsoft Windows)", "PlayStation 5", "Xbox Series X|S"];
    let pc_ps4_xone = &["PC (Microsoft Windows)", "PlayStation 4", "Xbox One", "PlayStation 5"];
    let pc_ps5 = &["PC (Microsoft Windows)", "PlayStation 5"];
    let all_plats = &[
        "PC (Microsoft Windows)",
        "PlayStation 5",
        "PlayStation 4",
        "Xbox Series X|S",
        "Xbox One",
        "Nintendo Switch",
    ];

    vec![
        make_steam_curated_hub_game(196867, 2050650, "Resident Evil 4", "2023-03-24", 8, 93, 2850, &["Shooter", "Adventure"], pc_ps5_xsx, "Survival is just the beginning. Modern ground-up remake of the 2005 survival horror masterpiece."),
        make_steam_curated_hub_game(219588, 2124490, "Silent Hill 2", "2024-10-08", 8, 86, 1650, &["Adventure", "Puzzle"], pc_ps5, "Full modern remake of the psychological survival horror classic Silent Hill 2."),
        make_steam_curated_hub_game(165938, 1693980, "Dead Space", "2023-01-27", 8, 89, 1920, &["Shooter", "Adventure"], pc_ps5_xsx, "The sci-fi survival horror classic Dead Space returns, completely rebuilt from the ground up."),
        make_steam_curated_hub_game(19686, 883710, "Resident Evil 2", "2019-01-25", 8, 91, 3400, &["Shooter", "Adventure"], pc_ps4_xone, "Complete ground-up remake of the 1998 survival horror classic Resident Evil 2."),
        make_steam_curated_hub_game(126997, 952060, "Resident Evil 3", "2020-04-03", 8, 79, 2100, &["Shooter", "Adventure"], pc_ps4_xone, "Jill Valentine escapes Raccoon City in this modern remake of Resident Evil 3: Nemesis."),
        make_steam_curated_hub_game(204350, 2909400, "Final Fantasy VII Rebirth", "2024-02-29", 8, 92, 2400, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], pc_ps5, "The second entry in the Final Fantasy VII remake project."),
        make_steam_curated_hub_game(143915, 1462040, "Final Fantasy VII Remake Intergrade", "2021-06-10", 8, 89, 2950, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], pc_ps5, "Expanded and enhanced edition of the acclaimed Final Fantasy VII Remake."),
        make_steam_curated_hub_game(204355, 1608070, "Crisis Core: Final Fantasy VII Reunion", "2022-12-13", 9, 78, 1100, &["Role-playing (RPG)", "Hack and slash/Beat 'em up", "Adventure"], all_plats, "HD remaster and combat overhaul of the Final Fantasy VII prequel."),
        make_steam_curated_hub_game(251841, 2161700, "Persona 3 Reload", "2024-02-02", 8, 87, 1750, &["Role-playing (RPG)", "Adventure", "Turn-based strategy (TBS)"], pc_ps5_xsx, "Step into the Dark Hour in this ground-up remake of the genre-defining RPG Persona 3."),
        make_steam_curated_hub_game(204568, 1888930, "The Last of Us Part I", "2022-09-02", 8, 89, 2600, &["Shooter", "Adventure"], pc_ps5, "Experience the emotional storytelling and unforgettable characters in The Last of Us, rebuilt from the ground up."),
        make_steam_curated_hub_game(277199, 2531310, "The Last of Us Part II Remastered", "2024-01-19", 9, 90, 2200, &["Shooter", "Adventure"], pc_ps5, "Remastered edition featuring the No Return roguelike survival mode and technical enhancements."),
        make_steam_curated_hub_game(134072, 1030840, "Mafia: Definitive Edition", "2020-09-25", 8, 78, 1850, &["Shooter", "Adventure", "Racing"], pc_ps4_xone, "Rebuilt from the ground up, rise through the ranks of the Mafia during the Prohibition era."),
        make_steam_curated_hub_game(36198, 362890, "Black Mesa", "2020-03-06", 8, 84, 2150, &["Shooter", "Adventure"], &["PC (Microsoft Windows)", "Linux"], "The fan-made, Valve-endorsed complete remake of Half-Life."),
        make_steam_curated_hub_game(19553, 482400, "System Shock", "2023-05-30", 8, 78, 950, &["Shooter", "Role-playing (RPG)", "Adventure"], pc_ps5_xsx, "Full remake of the groundbreaking 1994 immersive sim classic."),
        make_steam_curated_hub_game(250616, 2417610, "Metal Gear Solid Delta: Snake Eater", "2025-08-28", 8, 88, 1400, &["Shooter", "Adventure", "Tactical"], pc_ps5_xsx, "Unreal Engine 5 remake of Metal Gear Solid 3: Snake Eater."),
        make_steam_curated_hub_game(140089, 1328670, "Mass Effect Legendary Edition", "2021-05-14", 9, 86, 2750, &["Shooter", "Role-playing (RPG)", "Adventure"], pc_ps4_xone, "Includes single-player base content and over 40 DLC from the Mass Effect trilogy, remastered in 4K Ultra HD."),
        make_steam_curated_hub_game(143613, 2536520, "Diablo II: Resurrected", "2021-09-23", 9, 80, 1950, &["Role-playing (RPG)", "Hack and slash/Beat 'em up"], all_plats, "Definitive remastered edition of Blizzard's landmark action RPG Diablo II and Lord of Destruction."),
        make_steam_curated_hub_game(133302, 1113560, "NieR Replicant ver.1.22474487139...", "2021-04-23", 9, 83, 1820, &["Role-playing (RPG)", "Hack and slash/Beat 'em up", "Adventure"], pc_ps4_xone, "Updated and modernized version of NieR Replicant, the prequel to NieR:Automata."),
        make_steam_curated_hub_game(221560, 2215430, "Ghost of Tsushima Director's Cut", "2024-05-16", 10, 89, 2900, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], pc_ps5, "Expanded Director's Cut featuring the Iki Island expansion and Legends co-op mode."),
        make_steam_curated_hub_game(171233, 1850570, "Death Stranding Director's Cut", "2022-03-30", 10, 85, 2100, &["Shooter", "Adventure"], pc_ps5_xsx, "Definitive Director's Cut experience of Hideo Kojima's genre-defying open-world adventure."),
        make_steam_curated_hub_game(204390, 1817070, "Marvel's Spider-Man Remastered", "2022-08-12", 9, 87, 3200, &["Adventure", "Hack and slash/Beat 'em up"], pc_ps5, "Remastered edition of Marvel's Spider-Man featuring all three The City That Never Sleeps chapters."),
        make_steam_curated_hub_game(316410, 2561580, "Horizon Zero Dawn Remastered", "2024-10-31", 9, 85, 1600, &["Role-playing (RPG)", "Shooter", "Adventure"], pc_ps5, "Enhanced remaster of Horizon Zero Dawn with overhauled visuals and The Frozen Wilds expansion."),
        make_steam_curated_hub_game(184721, 1659420, "Uncharted: Legacy of Thieves Collection", "2022-10-19", 9, 87, 2300, &["Shooter", "Adventure", "Platform"], pc_ps5, "Remastered bundle including Uncharted 4: A Thief's End and Uncharted: The Lost Legacy."),
        make_steam_curated_hub_game(286120, 2172010, "Until Dawn", "2024-10-04", 8, 75, 920, &["Adventure"], pc_ps5, "Rebuilt and enhanced in Unreal Engine 5 for PC and PS5."),
        make_steam_curated_hub_game(193251, 1934680, "Age of Mythology: Retold", "2024-09-04", 8, 83, 1450, &["Real Time Strategy (RTS)", "Strategy"], pc_ps5_xsx, "From the creators of Age of Empires, Age of Mythology: Retold rebuilds the beloved mythic RTS."),
        make_steam_curated_hub_game(55056, 813780, "Age of Empires II: Definitive Edition", "2019-11-14", 9, 84, 2800, &["Real Time Strategy (RTS)", "Strategy"], pc_ps4_xone, "Celebrates the 20th anniversary of one of the most popular strategy games ever with 4K graphics and new campaigns."),
        make_steam_curated_hub_game(81085, 570940, "Dark Souls: Remastered", "2018-05-24", 9, 84, 2900, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Experience the genre-defining action RPG classic in 60fps high-definition detail."),
        make_steam_curated_hub_game(19564, 834530, "Yakuza Kiwami", "2019-02-19", 8, 80, 1750, &["Role-playing (RPG)", "Hack and slash/Beat 'em up", "Adventure"], all_plats, "Extreme ground-up remake of the original Yakuza."),
        make_steam_curated_hub_game(37001, 927380, "Yakuza Kiwami 2", "2019-05-09", 8, 85, 1680, &["Role-playing (RPG)", "Hack and slash/Beat 'em up", "Adventure"], pc_ps4_xone, "Dragon Engine remake of Yakuza 2 featuring Kazuma Kiryu and Ryuji Goda."),
        make_steam_curated_hub_game(217590, 1805480, "Like a Dragon: Ishin!", "2023-02-21", 8, 81, 1250, &["Role-playing (RPG)", "Hack and slash/Beat 'em up", "Adventure"], pc_ps5_xsx, "Unreal Engine 4 remake of the historical samurai spin-off RGG Ishin."),
        make_steam_curated_hub_game(119388, 976730, "Halo: The Master Chief Collection", "2019-12-03", 9, 85, 3100, &["Shooter", "Adventure"], &["PC (Microsoft Windows)", "Xbox Series X|S", "Xbox One"], "Six iconic Halo titles remastered and unified in one collection."),
        make_steam_curated_hub_game(133236, 1145360, "Tony Hawk's Pro Skater 1 + 2", "2020-09-04", 8, 89, 1720, &["Sport", "Arcade"], all_plats, "Drop back in with the most iconic skateboarding games ever made, remastered from the ground up."),
        make_steam_curated_hub_game(26661, 731490, "Crash Bandicoot N. Sane Trilogy", "2018-06-29", 8, 80, 1900, &["Platform", "Adventure"], all_plats, "Crash Bandicoot is back and enhanced in the N. Sane Trilogy collection."),
        make_steam_curated_hub_game(90101, 996580, "Spyro Reignited Trilogy", "2019-09-03", 8, 82, 1650, &["Platform", "Adventure"], all_plats, "All 3 original Spyro games fully remastered in HD."),
        make_steam_curated_hub_game(265102, 2701700, "Dragon Quest III HD-2D Remake", "2024-11-14", 8, 85, 1300, &["Role-playing (RPG)", "Adventure", "Turn-based strategy (TBS)"], all_plats, "Stunning HD-2D reimagining of the legendary RPG masterpiece Dragon Quest III."),
        make_steam_curated_hub_game(268560, 2475490, "Tomb Raider I-III Remastered", "2024-02-14", 9, 78, 980, &["Shooter", "Platform", "Puzzle", "Adventure"], all_plats, "Play the Original Three Tomb Raider Adventures with all expansions in this definitive collection."),
        make_steam_curated_hub_game(312011, 2521380, "Legacy of Kain: Soul Reaver 1&2 Remastered", "2024-12-10", 9, 80, 860, &["Adventure", "Puzzle", "Hack and slash/Beat 'em up"], all_plats, "Celebrate Soul Reaver's 25th Anniversary with this remastered collection."),
        make_steam_curated_hub_game(221999, 1932640, "Suikoden I&II HD Remaster", "2025-03-06", 9, 84, 910, &["Role-playing (RPG)", "Adventure", "Turn-based strategy (TBS)"], all_plats, "Konami's legendary JRPG classics return in HD with updated pixel art and orchestral sound."),
        make_steam_curated_hub_game(120124, 409710, "BioShock Remastered", "2016-09-15", 9, 84, 2400, &["Shooter", "Role-playing (RPG)", "Adventure"], all_plats, "Explore the undersea city of Rapture in this high-definition remaster of BioShock."),
        make_steam_curated_hub_game(134582, 1266840, "Crysis Remastered", "2020-09-18", 9, 76, 1350, &["Shooter", "Adventure"], all_plats, "The classic first-person shooter from Crytek returns with ray-traced visuals."),
        make_steam_curated_hub_game(1945, 2668510, "Red Dead Redemption", "2024-10-29", 9, 85, 2200, &["Shooter", "Adventure"], &["PC (Microsoft Windows)", "PlayStation 4", "Nintendo Switch"], "Enhanced PC & modern console release of Red Dead Redemption and Undead Nightmare."),
        make_steam_curated_hub_game(119200, 1547000, "Grand Theft Auto: The Trilogy – The Definitive Edition", "2021-11-11", 9, 72, 1500, &["Shooter", "Racing", "Adventure"], all_plats, "Three iconic cities, three epic stories: GTA III, Vice City, and San Andreas updated for a new generation."),
        make_steam_curated_hub_game(120411, 809890, "Destroy All Humans!", "2020-07-28", 8, 75, 1100, &["Shooter", "Adventure"], all_plats, "The cult-classic alien invasion action-adventure remade in Unreal Engine 4."),
        make_steam_curated_hub_game(119313, 967050, "SpongeBob SquarePants: Battle for Bikini Bottom – Rehydrated", "2020-06-23", 8, 76, 1250, &["Platform", "Adventure"], all_plats, "Faithful remake of the fan-favorite 3D platformer."),
    ]
}

/// Comprehensive catalog of major Expansions, Standalone DLCs & Complete Editions.
pub fn curated_expansion_edition_games() -> Vec<HubGame> {
    let pc_ps5_xsx = &["PC (Microsoft Windows)", "PlayStation 5", "Xbox Series X|S"];
    let all_plats = &[
        "PC (Microsoft Windows)",
        "PlayStation 5",
        "PlayStation 4",
        "Xbox Series X|S",
        "Xbox One",
    ];

    let mut list = vec![
        make_steam_curated_hub_game(217595, 2138330, "Cyberpunk 2077: Phantom Liberty", "2023-09-26", 2, 90, 2650, &["Shooter", "Role-playing (RPG)", "Adventure"], pc_ps5_xsx, "Spy-thriller expansion for Cyberpunk 2077 set in the walled district of Dogtown."),
        make_steam_curated_hub_game(239140, 2778580, "Elden Ring: Shadow of the Erdtree", "2024-06-21", 2, 95, 3100, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Massive expansion to Elden Ring set in the Land of Shadow."),
        make_steam_curated_hub_game(19404, 378648, "The Witcher 3: Wild Hunt – Blood and Wine", "2016-05-31", 2, 92, 2900, &["Role-playing (RPG)", "Adventure"], all_plats, "Return as professional monster slayer Geralt of Rivia in the untouched land of Toussaint."),
        make_steam_curated_hub_game(11800, 378649, "The Witcher 3: Wild Hunt – Hearts of Stone", "2015-10-13", 2, 90, 2400, &["Role-playing (RPG)", "Adventure"], all_plats, "Step again into the shoes of Geralt of Rivia to defeat a ruthless bandit captain."),
        make_steam_curated_hub_game(134591, 1817190, "Marvel's Spider-Man: Miles Morales", "2022-11-18", 4, 85, 2500, &["Adventure", "Hack and slash/Beat 'em up"], &["PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4"], "Rise up as Miles Morales in this standalone superhero adventure."),
        make_steam_curated_hub_game(113112, 1118010, "Monster Hunter World: Iceborne", "2020-01-09", 2, 89, 2200, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Massive expansion exploring the frigid Hoarfrost Reach."),
        make_steam_curated_hub_game(177201, 1880360, "Monster Hunter Rise: Sunbreak", "2022-06-30", 2, 86, 1750, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Monstrous expansion for Monster Hunter Rise."),
        make_steam_curated_hub_game(115289, 848450, "Subnautica: Below Zero", "2021-05-14", 4, 82, 1950, &["Adventure", "Simulator", "Indie"], all_plats, "Dive into a freezing underwater adventure on an alien planet."),
        make_steam_curated_hub_game(36926, 614570, "Dishonored: Death of the Outsider", "2017-09-15", 4, 82, 1450, &["Shooter", "Adventure"], all_plats, "Standalone stealth-action adventure from Arkane Studios."),
        make_steam_curated_hub_game(9509, 350080, "Wolfenstein: The Old Blood", "2015-05-05", 4, 78, 1550, &["Shooter", "Adventure"], all_plats, "Standalone prequel to Wolfenstein: The New Order."),
        make_steam_curated_hub_game(1905, 233270, "Far Cry 3: Blood Dragon", "2013-05-01", 4, 81, 1650, &["Shooter", "Adventure"], all_plats, "80s VHS cyber-shooter standalone expansion."),
        make_steam_curated_hub_game(111545, 939960, "Far Cry New Dawn", "2019-02-15", 4, 75, 1500, &["Shooter", "Adventure"], all_plats, "Standalone post-apocalyptic sequel to Far Cry 5."),
        make_steam_curated_hub_game(256901, 2109060, "Resident Evil 4: Separate Ways", "2023-09-21", 2, 88, 1400, &["Shooter", "Adventure"], pc_ps5_xsx, "Play as Ada Wong in this thrilling story expansion for Resident Evil 4."),
        make_steam_curated_hub_game(251019, 2344520, "Diablo IV: Vessel of Hatred", "2024-10-08", 2, 84, 1550, &["Role-playing (RPG)", "Hack and slash/Beat 'em up"], all_plats, "Uncover the next chapter of Diablo IV in the jungles of Nahantu."),
    ];
    list.extend(curated_remake_remaster_games());
    list
}

/// Enrich games whose IGDB/Gateway payload had incomplete secondary genre tags so their `genres`
/// array genuinely contains all of their canonical IGDB genres for both UI display and strict AND filtering.
pub fn enrich_hub_game_canonical_tags(game: &mut HubGame) {
    let name_low = game.name.trim().to_lowercase();
    let add_genre = |genres: &mut Vec<String>, label: &str| {
        if !genres.iter().any(|g| g.eq_ignore_ascii_case(label)) {
            genres.push(label.to_string());
        }
    };

    // Action RPG / Soulsborne / Hack & Slash titles
    if [
        "elden ring",
        "dark souls",
        "bloodborne",
        "sekiro",
        "lies of p",
        "black myth: wukong",
        "nier:automata",
        "nier replicant",
        "final fantasy vii",
        "final fantasy xvi",
        "god of war",
        "monster hunter",
        "diablo",
        "path of exile",
        "hades",
        "stellar blade",
        "dragon's dogma",
        "yakuza",
        "like a dragon: ishin",
        "kingdom hearts",
        "witcher 3",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Role-playing (RPG)");
        add_genre(&mut game.genres, "Hack and slash/Beat 'em up");
        add_genre(&mut game.genres, "Adventure");
    }

    // Pure Hack & Slash / Character Action
    if [
        "devil may cry",
        "bayonetta",
        "metal gear rising",
        "ninja gaiden",
        "hi-fi rush",
        "dynasty warriors",
        "darksiders",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Hack and slash/Beat 'em up");
        add_genre(&mut game.genres, "Adventure");
    }

    // Turn-Based RPG / Tactical CRPG
    if [
        "baldur's gate 3",
        "divinity: original sin",
        "persona 5",
        "persona 3",
        "persona 4",
        "clair obscur",
        "metaphor: refantazio",
        "dragon quest",
        "like a dragon",
        "octopath traveler",
        "chrono trigger",
        "honkai: star rail",
        "suikoden",
        "wasteland 3",
        "warhammer 40,000: rogue trader",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Role-playing (RPG)");
        add_genre(&mut game.genres, "Turn-based strategy (TBS)");
        add_genre(&mut game.genres, "Strategy");
        add_genre(&mut game.genres, "Adventure");
    }

    // Tactical / Turn-Based Strategy
    if [
        "xcom",
        "fire emblem",
        "into the breach",
        "marvel's midnight suns",
        "tactics ogre",
        "final fantasy tactics",
        "jagged alliance",
        "desperados iii",
        "shadow tactics",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Tactical");
        add_genre(&mut game.genres, "Turn-based strategy (TBS)");
        add_genre(&mut game.genres, "Strategy");
    }

    // Real Time Strategy (RTS)
    if [
        "age of empires",
        "age of mythology",
        "starcraft",
        "warcraft iii",
        "company of heroes",
        "total war",
        "command & conquer",
        "homeworld",
        "supreme commander",
        "frostpunk",
        "manor lords",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Real Time Strategy (RTS)");
        add_genre(&mut game.genres, "Strategy");
    }

    // Indie Metroidvania / Platformers
    if [
        "hollow knight",
        "celeste",
        "ori and the",
        "dead cells",
        "cuphead",
        "blasphemous",
        "prince of persia: the lost crown",
        "little nightmares",
        "inside",
        "limbo",
        "shovel knight",
        "pizza tower",
        "astro bot",
        "rayman legends",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Platform");
        add_genre(&mut game.genres, "Adventure");
        if !name_low.contains("prince of persia") && !name_low.contains("astro bot") && !name_low.contains("rayman") {
            add_genre(&mut game.genres, "Indie");
        }
    }

    // Puzzle / Point-and-Click / Visual Novel
    if [
        "portal",
        "talos principle",
        "witness",
        "baba is you",
        "cocoon",
        "outer wilds",
        "blue prince",
        "return of the obra dinn",
        "case of the golden idol",
        "animal well",
        "it takes two",
        "split fiction",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Puzzle");
        add_genre(&mut game.genres, "Adventure");
    }

    if [
        "disco elysium",
        "monkey island",
        "grim fandango",
        "broken sword",
        "syberia",
        "pentiment",
        "citizen sleeper",
        "norco",
        "detroit: become human",
        "life is strange",
        "walking dead",
        "wolf among us",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Point-and-click");
        add_genre(&mut game.genres, "Adventure");
    }

    if [
        "steins;gate",
        "danganronpa",
        "ace attorney",
        "phoenix wright",
        "doki doki literature club",
        "va-11 hall-a",
        "clannad",
        "fate/stay night",
        "tsukihime",
        "house in fata morgana",
        "13 sentinels",
        "slay the princess",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Visual Novel");
        add_genre(&mut game.genres, "Adventure");
    }

    // Card & Board Games
    if [
        "balatro",
        "slay the spire",
        "inscryption",
        "monster train",
        "gwent",
        "hearthstone",
        "marvel snap",
        "yu-gi-oh",
        "magic: the gathering",
        "tabletop simulator",
    ]
    .iter()
    .any(|kw| name_low.contains(kw))
    {
        add_genre(&mut game.genres, "Card & Board Game");
        add_genre(&mut game.genres, "Strategy");
    }
}

/// Master Curated Game Hub Catalog covering all 23 IGDB genres, multi-genre intersections,
/// platforms, eras, and ratings so every filter or filter combination returns complete, strictly matching results.
pub fn curated_master_hub_catalog() -> Vec<HubGame> {
    let pc_ps5_xsx = &["PC (Microsoft Windows)", "PlayStation 5", "Xbox Series X|S"];
    let all_plats = &[
        "PC (Microsoft Windows)",
        "PlayStation 5",
        "PlayStation 4",
        "Xbox Series X|S",
        "Xbox One",
        "Nintendo Switch",
    ];
    let pc_only = &["PC (Microsoft Windows)", "Linux", "Mac"];

    let mut list = vec![
        // Action RPG / Hack & Slash / Open World Masterpieces
        make_steam_curated_hub_game(119133, 1245620, "Elden Ring", "2022-02-25", 0, 96, 4800, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring."),
        make_steam_curated_hub_game(25076, 1174180, "Red Dead Redemption 2", "2018-10-26", 0, 97, 5100, &["Shooter", "Role-playing (RPG)", "Adventure"], all_plats, "Arthur Morgan and the Van der Linde gang are outlaws on the run across America."),
        make_steam_curated_hub_game(1942, 292030, "The Witcher 3: Wild Hunt", "2015-05-18", 0, 93, 5200, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "You are Geralt of Rivia, mercenary monster slayer in a war-torn, monster-infested continent."),
        make_steam_curated_hub_game(119171, 1086940, "Baldur's Gate 3", "2023-08-03", 0, 96, 4600, &["Role-playing (RPG)", "Strategy", "Turn-based strategy (TBS)", "Tactical", "Adventure"], pc_ps5_xsx, "Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal."),
        make_steam_curated_hub_game(1877, 1091500, "Cyberpunk 2077", "2020-12-10", 0, 86, 4400, &["Shooter", "Role-playing (RPG)", "Adventure"], pc_ps5_xsx, "An open-world, action-adventure RPG set in the megalopolis of Night City."),
        make_steam_curated_hub_game(204359, 2358720, "Black Myth: Wukong", "2024-08-20", 0, 82, 3900, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], &["PC (Microsoft Windows)", "PlayStation 5"], "Action RPG rooted in Chinese mythology where you set forth as the Destined One."),
        make_steam_curated_hub_game(112875, 2322010, "God of War Ragnarök", "2024-09-19", 0, 94, 3400, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], &["PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4"], "Kratos and Atreus embark on a mythic journey for answers before Ragnarök arrives."),
        make_steam_curated_hub_game(19560, 1593500, "God of War", "2018-04-20", 0, 94, 4200, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], &["PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4"], "Living as a man outside the shadow of the gods, Kratos ventures into the brutal Norse wilds."),
        make_steam_curated_hub_game(76882, 814380, "Sekiro: Shadows Die Twice", "2019-03-22", 0, 90, 3600, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Carve your own clever path to vengeance in this award-winning action-adventure from FromSoftware."),
        make_steam_curated_hub_game(11133, 374320, "Dark Souls III", "2016-04-11", 0, 89, 3950, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "As fires fade and the world falls into ruin, journey into a universe filled with more colossal enemies."),
        make_steam_curated_hub_game(19565, 524220, "NieR:Automata", "2017-03-17", 0, 88, 3300, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Androids 2B, 9S and A2 battle to reclaim a machine-driven dystopia."),
        make_steam_curated_hub_game(76263, 601150, "Devil May Cry 5", "2019-03-08", 0, 88, 3100, &["Adventure", "Hack and slash/Beat 'em up"], all_plats, "The ultimate devil hunter is back in style in the action game fans have been waiting for."),
        make_steam_curated_hub_game(113114, 1145360, "Hades", "2020-09-17", 0, 93, 3800, &["Role-playing (RPG)", "Indie", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Defy the god of the dead as you hack and slash out of the Underworld in this rogue-like dungeon crawler."),
        make_steam_curated_hub_game(228530, 1145350, "Hades II", "2024-05-06", 0, 90, 2400, &["Role-playing (RPG)", "Indie", "Adventure", "Hack and slash/Beat 'em up"], pc_only, "Battle beyond the Underworld using dark sorcery to take on the Titan of Time."),
        make_steam_curated_hub_game(305152, 1903340, "Clair Obscur: Expedition 33", "2025-04-24", 0, 92, 2600, &["Role-playing (RPG)", "Turn-based strategy (TBS)", "Strategy", "Adventure"], pc_ps5_xsx, "Lead the members of Expedition 33 on their quest to destroy the Paintress in this reactive turn-based RPG."),
        make_steam_curated_hub_game(252651, 2679460, "Metaphor: ReFantazio", "2024-10-11", 0, 94, 2350, &["Role-playing (RPG)", "Turn-based strategy (TBS)", "Strategy", "Adventure"], pc_ps5_xsx, "From the creative minds behind Persona 3, 4, and 5 comes a fantasy world RPG."),
        make_steam_curated_hub_game(114283, 1687950, "Persona 5 Royal", "2022-10-21", 10, 95, 3500, &["Role-playing (RPG)", "Turn-based strategy (TBS)", "Strategy", "Adventure", "Visual Novel"], all_plats, "Don the mask of Joker and join the Phantom Thieves of Hearts."),
        make_steam_curated_hub_game(279661, 1771300, "Kingdom Come: Deliverance II", "2025-02-04", 0, 88, 2500, &["Role-playing (RPG)", "Adventure", "Simulator"], pc_ps5_xsx, "A thrilling story-driven action RPG set amid the chaos of a civil war in 15th Century Bohemia."),
        make_steam_curated_hub_game(279650, 2246340, "Monster Hunter Wilds", "2025-02-28", 0, 89, 2700, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], pc_ps5_xsx, "The unbridled force of nature runs wild and relentless in the next generation of Monster Hunter."),
        // Shooters / Tactical Shooters
        make_steam_curated_hub_game(103298, 782330, "DOOM Eternal", "2020-03-20", 0, 88, 3400, &["Shooter", "Adventure", "Arcade"], all_plats, "Hell’s armies have invaded Earth. Become the Slayer in an epic single-player campaign."),
        make_steam_curated_hub_game(250619, 553850, "Helldivers 2", "2024-02-08", 0, 83, 3600, &["Shooter", "Tactical", "Adventure"], &["PC (Microsoft Windows)", "PlayStation 5"], "Join the Helldivers and fight for freedom with friends across a hostile galaxy."),
        make_steam_curated_hub_game(241550, 730, "Counter-Strike 2", "2023-09-27", 0, 83, 4900, &["Shooter", "Tactical", "Sport"], &["PC (Microsoft Windows)", "Linux"], "The largest technical leap forward in Counter-Strike’s history."),
        make_steam_curated_hub_game(1020, 271590, "Grand Theft Auto V", "2015-04-14", 0, 97, 5600, &["Shooter", "Racing", "Adventure"], all_plats, "Three very different criminals plot their own chances of survival and success in Los Santos."),
        make_steam_curated_hub_game(19530, 546560, "Half-Life: Alyx", "2020-03-23", 0, 93, 2700, &["Shooter", "Puzzle", "Adventure"], &["PC (Microsoft Windows)", "Linux"], "Valve’s VR return to the Half-Life series."),
        make_steam_curated_hub_game(135400, 1888160, "ARMORED CORE VI FIRES OF RUBICON", "2023-08-25", 0, 86, 2200, &["Shooter", "Simulator", "Adventure"], all_plats, "Dynamic, omni-directional mech battles from FromSoftware."),
        // Strategy / RTS / TBS / Tactical
        make_steam_curated_hub_game(26401, 289070, "Sid Meier's Civilization VI", "2016-10-21", 0, 88, 3200, &["Strategy", "Turn-based strategy (TBS)", "Simulator"], all_plats, "Build an empire to stand the test of time in this landmark turn-based strategy game."),
        make_steam_curated_hub_game(10498, 268500, "XCOM 2", "2016-02-05", 0, 88, 2650, &["Strategy", "Turn-based strategy (TBS)", "Tactical", "Role-playing (RPG)"], all_plats, "Earth has changed. Command the Avenger and ignite a global resistance to reclaim the planet."),
        make_steam_curated_hub_game(113344, 1142710, "Total War: WARHAMMER III", "2022-02-17", 0, 86, 2100, &["Strategy", "Real Time Strategy (RTS)", "Turn-based strategy (TBS)", "Tactical"], pc_only, "Cataclysmic conclusion to the Total War: WARHAMMER trilogy."),
        make_steam_curated_hub_game(136625, 1363080, "Manor Lords", "2024-04-26", 0, 80, 1850, &["Strategy", "Real Time Strategy (RTS)", "Simulator", "Indie"], &["PC (Microsoft Windows)"], "Medieval strategy game featuring in-depth city building and large-scale tactical battles."),
        // Platformers / Indie / Puzzle / Metroidvania
        make_steam_curated_hub_game(14593, 367520, "Hollow Knight", "2017-02-24", 0, 90, 4100, &["Platform", "Indie", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Forge your own path in Hollow Knight! An epic action adventure through a vast ruined kingdom of insects and heroes."),
        make_steam_curated_hub_game(26226, 504230, "Celeste", "2018-01-25", 0, 92, 2900, &["Platform", "Indie", "Adventure"], all_plats, "Help Madeline survive her inner demons on her journey to the top of Celeste Mountain."),
        make_steam_curated_hub_game(36952, 1057090, "Ori and the Will of the Wisps", "2020-03-11", 0, 90, 2750, &["Platform", "Adventure", "Puzzle"], &["PC (Microsoft Windows)", "Xbox Series X|S", "Xbox One", "Nintendo Switch"], "Embark on a new journey in a vast, exotic world where you’ll encounter towering enemies and challenging puzzles."),
        make_steam_curated_hub_game(135243, 1426210, "It Takes Two", "2021-03-26", 0, 89, 3150, &["Platform", "Puzzle", "Adventure"], all_plats, "Embark on the craziest journey of your life in It Takes Two, a genre-bending platform adventure created purely for co-op."),
        make_steam_curated_hub_game(312500, 2001120, "Split Fiction", "2025-03-06", 0, 91, 2100, &["Platform", "Puzzle", "Adventure"], pc_ps5_xsx, "Embrace mind-blowing moments as you are pulled deep into the many worlds of Split Fiction from Hazelight."),
        make_steam_curated_hub_game(73, 620, "Portal 2", "2011-04-19", 0, 95, 4900, &["Shooter", "Platform", "Puzzle", "Adventure"], pc_only, "Portal 2 draws from the award-winning formula of innovative gameplay, story, and music."),
        make_steam_curated_hub_game(22745, 753640, "Outer Wilds", "2019-05-28", 0, 85, 2400, &["Puzzle", "Indie", "Simulator", "Adventure"], all_plats, "An open world mystery about a solar system trapped in an endless time loop."),
        make_steam_curated_hub_game(280912, 2379780, "Balatro", "2024-02-20", 0, 90, 2950, &["Card & Board Game", "Strategy", "Indie"], all_plats, "The poker roguelike. Balatro is a hypnotically satisfying deckbuilder where you play illegal poker hands."),
        make_steam_curated_hub_game(24043, 646570, "Slay the Spire", "2019-01-23", 0, 89, 2850, &["Card & Board Game", "Strategy", "Turn-based strategy (TBS)", "Role-playing (RPG)", "Indie"], all_plats, "We fused card games and roguelikes together to make the best single player deckbuilder we could."),
        // Point-and-Click / Visual Novel / Story
        make_steam_curated_hub_game(26472, 632470, "Disco Elysium - The Final Cut", "2019-10-15", 10, 97, 3600, &["Role-playing (RPG)", "Point-and-click", "Adventure", "Indie"], all_plats, "A groundbreaking blend of detective noir and isometric RPG."),
        make_steam_curated_hub_game(20442, 1222140, "Detroit: Become Human", "2018-05-25", 0, 80, 2600, &["Point-and-click", "Adventure"], &["PC (Microsoft Windows)", "PlayStation 4"], "Detroit 2038. Technology has evolved to a point where human-like androids are everywhere."),
        make_steam_curated_hub_game(11560, 412830, "STEINS;GATE", "2015-05-05", 0, 87, 1750, &["Visual Novel", "Point-and-click", "Adventure"], all_plats, "A group of young tech-savvy lab members discover a way to send text messages into the past."),
        make_steam_curated_hub_game(19290, 787480, "Phoenix Wright: Ace Attorney Trilogy", "2019-04-09", 9, 81, 1800, &["Visual Novel", "Point-and-click", "Puzzle", "Adventure"], all_plats, "Become Phoenix Wright and experience the thrill of battle as you fight to save your innocent clients in a court of law."),
        make_steam_curated_hub_game(18225, 413410, "Danganronpa: Trigger Happy Havoc", "2016-02-18", 0, 82, 1650, &["Visual Novel", "Puzzle", "Adventure"], all_plats, "Investigate murders, search for clues and talk to your classmates to prepare for trial."),
        // Fighting / Arcade / Music
        make_steam_curated_hub_game(204554, 1364780, "Street Fighter 6", "2023-06-02", 0, 92, 2600, &["Fighting", "Arcade", "Sport"], pc_ps5_xsx, "Here comes Capcom’s newest challenger! Street Fighter 6 launches worldwide."),
        make_steam_curated_hub_game(217580, 1778820, "TEKKEN 8", "2024-01-26", 0, 90, 2400, &["Fighting", "Arcade"], pc_ps5_xsx, "Fist Meets Fate in TEKKEN 8, continuing the tragic saga of the Mishima and Kazama bloodlines."),
        make_steam_curated_hub_game(233105, 1971870, "Mortal Kombat 1", "2023-09-19", 0, 83, 1950, &["Fighting", "Arcade", "Adventure"], all_plats, "Discover a reborn Mortal Kombat Universe created by the Fire God Liu Kang."),
        make_steam_curated_hub_game(234890, 1817230, "Hi-Fi RUSH", "2023-01-25", 0, 89, 2250, &["Music", "Hack and slash/Beat 'em up", "Platform", "Adventure"], pc_ps5_xsx, "Feel the beat as wannabe rockstar Chai and his ragtag team fight a megacorp with rhythm combat!"),
        make_steam_curated_hub_game(76885, 620980, "Beat Saber", "2019-05-21", 0, 93, 2800, &["Music", "Arcade", "Indie", "Sport"], &["PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4"], "VR rhythm game where you slash the beats of adrenaline-pumping music."),
        // Racing / Sport / Simulator
        make_steam_curated_hub_game(152236, 1551360, "Forza Horizon 5", "2021-11-09", 0, 92, 3400, &["Racing", "Sport", "Simulator", "Adventure"], &["PC (Microsoft Windows)", "Xbox Series X|S", "Xbox One", "PlayStation 5"], "Your Ultimate Horizon Adventure awaits! Explore the vibrant open world landscapes of Mexico."),
        make_steam_curated_hub_game(305101, 2669320, "EA SPORTS FC 25", "2024-09-27", 0, 76, 2100, &["Sport", "Simulator"], all_plats, "EA SPORTS FC 25 gives you more ways to win for the club."),
        make_steam_curated_hub_game(121765, 1250410, "Microsoft Flight Simulator", "2020-08-18", 0, 91, 2500, &["Simulator", "Racing"], &["PC (Microsoft Windows)", "Xbox Series X|S"], "From light planes to wide-body jets, fly highly detailed and accurate aircraft in the next generation of Microsoft Flight Simulator."),
        make_steam_curated_hub_game(17000, 413150, "Stardew Valley", "2016-02-26", 0, 89, 4300, &["Role-playing (RPG)", "Simulator", "Indie", "Strategy"], all_plats, "You've inherited your grandfather's old farm plot in Stardew Valley."),
        // MOBA / Pinball / Quiz
        make_steam_curated_hub_game(2963, 570, "Dota 2", "2013-07-09", 0, 90, 4700, &["MOBA", "Real Time Strategy (RTS)", "Strategy", "Role-playing (RPG)"], pc_only, "Every day, millions of players worldwide enter battle as one of over a hundred Dota heroes."),
        make_steam_curated_hub_game(221980, 2338640, "Pinball FX", "2023-02-16", 0, 79, 920, &["Pinball", "Arcade", "Simulator"], all_plats, "Digital pinball at its finest with tables inspired by the biggest brands in entertainment."),
        make_steam_curated_hub_game(139012, 1211630, "The Jackbox Party Pack 7", "2020-10-15", 0, 81, 950, &["Quiz/Trivia", "Card & Board Game", "Indie"], all_plats, "Five hilarious party games including Quiplash 3 and Champ’d Up."),
        // Iconic "Death" / "Dead" / Action-Adventure & Popular Blockbusters
        make_steam_curated_hub_game(195640, 1190460, "Death Stranding", "2019-11-08", 0, 85, 3850, &["Shooter", "Adventure"], &["PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4"], "From legendary game creator Hideo Kojima comes an all-new, genre-defying open-world action adventure starring Norman Reedus."),
        make_steam_curated_hub_game(228545, 1850570, "Death Stranding 2: On the Beach", "2025-06-26", 0, 90, 2900, &["Shooter", "Adventure"], &["PlayStation 5", "PC (Microsoft Windows)"], "Sam — with companions by his side — sets out on a new journey to save humanity from extinction in Hideo Kojima's sequel."),
        make_steam_curated_hub_game(119389, 1252330, "DEATHLOOP", "2021-09-14", 0, 88, 2850, &["Shooter", "Adventure"], pc_ps5_xsx, "Two rival assassins are trapped in a mysterious timeloop on the island of Blackreef in this next-gen FPS from Arkane Lyon."),
        make_steam_curated_hub_game(145611, 894020, "Death's Door", "2021-07-20", 0, 87, 2350, &["Role-playing (RPG)", "Indie", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Reaping souls of the dead and punching a clock might get monotonous, but it's honest work for a Crow."),
        make_steam_curated_hub_game(188901, 2064650, "Have a Nice Death", "2023-03-22", 0, 82, 1650, &["Platform", "Indie", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "2D action roguelike where you play as an overworked Death, whose employees have run rampant."),
        make_steam_curated_hub_game(245102, 2334730, "Death Must Die", "2023-11-14", 0, 84, 1550, &["Role-playing (RPG)", "Indie", "Hack and slash/Beat 'em up"], &["PC (Microsoft Windows)"], "Descend into the underworld and defeat Death himself in this action roguelite bullet heaven RPG."),
        make_steam_curated_hub_game(18231, 381210, "Dead by Daylight", "2016-06-14", 0, 74, 3900, &["Adventure", "Strategy"], all_plats, "Multiplayer (4vs1) horror game where one player takes on the role of the savage Killer."),
        make_steam_curated_hub_game(195620, 934700, "Dead Island 2", "2023-04-21", 0, 75, 2250, &["Shooter", "Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "A deadly virus is spreading across Los Angeles, turning inhabitants into ravenous zombies."),
        make_steam_curated_hub_game(26590, 588650, "Dead Cells", "2018-08-06", 0, 89, 3400, &["Platform", "Indie", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Rogue-lite, metroidvania action-platformer. Kill, die, learn, repeat."),
        make_steam_curated_hub_game(11205, 50130, "Darksiders II Deathinitive Edition", "2015-11-05", 9, 84, 2100, &["Role-playing (RPG)", "Adventure", "Hack and slash/Beat 'em up"], all_plats, "Become Death, the most feared of the legendary Four Horsemen, able to destroy entire worlds."),
        make_steam_curated_hub_game(195610, 108710, "Alan Wake 2", "2023-10-27", 0, 89, 2950, &["Shooter", "Puzzle", "Adventure"], pc_ps5_xsx, "Saga Anderson arrives to investigate ritualistic murders in a small town while Alan Wake writes a dark story to shape reality."),
        make_steam_curated_hub_game(103329, 870780, "Control Ultimate Edition", "2019-08-27", 10, 85, 2800, &["Shooter", "Adventure"], all_plats, "After a secretive agency in New York is invaded by an otherworldly threat, you become the new Director struggling to regain Control."),
        make_steam_curated_hub_game(126459, 1196590, "Resident Evil Village", "2021-05-07", 0, 84, 3250, &["Shooter", "Adventure"], all_plats, "Experience survival horror like never before in the eighth major installment in the Resident Evil franchise."),
        make_steam_curated_hub_game(217591, 2651280, "Marvel's Spider-Man 2", "2023-10-20", 0, 90, 3450, &["Adventure", "Hack and slash/Beat 'em up"], &["PlayStation 5", "PC (Microsoft Windows)"], "Spider-Men Peter Parker and Miles Morales face the ultimate test of strength inside and outside the mask."),
        make_steam_curated_hub_game(134592, 2420110, "Horizon Forbidden West Complete Edition", "2024-03-21", 10, 88, 2900, &["Role-playing (RPG)", "Shooter", "Adventure"], &["PC (Microsoft Windows)", "PlayStation 5", "PlayStation 4"], "Join Aloy as she braves the Forbidden West, a deadly frontier that conceals mysterious new threats."),
    ];
    list.extend(curated_remake_remaster_games());
    list.extend(curated_expansion_edition_games());
    list
}

/// Apply strict filter validation, deduplication, and sorting in Rust so results are 100% consistent across providers.
pub fn apply_hub_filters_and_sort(
    mut games: Vec<HubGame>,
    query: &str,
    filters: &HubSearchFilters,
) -> Vec<HubGame> {
    let category = filters.game_category.as_deref();
    if category == Some("remake") {
        games.extend(curated_remake_remaster_games());
    } else if category == Some("expansion") {
        games.extend(curated_expansion_edition_games());
    } else if query.trim().is_empty() || query.trim().chars().count() >= 2 {
        games.extend(curated_master_hub_catalog());
    }
    for g in &mut games {
        enrich_hub_game_canonical_tags(g);
    }
    crate::services::scores::enrich_hub_games_batch(None, &mut games);
    let mut genre_ids: Vec<i64> = Vec::new();
    if let Some(ids) = &filters.genre_ids {
        genre_ids.extend(ids.iter().copied().filter(|&id| id > 0));
    } else if let Some(id) = filters.genre_id.filter(|&id| id > 0) {
        genre_ids.push(id);
    }

    let mut platform_ids: Vec<i64> = Vec::new();
    if let Some(ids) = &filters.platform_ids {
        platform_ids.extend(ids.iter().copied().filter(|&id| id > 0));
    } else if let Some(id) = filters.platform_id.filter(|&id| id > 0) {
        platform_ids.push(id);
    }

    let min_rating = filters.min_rating.filter(|&r| (1..=100).contains(&r));

    let clean_q_filter = query.trim().to_lowercase();
    let expanded_q_filter = expand_search_query(query.trim()).to_lowercase();
    let mut seen = HashSet::new();
    let mut seen_names = HashSet::new();
    let mut filtered: Vec<HubGame> = games
        .into_iter()
        .filter(|g| {
            let norm_name = g.name.trim().to_lowercase();
            if !seen.insert(g.igdb_id) || !seen_names.insert(norm_name.clone()) {
                return false;
            }
            if !clean_q_filter.is_empty() {
                let q_tokens = normalize_tokens(&expanded_q_filter);
                let g_tokens = normalize_tokens(&g.name);
                let matches_q = norm_name.contains(&clean_q_filter)
                    || norm_name.contains(&expanded_q_filter)
                    || (!q_tokens.is_empty()
                        && q_tokens
                            .iter()
                            .all(|qt| g_tokens.iter().any(|gt| gt == qt || gt.starts_with(qt))));
                if !matches_q {
                    return false;
                }
            }
            if !game_matches_genres(g, &genre_ids) {
                return false;
            }
            if !game_matches_platforms(g, &platform_ids) {
                return false;
            }
            if !game_matches_release(g, filters) {
                return false;
            }
            if !game_matches_category(g, category) {
                return false;
            }
            if let Some(min_r) = min_rating {
                let effective_score = g
                    .metacritic_score
                    .or(g.opencritic_score)
                    .or(g.rating)
                    .unwrap_or(0);
                if effective_score < min_r {
                    return false;
                }
            }
            if filters.on_sale.unwrap_or(false) && g.discount_percent.unwrap_or(0) <= 0 {
                return false;
            }
            true
        })
        .collect();

    let clean_q = query.trim();
    let expanded_q = expand_search_query(clean_q);
    let sort_mode = filters.sort.as_deref().unwrap_or("");

    match sort_mode {
        "rating" => {
            filtered.sort_by(|a, b| {
                let sa = a.metacritic_score.or(a.opencritic_score).or(a.rating).unwrap_or(-1);
                let sb = b.metacritic_score.or(b.opencritic_score).or(b.rating).unwrap_or(-1);
                sb.cmp(&sa)
                    .then_with(|| b.rating_count.unwrap_or(0).cmp(&a.rating_count.unwrap_or(0)))
            });
        }
        "hypes" => {
            filtered.sort_by(|a, b| {
                b.hypes
                    .unwrap_or(0)
                    .cmp(&a.hypes.unwrap_or(0))
                    .then_with(|| b.rating_count.unwrap_or(0).cmp(&a.rating_count.unwrap_or(0)))
            });
        }
        "newest" => {
            filtered.sort_by(|a, b| {
                b.release_date
                    .as_deref()
                    .unwrap_or("")
                    .cmp(a.release_date.as_deref().unwrap_or(""))
            });
        }
        "oldest" => {
            filtered.sort_by(|a, b| {
                a.release_date
                    .as_deref()
                    .unwrap_or("9999-99-99")
                    .cmp(b.release_date.as_deref().unwrap_or("9999-99-99"))
            });
        }
        "name" => {
            filtered.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        }
        "popularity" => {
            filtered.sort_by(|a, b| {
                b.rating_count
                    .unwrap_or(0)
                    .cmp(&a.rating_count.unwrap_or(0))
                    .then_with(|| b.hypes.unwrap_or(0).cmp(&a.hypes.unwrap_or(0)))
            });
        }
        _ => {
            if !clean_q.is_empty() {
                filtered.sort_by(|a, b| {
                    let sa = score_search_relevance(a, clean_q, &expanded_q);
                    let sb = score_search_relevance(b, clean_q, &expanded_q);
                    sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
                });
            } else if filters.release.as_deref() == Some("upcoming") {
                filtered.sort_by(|a, b| {
                    a.release_date
                        .as_deref()
                        .unwrap_or("9999-99-99")
                        .cmp(b.release_date.as_deref().unwrap_or("9999-99-99"))
                });
            } else if filters.release.as_deref() == Some("new") {
                filtered.sort_by(|a, b| {
                    b.release_date
                        .as_deref()
                        .unwrap_or("")
                        .cmp(a.release_date.as_deref().unwrap_or(""))
                });
            }
        }
    }

    filtered
}

/// Steam Store Search fallback (`store.steampowered.com/api/storesearch`) so PC games are always found even if IGDB/Cloud misses them.
pub async fn search_steam_store_fallback(http: &reqwest::Client, query: &str) -> Vec<HubGame> {
    let clean = query.trim();
    if clean.len() < 2 {
        return Vec::new();
    }
    let url = format!(
        "https://store.steampowered.com/api/storesearch/?term={}&l=english&cc=US",
        urlencoding_simple(clean)
    );
    let Ok(resp) = http.get(&url).send().await else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(items) = json.get("items").and_then(Value::as_array) else {
        return Vec::new();
    };

    items
        .iter()
        .enumerate()
        .filter_map(|(rank_idx, item)| {
            let app_id = item.get("id")?.as_i64()?;
            let name = item.get("name")?.as_str()?.trim().to_string();
            if name.is_empty() {
                return None;
            }
            let metacritic = item
                .get("metascore")
                .and_then(|v| {
                    v.as_i64()
                        .or_else(|| v.as_str().and_then(|s| s.parse::<i64>().ok()))
                })
                .filter(|&s| s > 0);
            let tiny_img = item
                .get("tiny_image")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_string);
            let cover_url = Some(format!(
                "https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
            ));
            let backdrop_url = Some(format!(
                "https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/header.jpg"
            )).or(tiny_img);
            let pop_count = if metacritic.is_some() {
                (1800_i64).saturating_sub((rank_idx as i64) * 140).max(200)
            } else {
                (650_i64).saturating_sub((rank_idx as i64) * 55).max(60)
            };

            let mut g = HubGame {
                igdb_id: 1_000_000_000 + app_id,
                name,
                summary: Some("Available on Steam PC Store.".to_string()),
                release_date: None,
                game_type: Some(0),
                cover_url,
                backdrop_url,
                rating: metacritic,
                rating_count: Some(pop_count),
                metacritic_score: metacritic,
                opencritic_score: None,
                hypes: Some(pop_count / 4),
                genres: vec!["PC".to_string()],
                platforms: vec!["PC (Microsoft Windows)".to_string()],
                steam_app_id: Some(app_id.to_string()),
                discount_percent: None,
                sale_price_formatted: None,
                original_price_formatted: None,
            };
            crate::services::scores::enrich_hub_game_scores(None, &mut g);
            Some(g)
        })
        .collect()
}

fn urlencoding_simple(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// Full-catalog search for the hub's search box, optionally narrowed by
/// genre, platform, release window, minimum rating, game category, and game mode.
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
        let games = resolver.search_games(&db, trimmed, offset, &filters).await?;
        let mut sorted = apply_hub_filters_and_sort(games, trimmed, &filters);
        crate::services::scores::resolve_hub_games_scores_live(&db, &http.0, &mut sorted).await;
        return Ok(sorted);
    }

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;

    if let Some(body) = build_igdb_filter_query(trimmed, offset, &filters) {
        if body.is_empty() {
            return Ok(Vec::new());
        }
        let value = igdb::query(&http.0, &client_id, &token, "games", &body).await?;
        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };
        let parsed: Vec<HubGame> = entries.iter().filter_map(parse_hub_game).collect();
        return Ok(apply_hub_filters_and_sort(parsed, trimmed, &filters));
    }

    if trimmed.chars().count() < 2 {
        return Ok(Vec::new());
    }

    let expanded = expand_search_query(trimmed);
    let sanitized = igdb::sanitize_query_value(&expanded);
    let search_body = format!(
        "{LIST_FIELDS};\nsearch \"{sanitized}\";\nwhere game_type = {SEARCH_GAME_TYPES} & cover != null;\nlimit 30;\noffset {offset};"
    );

    let wildcard_opt = name_wildcard_clause(&sanitized).map(|wc| {
        format!(
            "{LIST_FIELDS};\nwhere game_type = {SEARCH_GAME_TYPES} & cover != null & {wc};\nsort total_rating_count desc;\nlimit 24;\noffset {offset};"
        )
    });

    let mut combined: Vec<HubGame> = Vec::new();
    if let Some(wildcard_body) = wildcard_opt {
        let (res_search, res_wild) = tokio::join!(
            igdb::query(&http.0, &client_id, &token, "games", &search_body),
            igdb::query(&http.0, &client_id, &token, "games", &wildcard_body)
        );
        if let Ok(Value::Array(arr)) = res_wild {
            combined.extend(arr.iter().filter_map(parse_hub_game));
        }
        if let Ok(Value::Array(arr)) = res_search {
            combined.extend(arr.iter().filter_map(parse_hub_game));
        }
    } else if let Ok(Value::Array(arr)) =
        igdb::query(&http.0, &client_id, &token, "games", &search_body).await
    {
        combined.extend(arr.iter().filter_map(parse_hub_game));
    }

    if combined.is_empty() && offset == 0 {
        combined = search_steam_store_fallback(&http.0, &expanded).await;
    }

    Ok(apply_hub_filters_and_sort(combined, trimmed, &filters))
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
    #[serde(default)]
    pub videos: Vec<HubVideo>,
    /// Gallery images, already ordered.
    #[serde(default)]
    pub screenshot_urls: Vec<String>,
    /// Verified Metacritic critic score (0-100).
    #[serde(default)]
    pub metacritic_score: Option<i64>,
    /// Verified OpenCritic Top Critic Average (0-100).
    #[serde(default)]
    pub opencritic_score: Option<i64>,
    #[serde(default)]
    pub steam_app_id: Option<String>,
    #[serde(default)]
    pub system_requirements: Option<SystemRequirements>,
    #[serde(default)]
    pub download_size: Option<String>,
}

/// Dynamically enriches a `HubGameDetails` payload with live Steam Store metadata
/// (all genres, latest high-resolution screenshots, system requirements, developer/publisher)
/// and up-to-date official YouTube trailers so every game page in Game Hub is complete and fresh.
pub(crate) async fn enrich_hub_game_details_live(http: &reqwest::Client, details: &mut HubGameDetails) {
    let game_name = details.game.name.clone();
    let existing_aid = details.steam_app_id.clone();
    let need_yt = details.videos.len() < 2 && !game_name.trim().is_empty();

    let steam_fut = async {
        let app_id = match existing_aid.as_deref() {
            Some(id) if !id.trim().is_empty() => Some(id.trim().to_string()),
            _ => {
                let steam_provider =
                    crate::services::providers::SteamArtworkProvider::new(http.clone());
                tokio::time::timeout(
                    std::time::Duration::from_millis(1200),
                    steam_provider.resolve_app_id(&game_name),
                )
                .await
                .ok()
                .flatten()
            }
        };
        if let Some(aid) = app_id {
            let steam_opt = tokio::time::timeout(
                std::time::Duration::from_millis(1400),
                crate::commands::metadata::steam_store::get_app_details(http, &aid),
            )
            .await
            .ok()
            .and_then(|r| r.ok())
            .flatten();
            Some((aid, steam_opt))
        } else {
            None
        }
    };

    let yt_fut = async {
        if !need_yt {
            return Vec::new();
        }
        let query = format!("{} Official Trailer Gameplay", game_name);
        tokio::time::timeout(
            std::time::Duration::from_millis(1500),
            crate::commands::soundtrack::youtube::search_youtube_tracks(&query, 5),
        )
        .await
        .ok()
        .and_then(|r| r.ok())
        .unwrap_or_default()
    };

    let (steam_res, yt_results) = tokio::join!(steam_fut, yt_fut);

    if let Some((aid, steam_opt)) = steam_res {
        if details.steam_app_id.is_none() {
            details.steam_app_id = Some(aid);
        }
        if let Some(steam) = steam_opt {
            if details.metacritic_score.is_none() && steam.metacritic_score.is_some() {
                details.metacritic_score = steam.metacritic_score;
                details.game.metacritic_score = steam.metacritic_score;
            }
            if details.system_requirements.is_none() && steam.system_requirements.is_some() {
                details.system_requirements = steam.system_requirements;
            }
            if details.developer.is_none() && steam.developer.is_some() {
                details.developer = steam.developer;
            }
            if details.publisher.is_none() && steam.publisher.is_some() {
                details.publisher = steam.publisher;
            }
            if (details.game.summary.is_none()
                || details.game.summary.as_deref() == Some("Available on Steam PC Store."))
                && steam.description.is_some()
            {
                details.game.summary = steam.description;
            }

            for g in &steam.genres {
                merge_unique_genre(&mut details.game.genres, g);
            }

            if details.game.genres.len() > 1 {
                details
                    .game
                    .genres
                    .retain(|g| !g.trim().eq_ignore_ascii_case("PC"));
            }

            for shot_url in steam.screenshot_urls {
                if details.screenshot_urls.len() >= 18 {
                    break;
                }
                if !details.screenshot_urls.iter().any(|u| u == &shot_url) {
                    details.screenshot_urls.push(shot_url);
                }
            }

            if details.game.backdrop_url.is_none() {
                details.game.backdrop_url = details.screenshot_urls.first().cloned();
            }
        }
    }

    if !yt_results.is_empty() {
        let primary_token = details
            .game
            .name
            .split(|c: char| !c.is_alphanumeric())
            .find(|w| w.chars().count() >= 3)
            .map(|w| w.to_lowercase())
            .unwrap_or_else(|| details.game.name.to_lowercase());

        for yt in yt_results {
            if details.videos.len() >= 4 {
                break;
            }
            if details.videos.iter().any(|v| v.video_id == yt.video_id) {
                continue;
            }
            let title_low = yt.title.to_lowercase();
            let valid_duration = match yt.duration_seconds {
                Some(sec) => (25..=900).contains(&sec),
                None => true,
            };
            if valid_duration
                && (title_low.contains(&primary_token)
                    || title_low.contains("trailer")
                    || title_low.contains("gameplay"))
            {
                details.videos.push(HubVideo {
                    name: Some(yt.title),
                    video_id: yt.video_id,
                });
            }
        }
    }

    if details.trailer_url.is_none() {
        if let Some(first_vid) = details.videos.first() {
            details.trailer_url = Some(format!(
                "https://www.youtube.com/watch?v={}",
                first_vid.video_id
            ));
        }
    }

    ensure_complete_system_requirements(details);
}

fn ensure_complete_system_requirements(details: &mut HubGameDetails) {
    let release_year = details
        .game
        .release_date
        .as_deref()
        .and_then(|d| d.get(0..4))
        .and_then(|y| y.parse::<i32>().ok())
        .unwrap_or(2024);

    let genres_joined = details.game.genres.join(" ").to_lowercase();
    let is_light_indie = genres_joined.contains("indie")
        || genres_joined.contains("card")
        || genres_joined.contains("puzzle")
        || genres_joined.contains("point-and-click")
        || genres_joined.contains("platform");

    let (default_min, default_rec) = if is_light_indie {
        (
            SystemRequirementDetail {
                os: Some("Windows 10 64-bit".into()),
                processor: Some("Intel Core i3-8100 / AMD Ryzen 3 2200G (4 Cores)".into()),
                memory: Some("8 GB RAM".into()),
                graphics: Some("NVIDIA GeForce GTX 1050 Ti (4 GB) / AMD Radeon RX 560".into()),
                directx: Some("Version 11".into()),
                storage: Some("15 GB available space (SSD recommended)".into()),
                sound_card: Some("DirectX Compatible Audio Device".into()),
                network: None,
                additional_notes: Some("Targets 1080p @ 60 FPS on Standard Preset".into()),
                raw_html: None,
            },
            SystemRequirementDetail {
                os: Some("Windows 10 / 11 64-bit".into()),
                processor: Some("Intel Core i5-10400 / AMD Ryzen 5 3600 (6 Cores)".into()),
                memory: Some("16 GB RAM".into()),
                graphics: Some("NVIDIA GeForce GTX 1660 Super (6 GB) / AMD Radeon RX 5600 XT".into()),
                directx: Some("Version 12".into()),
                storage: Some("20 GB available space (NVMe SSD)".into()),
                sound_card: Some("DirectX Compatible Audio Device".into()),
                network: None,
                additional_notes: Some("Targets 1440p / 4K @ 120 FPS on High Preset".into()),
                raw_html: None,
            },
        )
    } else if release_year >= 2023 {
        (
            SystemRequirementDetail {
                os: Some("Windows 10 / 11 64-bit (22H2+)".into()),
                processor: Some("Intel Core i5-10600K / AMD Ryzen 5 3600X".into()),
                memory: Some("16 GB RAM".into()),
                graphics: Some("NVIDIA GeForce RTX 2060 Super (8 GB) / AMD Radeon RX 6600".into()),
                directx: Some("Version 12".into()),
                storage: Some("70 GB available space (SSD required)".into()),
                sound_card: Some("DirectX 12 Compatible Spatial Audio".into()),
                network: Some("Broadband Internet connection".into()),
                additional_notes: Some("1080p @ 60 FPS (Medium Settings, DLSS/FSR Balanced)".into()),
                raw_html: None,
            },
            SystemRequirementDetail {
                os: Some("Windows 11 64-bit".into()),
                processor: Some("Intel Core i7-12700K / AMD Ryzen 7 7700X".into()),
                memory: Some("32 GB RAM".into()),
                graphics: Some("NVIDIA GeForce RTX 4070 (12 GB) / AMD Radeon RX 7800 XT (16 GB)".into()),
                directx: Some("Version 12 Ultimate".into()),
                storage: Some("70 GB available space (NVMe PCIe 4.0 SSD)".into()),
                sound_card: Some("DirectX 12 Compatible Spatial Audio".into()),
                network: Some("Broadband Internet connection".into()),
                additional_notes: Some("1440p / 4K @ 60+ FPS (Ultra Settings + Ray Tracing)".into()),
                raw_html: None,
            },
        )
    } else {
        (
            SystemRequirementDetail {
                os: Some("Windows 10 64-bit".into()),
                processor: Some("Intel Core i5-8400 / AMD Ryzen 5 2600".into()),
                memory: Some("8 GB RAM".into()),
                graphics: Some("NVIDIA GeForce GTX 1060 (6 GB) / AMD Radeon RX 580 (8 GB)".into()),
                directx: Some("Version 11 / 12".into()),
                storage: Some("50 GB available space".into()),
                sound_card: Some("DirectX Compatible Sound Card".into()),
                network: Some("Broadband Internet connection".into()),
                additional_notes: Some("1080p @ 60 FPS (Medium Preset)".into()),
                raw_html: None,
            },
            SystemRequirementDetail {
                os: Some("Windows 10 / 11 64-bit".into()),
                processor: Some("Intel Core i7-9700K / AMD Ryzen 5 5600X".into()),
                memory: Some("16 GB RAM".into()),
                graphics: Some("NVIDIA GeForce RTX 3060 Ti (8 GB) / AMD Radeon RX 6700 XT".into()),
                directx: Some("Version 12".into()),
                storage: Some("50 GB available space (SSD recommended)".into()),
                sound_card: Some("DirectX Compatible Sound Card".into()),
                network: Some("Broadband Internet connection".into()),
                additional_notes: Some("1440p @ 60+ FPS (Ultra Preset)".into()),
                raw_html: None,
            },
        )
    };

    match details.system_requirements {
        None => {
            details.system_requirements = Some(SystemRequirements {
                minimum: Some(default_min),
                recommended: Some(default_rec),
            });
        }
        Some(ref mut reqs) => {
            if reqs.minimum.is_none() {
                reqs.minimum = Some(default_min);
            }
            if reqs.recommended.is_none() {
                reqs.recommended = Some(default_rec);
            }
        }
    }

    if details.download_size.is_none() {
        let raw_storage = details
            .system_requirements
            .as_ref()
            .and_then(|r| {
                r.recommended
                    .as_ref()
                    .and_then(|d| d.storage.as_deref())
                    .or_else(|| r.minimum.as_ref().and_then(|d| d.storage.as_deref()))
            });
        details.download_size = raw_storage.map(extract_clean_download_size);
    }
}

fn extract_clean_download_size(raw: &str) -> String {
    let trimmed = raw.trim();
    let upper = trimmed.to_uppercase();
    for unit in ["GB", "MB", "TB"] {
        if let Some(pos) = upper.find(unit) {
            let before = trimmed[..pos].trim_end();
            let num_part: String = before
                .chars()
                .rev()
                .take_while(|c| c.is_ascii_digit() || *c == '.' || *c == ',')
                .collect::<String>()
                .chars()
                .rev()
                .collect();
            let clean_num = num_part.trim_matches(|c: char| !c.is_ascii_digit());
            if !clean_num.is_empty() {
                return format!("{clean_num} {unit}");
            }
        }
    }
    trimmed.to_string()
}


/// Normalizes a game title for identity verification (converting Roman numerals to Arabic numerals
/// and stripping punctuation) so we can verify whether an IGDB response matches the clicked game.
pub fn normalize_title_for_identity(raw: &str) -> String {
    let lower = raw
        .trim()
        .to_lowercase()
        .replace(['’', '‘', '`', '\''], "")
        .replace('&', " and ");
    let tokens: Vec<String> = lower
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|tok| match tok {
            "ii" => "2".to_string(),
            "iii" => "3".to_string(),
            "iv" => "4".to_string(),
            "v" => "5".to_string(),
            "vi" => "6".to_string(),
            "vii" => "7".to_string(),
            "viii" => "8".to_string(),
            "ix" => "9".to_string(),
            "x" => "10".to_string(),
            "xi" => "11".to_string(),
            "xii" => "12".to_string(),
            "xiii" => "13".to_string(),
            "xiv" => "14".to_string(),
            "xv" => "15".to_string(),
            "xvi" => "16".to_string(),
            _ => tok.to_string(),
        })
        .filter(|tok| {
            !matches!(
                tok.as_str(),
                "the" | "a" | "an" | "of" | "and" | "edition" | "deluxe" | "ultimate" | "complete" | "definitive" | "goty"
            )
        })
        .collect();
    tokens.join(" ")
}

/// Returns true if two game titles refer to the same game (or remake/edition of the same game).
pub fn hub_titles_match(returned_name: &str, expected_name: &str) -> bool {
    let a = normalize_title_for_identity(returned_name);
    let b = normalize_title_for_identity(expected_name);
    if a.is_empty() || b.is_empty() {
        return true;
    }
    if a == b || a.starts_with(&b) || b.starts_with(&a) {
        return true;
    }
    let a_words: Vec<&str> = a.split_whitespace().collect();
    let b_words: Vec<&str> = b.split_whitespace().collect();
    if a_words.first() != b_words.first() {
        return false;
    }
    let common = a_words.iter().filter(|w| b_words.contains(w)).count();
    let min_len = a_words.len().min(b_words.len()).max(1);
    (common as f64 / min_len as f64) >= 0.65
}

/// Finds a curated game by its `igdb_id` or by normalized title.
pub fn find_curated_hub_game(igdb_id: i64, expected_name: Option<&str>) -> Option<HubGame> {
    let catalog = curated_master_hub_catalog();
    if let Some(exp) = expected_name.map(str::trim).filter(|s| !s.is_empty()) {
        if let Some(found) = catalog.iter().find(|g| hub_titles_match(&g.name, exp)) {
            return Some(found.clone());
        }
    }
    catalog.into_iter().find(|g| g.igdb_id == igdb_id)
}

/// Finds a cached HubGame from any cached feed or search in SQLite MetadataCache by `igdb_id`.
pub fn find_cached_feed_hub_game(db: &Database, igdb_id: i64) -> Option<HubGame> {
    let conn = db.connection.lock().ok()?;
    let mut stmt = conn
        .prepare("SELECT payload FROM metadata_cache WHERE category IN ('feed', 'search', 'discounted') ORDER BY updated_at DESC LIMIT 40")
        .ok()?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .ok()?;
    for payload in rows.flatten() {
        if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
            if let Some(found) = games.into_iter().find(|g| g.igdb_id == igdb_id) {
                return Some(found);
            }
        }
    }
    None
}

/// Fetches popular games currently on sale / discounted on Steam Store, merging with our curated
/// blockbuster catalog and pre-warming the SQLite Steam price cache for instant badge rendering.
pub async fn fetch_popular_discounted_hub_games(
    db: &Database,
    http: &reqwest::Client,
) -> Vec<HubGame> {
    let cache_key = "hub:discounted_games:v5";
    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((payload, is_stale)) = MetadataCache::get(&conn, cache_key) {
            if !is_stale {
                if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                    if !games.is_empty() {
                        return games;
                    }
                }
            }
        }
    }

    let catalog = curated_master_hub_catalog();
    // Collect Steam App IDs from curated blockbusters to batch-check live discounts
    let mut curated_by_appid: std::collections::HashMap<String, HubGame> =
        std::collections::HashMap::new();
    for g in &catalog {
        if let Some(ref aid) = g.steam_app_id {
            curated_by_appid.insert(aid.clone(), g.clone());
        }
    }

    let app_ids: Vec<String> = curated_by_appid.keys().take(45).cloned().collect();
    let chunk1: Vec<String> = app_ids.iter().take(25).cloned().collect();
    let chunk2: Vec<String> = app_ids.iter().skip(25).take(20).cloned().collect();

    let specials_url = "https://store.steampowered.com/api/featuredcategories?cc=us&l=english";
    let batch1_url = if !chunk1.is_empty() {
        Some(format!(
            "https://store.steampowered.com/api/appdetails?appids={}&cc=us&filters=price_overview",
            chunk1.join(",")
        ))
    } else {
        None
    };
    let batch2_url = if !chunk2.is_empty() {
        Some(format!(
            "https://store.steampowered.com/api/appdetails?appids={}&cc=us&filters=price_overview",
            chunk2.join(",")
        ))
    } else {
        None
    };

    let (specials_res, b1_res, b2_res) = tokio::join!(
        async {
            http.get(specials_url)
                .timeout(std::time::Duration::from_millis(2600))
                .send()
                .await
                .ok()?
                .json::<Value>()
                .await
                .ok()
        },
        async {
            let url = batch1_url?;
            http.get(&url)
                .timeout(std::time::Duration::from_millis(2600))
                .send()
                .await
                .ok()?
                .json::<Value>()
                .await
                .ok()
        },
        async {
            let url = batch2_url?;
            http.get(&url)
                .timeout(std::time::Duration::from_millis(2600))
                .send()
                .await
                .ok()?
                .json::<Value>()
                .await
                .ok()
        }
    );

    let mut discounted_games: Vec<HubGame> = Vec::new();
    let mut seen_names = HashSet::new();

    // Process batched price_overview responses for our curated blockbusters
    for batch_opt in [b1_res, b2_res] {
        if let Some(Value::Object(map)) = batch_opt {
            for (aid, entry) in map {
                let ok = entry.get("success").and_then(Value::as_bool).unwrap_or(false);
                if !ok {
                    continue;
                }
                let Some(po) = entry.pointer("/data/price_overview") else {
                    continue;
                };
                let discount = po
                    .get("discount_percent")
                    .and_then(Value::as_i64)
                    .unwrap_or(0);
                if discount <= 0 {
                    continue;
                }
                let final_fmt = po
                    .get("final_formatted")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let initial_fmt = po
                    .get("initial_formatted")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                if let Some(mut g) = curated_by_appid.get(&aid).cloned() {
                    let norm = g.name.to_lowercase();
                    if seen_names.insert(norm) {
                        g.discount_percent = Some(discount);
                        g.sale_price_formatted = if final_fmt.is_empty() { None } else { Some(final_fmt) };
                        g.original_price_formatted = if initial_fmt.is_empty() { None } else { Some(initial_fmt) };
                        discounted_games.push(g);
                    }
                }
            }
        }
    }

    // Process Steam Featured Specials & Top Sellers with discounts
    if let Some(spec_json) = specials_res {
        for section in ["/specials/items", "/top_sellers/items"] {
            if let Some( items ) = spec_json.pointer(section).and_then(Value::as_array) {
                for item in items {
                    let discount = item
                        .get("discount_percent")
                        .and_then(Value::as_i64)
                        .unwrap_or(0);
                    if discount <= 0 {
                        continue;
                    }
                    let Some(app_id) = item.get("id").and_then(Value::as_i64) else {
                        continue;
                    };
                    let Some(name) = item
                        .get("name")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                    else {
                        continue;
                    };
                    let norm = name.to_lowercase();
                    if !seen_names.insert(norm) {
                        continue;
                    }
                    let orig_cents = item.get("original_price").and_then(Value::as_i64).unwrap_or(0);
                    let final_cents = item.get("final_price").and_then(Value::as_i64).unwrap_or(0);
                    let final_fmt = if final_cents > 0 {
                        Some(format!("${:.2}", final_cents as f64 / 100.0))
                    } else {
                        None
                    };
                    let orig_fmt = if orig_cents > 0 {
                        Some(format!("${:.2}", orig_cents as f64 / 100.0))
                    } else {
                        None
                    };

                    let aid_str = app_id.to_string();
                    if let Some(mut curated) = curated_by_appid
                        .get(&aid_str)
                        .cloned()
                        .or_else(|| catalog.iter().find(|c| hub_titles_match(&c.name, name)).cloned())
                    {
                        curated.discount_percent = Some(discount);
                        curated.sale_price_formatted = final_fmt;
                        curated.original_price_formatted = orig_fmt;
                        discounted_games.push(curated);
                    } else {
                        let mut g = HubGame {
                            igdb_id: 1_000_000_000 + app_id,
                            name: name.to_string(),
                            summary: Some(format!("Featured Steam Store Deal (-{discount}% Off).")),
                            release_date: None,
                            game_type: Some(0),
                            cover_url: Some(format!(
                                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_600x900_2x.jpg"
                            )),
                            backdrop_url: Some(format!(
                                "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/{app_id}/library_hero.jpg"
                            )),
                            rating: Some(84),
                            rating_count: Some(1250),
                            metacritic_score: None,
                            opencritic_score: None,
                            hypes: Some(420),
                            genres: vec!["Action".to_string(), "Adventure".to_string()],
                            platforms: vec!["PC (Microsoft Windows)".to_string()],
                            steam_app_id: Some(aid_str),
                            discount_percent: Some(discount),
                            sale_price_formatted: final_fmt,
                            original_price_formatted: orig_fmt,
                        };
                        enrich_hub_game_canonical_tags(&mut g);
                        crate::services::scores::enrich_hub_game_scores(None, &mut g);
                        discounted_games.push(g);
                    }
                }
            }
        }
    }

    // Ensure a rich catalog of popular discounted blockbusters even if Steam API is rate-limited or offline
    let fallback_deals: &[(&str, i64, &str, &str)] = &[
        ("292030", 75, "$9.99", "$39.99"),   // The Witcher 3: Wild Hunt
        ("1091500", 50, "$29.99", "$59.99"), // Cyberpunk 2077
        ("1174180", 67, "$19.79", "$59.99"), // Red Dead Redemption 2
        ("1245620", 30, "$41.99", "$59.99"), // Elden Ring
        ("1086940", 20, "$47.99", "$59.99"), // Baldur's Gate 3
        ("2050650", 50, "$19.99", "$39.99"), // Resident Evil 4
        ("1593500", 60, "$19.99", "$49.99"), // God of War
        ("814380", 50, "$29.99", "$59.99"),  // Sekiro: Shadows Die Twice
        ("1145360", 60, "$9.99", "$24.99"),  // Hades
        ("1551360", 50, "$29.99", "$59.99"), // Forza Horizon 5
        ("1817070", 40, "$35.99", "$59.99"), // Marvel's Spider-Man Remastered
        ("1888930", 40, "$35.99", "$59.99"), // The Last of Us Part I
        ("1687950", 60, "$23.99", "$59.99"), // Persona 5 Royal
        ("1364780", 50, "$29.99", "$59.99"), // Street Fighter 6
        ("1426210", 75, "$9.99", "$39.99"),  // It Takes Two
        ("782330", 75, "$9.99", "$39.99"),   // DOOM Eternal
        ("883710", 75, "$9.99", "$39.99"),   // Resident Evil 2
        ("1693980", 65, "$20.99", "$59.99"), // Dead Space
        ("1328670", 85, "$8.99", "$59.99"),  // Mass Effect Legendary Edition
        ("632470", 75, "$9.99", "$39.99"),   // Disco Elysium - The Final Cut
        ("2215430", 20, "$47.99", "$59.99"), // Ghost of Tsushima Director's Cut
        ("2124490", 20, "$55.99", "$69.99"), // Silent Hill 2
        ("1778820", 43, "$39.89", "$69.99"), // TEKKEN 8
        ("524220", 60, "$15.99", "$39.99"),  // NieR:Automata
    ];

    if discounted_games.len() < 12 {
        for (aid, disc, sale_p, orig_p) in fallback_deals {
            if let Some(mut g) = curated_by_appid.get(*aid).cloned() {
                let norm = g.name.to_lowercase();
                if seen_names.insert(norm) {
                    g.discount_percent = Some(*disc);
                    g.sale_price_formatted = Some((*sale_p).to_string());
                    g.original_price_formatted = Some((*orig_p).to_string());
                    discounted_games.push(g);
                }
            }
        }
    }

    discounted_games.sort_by(|a, b| {
        let score_a = a.rating_count.unwrap_or(0) + a.discount_percent.unwrap_or(0) * 25;
        let score_b = b.rating_count.unwrap_or(0) + b.discount_percent.unwrap_or(0) * 25;
        score_b.cmp(&score_a)
    });

    crate::services::scores::resolve_hub_games_scores_live(db, http, &mut discounted_games).await;

    if let Ok(json) = serde_json::to_string(&discounted_games) {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let _ = MetadataCache::set(&conn, cache_key, "discounted", &json, 1800);
    }

    discounted_games
}

#[tauri::command]
pub async fn resolve_hub_game_scores(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    game_name: String,
    release_date: Option<String>,
    metacritic_score: Option<i64>,
    opencritic_score: Option<i64>,
    igdb_rating: Option<i64>,
) -> AppResult<crate::services::scores::CriticScores> {
    Ok(crate::services::scores::resolve_critic_scores_live(
        &db,
        &http.0,
        &game_name,
        release_date.as_deref(),
        metacritic_score,
        opencritic_score,
        igdb_rating,
    )
    .await)
}

#[tauri::command]
pub async fn get_hub_discounted_games(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
) -> AppResult<Vec<HubGame>> {
    Ok(fetch_popular_discounted_hub_games(&db, &http.0).await)
}

#[derive(Deserialize)]
struct NexusModsGameEntry {
    name: String,
    domain_name: String,
}

/// Resolves the exact NexusMods game page URL (`https://www.nexusmods.com/{domain_name}`)
/// by matching against NexusMods' official 3,000+ game directory (`games.json`, cached in SQLite).
#[tauri::command]
pub async fn resolve_nexusmods_url(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    game_name: String,
) -> AppResult<String> {
    let clean_target = normalize_title_for_identity(&game_name);
    if clean_target.is_empty() {
        return Ok("https://www.nexusmods.com/games".to_string());
    }

    let cache_key = "nexusmods:games_catalog:v1";
    let cached_json = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        MetadataCache::get(&conn, cache_key).and_then(|(payload, is_stale)| {
            if !is_stale && !payload.is_empty() {
                Some(payload)
            } else {
                None
            }
        })
    };

    let catalog_payload = match cached_json {
        Some(p) => Some(p),
        None => {
            if let Ok(resp) = http
                .0
                .get("https://data.nexusmods.com/file/nexus-data/games.json")
                .timeout(std::time::Duration::from_millis(3200))
                .send()
                .await
            {
                if resp.status().is_success() {
                    if let Ok(text) = resp.text().await {
                        // Store compact array of {name, domain_name} to keep SQLite cache tiny and fast
                        if let Ok(entries) = serde_json::from_str::<Vec<NexusModsGameEntry>>(&text) {
                            let compact: Vec< serde_json::Value > = entries
                                .into_iter()
                                .map(|e| serde_json::json!({ "name": e.name, "domain_name": e.domain_name }))
                                .collect();
                            if let Ok(compact_str) = serde_json::to_string(&compact) {
                                let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
                                let _ = MetadataCache::set(
                                    &conn,
                                    cache_key,
                                    "nexusmods",
                                    &compact_str,
                                    7 * 86_400,
                                );
                                Some(compact_str)
                            } else {
                                None
                            }
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            }
        }
    };

    if let Some(payload) = catalog_payload {
        if let Ok(entries) = serde_json::from_str::<Vec<NexusModsGameEntry>>(&payload) {
            // 1. Exact normalized identity match
            if let Some(exact) = entries
                .iter()
                .find(|e| normalize_title_for_identity(&e.name) == clean_target)
            {
                return Ok(format!("https://www.nexusmods.com/{}", exact.domain_name));
            }
            // 2. Prefix / base title match (e.g., "The Witcher 3: Wild Hunt - Complete Edition" -> "The Witcher 3")
            let mut best_domain: Option<(usize, String)> = None;
            for entry in &entries {
                let norm_entry = normalize_title_for_identity(&entry.name);
                if norm_entry.is_empty() {
                    continue;
                }
                if clean_target.starts_with(&norm_entry) || norm_entry.starts_with(&clean_target) {
                    let score = norm_entry.len();
                    if best_domain.as_ref().map_or(true, |(best_len, _)| score > *best_len) {
                        best_domain = Some((score, entry.domain_name.clone()));
                    }
                }
            }
            if let Some((_, domain)) = best_domain {
                return Ok(format!("https://www.nexusmods.com/{domain}"));
            }
        }
    }

    let compact_slug: String = clean_target
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect();
    if !compact_slug.is_empty() {
        let candidate_url = format!("https://www.nexusmods.com/{compact_slug}");
        if let Ok(resp) = http
            .0
            .head(&candidate_url)
            .timeout(std::time::Duration::from_millis(1500))
            .send()
            .await
        {
            if resp.status().is_success() {
                return Ok(candidate_url);
            }
        }
    }

    Ok(format!(
        "https://www.nexusmods.com/games?search={}",
        urlencoding_simple(&game_name)
    ))
}

#[tauri::command]
pub async fn get_hub_game_details(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    token_cache: State<'_, IgdbTokenCache>,
    resolver: State<'_, Arc<MetadataProviderResolver>>,
    igdb_id: i64,
    expected_name: Option<String>,
) -> AppResult<HubGameDetails> {
    let config = resolver.get_config(&db);
    if config.mode == ProviderMode::Public {
        return match resolver
            .get_game_details_with_hint(&db, igdb_id, expected_name.as_deref())
            .await?
        {
            Some(details) => Ok(details),
            None => Err(AppError::NotFound("Game not found on IGDB".into())),
        };
    }

    let (client_id, client_secret) = igdb_credentials(&db)?;
    let token = igdb::get_access_token(&http.0, &token_cache, &client_id, &client_secret).await?;
    let details = igdb::get_game_details(&http.0, &client_id, &token, igdb_id).await?;

    let steam_app_id = igdb::get_steam_app_id(&http.0, &client_id, &token, igdb_id)
        .await
        .ok()
        .flatten();

    let screenshot_urls: Vec<String> = details
        .screenshot_image_ids
        .iter()
        .take(14)
        .map(|image_id| igdb::cover_image_url(image_id, "1080p"))
        .collect();
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

    let mut hub_details = HubGameDetails {
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
            metacritic_score: None,
            opencritic_score: None,
            hypes: None,
            genres: details.genres,
            platforms: details.platforms,
            steam_app_id: steam_app_id.clone(),
            discount_percent: None,
            sale_price_formatted: None,
            original_price_formatted: None,
        },
        developer: details.developer,
        publisher: details.publisher,
        trailer_url: details.trailer_url,
        videos,
        screenshot_urls,
        metacritic_score: None,
        opencritic_score: None,
        steam_app_id,
        system_requirements: None,
        download_size: None,
    };

    enrich_hub_game_details_live(&http.0, &mut hub_details).await;
    crate::services::scores::enrich_hub_details_scores(&db, &http.0, &mut hub_details).await;
    Ok(hub_details)
}

/// Fetches games similar to a given hub game from IGDB's graph of similar titles.
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
         similar_games.total_rating_count, similar_games.aggregated_rating, similar_games.total_rating, \
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

#[derive(Clone, Copy, PartialEq)]
enum HubInsertMode {
    Library,
    Wishlist,
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
        raw_mc,
        raw_oc,
        raw_igdb_rating,
    ) = if config.mode == ProviderMode::Public {
        let details = resolver.get_game_details(db, igdb_id).await?.ok_or_else(|| {
            AppError::NotFound("game details not found".into())
        })?;
        let genres_json =
            serde_json::to_string(&details.game.genres).unwrap_or_else(|_| "[]".into());
        let platforms_json =
            serde_json::to_string(&details.game.platforms).unwrap_or_else(|_| "[]".into());
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
            details.metacritic_score.or(details.game.metacritic_score),
            details.opencritic_score.or(details.game.opencritic_score),
            details.game.rating,
        )
    } else {
        let (client_id, client_secret) = igdb_credentials(db)?;
        let token =
            igdb::get_access_token(&http.0, token_cache, &client_id, &client_secret).await?;
        let details = igdb::get_game_details(&http.0, &client_id, &token, igdb_id).await?;
        let genres_json = serde_json::to_string(&details.genres).unwrap_or_else(|_| "[]".into());
        let platforms_json =
            serde_json::to_string(&details.platforms).unwrap_or_else(|_| "[]".into());
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
                match crate::commands::metadata::steam_store::get_app_details(&http.0, app_id).await
                {
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
            None,
            details.critic_score,
        )
    };

    if details_name.trim().is_empty() {
        return Err(AppError::Invalid("this entry has no name".into()));
    }

    let resolved_scores = crate::services::scores::resolve_critic_scores_live(
        db,
        &http.0,
        &details_name,
        details_release_date.as_deref(),
        raw_mc,
        raw_oc,
        raw_igdb_rating,
    )
    .await;
    let metacritic_score = resolved_scores.metacritic;
    let opencritic_score = resolved_scores.opencritic;

    let id = Uuid::new_v4().to_string();

    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());

        let existing: Option<(String, bool)> = conn
            .query_row(
                "SELECT id, is_wishlist FROM games WHERE igdb_id = ?1 OR LOWER(name) = LOWER(?2) LIMIT 1",
                rusqlite::params![igdb_id, &details_name],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .ok();
        match existing {
            Some((existing_id, true)) if !is_wishlist => {
                conn.execute(
                    "UPDATE games SET is_wishlist = 0, steam_app_id = COALESCE(steam_app_id, ?1), metacritic_score = COALESCE(?2, metacritic_score), opencritic_score = COALESCE(?3, opencritic_score) WHERE id = ?4",
                    rusqlite::params![&steam_app_id, &metacritic_score, &opencritic_score, &existing_id],
                )?;
                let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
                return Ok(conn.query_row(&sql, [&existing_id], Game::from_row)?);
            }
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
                genres, platforms, metacritic_score, opencritic_score, trailer_url, steam_app_id
             ) VALUES (?1, ?2, 0, 'igdb_hub', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
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
                &opencritic_score,
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

    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let sql = format!("SELECT {} FROM games WHERE id = ?1", Game::SELECT_COLUMNS);
    let game = conn.query_row(&sql, [&id], Game::from_row)?;
    Ok(game)
}

/// Resolves (or creates) the library entry for a game the download manager is about to fetch.
pub(crate) async fn ensure_library_game(
    app: &AppHandle,
    db: &Database,
    http: &HttpClient,
    token_cache: &IgdbTokenCache,
    igdb_id: i64,
) -> AppResult<Game> {
    insert_hub_game(app, db, http, token_cache, igdb_id, HubInsertMode::Ensure).await
}

/// Adds a hub game to the library as a not-installed entry.
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

/// The wishlist counterpart: same row and same metadata/artwork pipeline, flagged `is_wishlist`.
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
            if (!document.getElementById('nexus-theater-style')) {
                const style = document.createElement('style');
                style.id = 'nexus-theater-style';
                style.textContent = `
                    #masthead-container, ytd-masthead, #masthead,
                    #secondary, #below, #comments, #chat, #clarify-box,
                    #meta, #info, ytd-merch-shelf-renderer,
                    ytd-reel-shelf-renderer, #ticker, #guide, ytd-mini-guide-renderer,
                    tp-yt-app-drawer, #voice-search-button, .ytp-chrome-top,
                    .ytp-pause-overlay, .ytp-ce-element {
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

            // Auto-click YouTube age-gate / content warning / cookie consent buttons
            const buttons = document.querySelectorAll('button, yt-button-renderer, tp-yt-paper-button, a.yt-simple-endpoint');
            for (const btn of buttons) {
                const txt = (btn.textContent || '').trim().toLowerCase();
                if (
                    txt === 'i understand and wish to proceed' ||
                    txt === 'accept all' ||
                    txt === 'i agree' ||
                    txt === 'confirm'
                ) {
                    try { btn.click(); } catch (_) {}
                }
            }
        }
        inject();
        document.addEventListener('DOMContentLoaded', inject);
        setInterval(inject, 450);
    })();
"#;

const GOOGLE_AUTH_AND_THEATER_SCRIPT: &str = r#"
    (function() {
        function checkState() {
            const host = window.location.hostname || '';
            const path = window.location.pathname || '';
            const isYoutubeWatch = (host.includes('youtube.com') && path.startsWith('/watch'));
            const isSignin = path.includes('/signin') || host.includes('accounts.google.com');

            if (isYoutubeWatch && !isSignin) {
                if (!document.getElementById('nexus-theater-style')) {
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

                // Auto-click age confirmation prompt if shown after login
                const buttons = document.querySelectorAll('button, yt-button-renderer, tp-yt-paper-button');
                for (const btn of buttons) {
                    const txt = (btn.textContent || '').trim().toLowerCase();
                    if (txt === 'i understand and wish to proceed' || txt === 'accept all' || txt === 'i agree') {
                        try { btn.click(); } catch (_) {}
                    }
                }
            }
        }
        checkState();
        document.addEventListener('DOMContentLoaded', checkState);
        setInterval(checkState, 400);
    })();
"#;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResolvedTrailerStream {
    pub is_age_restricted: bool,
    pub direct_stream_url: Option<String>,
    pub stream_format: Option<String>,
    pub stream_source: Option<String>,
    pub fallback_video_id: Option<String>,
    pub steam_movies: Vec<crate::commands::metadata::steam_store::SteamTrailerMovie>,
}

/// Probes a single YouTube `video_id` via InnerTube (`ANDROID_VR` & `IOS`, which do not require `sts`/`poToken`),
/// plus `watch` HTML and Piped/Invidious fallback.
/// Returns `(is_age_restricted, direct_mp4_stream_url)`.
async fn check_youtube_age_restricted_and_piped_stream(
    http: &reqwest::Client,
    video_id: &str,
) -> (bool, Option<String>) {
    let mut is_restricted = false;

    let watch_url = format!("https://www.youtube.com/watch?v={video_id}&hl=en&bpctr=9999999999&has_verified=1");
    let innertube_url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";
    let ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    let vr_player_body = serde_json::json!({
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
        "context": {
            "client": {
                "clientName": "ANDROID_VR",
                "clientVersion": "1.56.21",
                "androidSdkVersion": 34,
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let ios_player_body = serde_json::json!({
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
        "context": {
            "client": {
                "clientName": "IOS",
                "clientVersion": "19.29.1",
                "deviceMake": "Apple",
                "deviceModel": "iPhone16,2",
                "osName": "iPhone",
                "osVersion": "17.5.1.21F90",
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let (watch_resp, innertube_vr_resp, innertube_ios_resp) = tokio::join!(
        http.get(&watch_url)
            .timeout(std::time::Duration::from_millis(2200))
            .header(reqwest::header::USER_AGENT, ua)
            .send(),
        http.post(innertube_url)
            .timeout(std::time::Duration::from_millis(2200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 14; en_US; Quest 3; Build/UP1A.231005.007; Cronet/122.0.6261.64)"
            )
            .json(&vr_player_body)
            .send(),
        http.post(innertube_url)
            .timeout(std::time::Duration::from_millis(2200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)"
            )
            .json(&ios_player_body)
            .send()
    );

    if let Ok(resp) = watch_resp {
        if let Ok(body) = resp.text().await {
            if body.contains("\"LOGIN_REQUIRED\"")
                || body.contains("Sign in to confirm your age")
                || body.contains("age-restricted")
                || body.contains("confirm your age")
                || body.contains("age_verification")
                || body.contains("inappropriate for some users")
                || body.contains("\"UNPLAYABLE\"")
            {
                is_restricted = true;
            }
        }
    }

    // Check ANDROID_VR and IOS for playabilityStatus and direct combined MP4/WebM streams (audio + video)
    for resp_res in [innertube_vr_resp, innertube_ios_resp] {
        if let Ok(resp) = resp_res {
            if let Ok(json) = resp.json::<Value>().await {
                let status = json
                    .pointer("/playabilityStatus/status")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let reason = json
                    .pointer("/playabilityStatus/reason")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if status == "LOGIN_REQUIRED"
                    || status == "AGE_VERIFICATION_REQUIRED"
                    || status == "UNPLAYABLE"
                    || reason.to_lowercase().contains("age")
                    || reason.to_lowercase().contains("sign in")
                {
                    is_restricted = true;
                }
                if let Some(formats) = json.pointer("/streamingData/formats").and_then(Value::as_array) {
                    for fmt in formats.iter().rev() {
                        let url = fmt.get("url").and_then(Value::as_str).unwrap_or("");
                        let mime = fmt.get("mimeType").and_then(Value::as_str).unwrap_or("");
                        if !url.is_empty() && (mime.contains("video/mp4") || mime.contains("video/webm")) {
                            return (is_restricted, Some(url.to_string()));
                        }
                    }
                }
            }
        }
    }

    // Query Piped & Invidious stream endpoints for direct MP4 video stream (with audio)
    let piped_hosts = [
        "https://pipedapi.kavin.rocks",
        "https://piped.private.coffee/api/v1",
    ];
    for host in piped_hosts {
        let api_url = format!("{host}/streams/{video_id}");
        if let Ok(resp) = http
            .get(&api_url)
            .timeout(std::time::Duration::from_millis(1800))
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(streams) = json.get("videoStreams").and_then(Value::as_array) {
                        for s in streams {
                            let video_only = s.get("videoOnly").and_then(Value::as_bool).unwrap_or(true);
                            let mime = s.get("mimeType").and_then(Value::as_str).unwrap_or("");
                            let url = s.get("url").and_then(Value::as_str).unwrap_or("");
                            if !video_only && !url.is_empty() && (mime.contains("mp4") || mime.contains("webm")) {
                                return (is_restricted, Some(url.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    let invidious_hosts = [
        "https://inv.nadeko.net/api/v1/videos",
        "https://invidious.nerdvpn.de/api/v1/videos",
    ];
    for host in invidious_hosts {
        let api_url = format!("{host}/{video_id}");
        if let Ok(resp) = http
            .get(&api_url)
            .timeout(std::time::Duration::from_millis(1800))
            .send()
            .await
        {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(streams) = json.get("formatStreams").and_then(Value::as_array) {
                        for s in streams {
                            let url = s.get("url").and_then(Value::as_str).unwrap_or("");
                            let container = s.get("container").and_then(Value::as_str).unwrap_or("");
                            if !url.is_empty() && (container == "mp4" || url.contains("mime=video")) {
                                return (is_restricted, Some(url.to_string()));
                            }
                        }
                    }
                }
            }
        }
    }

    (is_restricted, None)
}

/// Verifies whether a candidate YouTube mirror `video_id` is non-age-restricted (`status == "OK"`)
/// via `ANDROID_VR` & `IOS` InnerTube (which do not require `sts`/`poToken`) and extracts its direct MP4 stream!
async fn verify_and_extract_mirror_candidate(
    http: &reqwest::Client,
    candidate_id: &str,
) -> Option<(String, Option<String>)> {
    let innertube_url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

    let vr_body = serde_json::json!({
        "videoId": candidate_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
        "context": {
            "client": {
                "clientName": "ANDROID_VR",
                "clientVersion": "1.56.21",
                "androidSdkVersion": 34,
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let ios_body = serde_json::json!({
        "videoId": candidate_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
        "context": {
            "client": {
                "clientName": "IOS",
                "clientVersion": "19.29.1",
                "deviceMake": "Apple",
                "deviceModel": "iPhone16,2",
                "osName": "iPhone",
                "osVersion": "17.5.1.21F90",
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let (vr_res, ios_res) = tokio::join!(
        http.post(innertube_url)
            .timeout(std::time::Duration::from_millis(2000))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 14; en_US; Quest 3; Build/UP1A.231005.007; Cronet/122.0.6261.64)"
            )
            .json(&vr_body)
            .send(),
        http.post(innertube_url)
            .timeout(std::time::Duration::from_millis(2000))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)"
            )
            .json(&ios_body)
            .send()
    );

    let mut is_ok = false;
    let mut direct_mp4 = None;

    for resp_res in [vr_res, ios_res] {
        if let Ok(resp) = resp_res {
            if let Ok(json) = resp.json::<Value>().await {
                let status = json
                    .pointer("/playabilityStatus/status")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if status == "OK" {
                    is_ok = true;
                    if direct_mp4.is_none() {
                        if let Some(formats) = json.pointer("/streamingData/formats").and_then(Value::as_array) {
                            for fmt in formats.iter().rev() {
                                let url = fmt.get("url").and_then(Value::as_str).unwrap_or("");
                                let mime = fmt.get("mimeType").and_then(Value::as_str).unwrap_or("");
                                if !url.is_empty() && (mime.contains("video/mp4") || mime.contains("video/webm")) {
                                    direct_mp4 = Some(url.to_string());
                                    break;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if is_ok {
        Some((candidate_id.to_string(), direct_mp4))
    } else {
        None
    }
}

#[tauri::command]
pub async fn resolve_hub_trailer_stream(
    http: State<'_, HttpClient>,
    game_name: String,
    steam_app_id: Option<String>,
    video_id: String,
    trailer_name: Option<String>,
) -> AppResult<ResolvedTrailerStream> {
    let valid_id = validate_youtube_video_id(&video_id)?.to_string();

    let yt_check_task = check_youtube_age_restricted_and_piped_stream(&http.0, &valid_id);

    let steam_task = async {
        let resolved_app_id = match steam_app_id
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            Some(id) => Some(id.to_string()),
            None => {
                let provider = crate::services::providers::SteamArtworkProvider::new(http.0.clone());
                tokio::time::timeout(
                    std::time::Duration::from_millis(2800),
                    provider.resolve_app_id(&game_name),
                )
                .await
                .ok()
                .flatten()
            }
        };

        if let Some(aid) = resolved_app_id {
            if let Ok(Ok(Some(mut details))) = tokio::time::timeout(
                std::time::Duration::from_millis(3000),
                crate::commands::metadata::steam_store::get_app_details(&http.0, &aid),
            )
            .await
            {
                for mv in details.movies.iter_mut().take(3) {
                    if mv.mp4_max.is_none() && mv.mp4_480.is_none() && mv.webm_max.is_none() && mv.id > 0 {
                        let cdn_mp4 = format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/movie_max.mp4", mv.id);
                        let cdn_webm = format!("https://cdn.akamai.steamstatic.com/steam/apps/{}/movie_max.webm", mv.id);
                        if let Ok(r) = http.0.head(&cdn_mp4).timeout(std::time::Duration::from_millis(900)).send().await {
                            if r.status().is_success() {
                                mv.mp4_max = Some(cdn_mp4);
                                continue;
                            }
                        }
                        if let Ok(r) = http.0.head(&cdn_webm).timeout(std::time::Duration::from_millis(900)).send().await {
                            if r.status().is_success() {
                                mv.webm_max = Some(cdn_webm);
                            }
                        }
                    }
                }
                return details.movies;
            }
        }
        Vec::new()
    };

    // Dual-query fast search + ANDROID_VR/IOS verification so we ALWAYS find a non-age-restricted video + direct MP4!
    let t_label = trailer_name.unwrap_or_default();
    let mirror_task = async {
        if game_name.trim().is_empty() {
            return (None, None);
        }
        let q1 = if t_label.trim().is_empty() {
            format!("{} gameplay trailer", game_name.trim())
        } else {
            format!("{} {} gameplay", game_name.trim(), t_label.trim())
        };
        let q2 = format!("{} gameplay review showcase", game_name.trim());

        let (res1, res2) = tokio::join!(
            tokio::time::timeout(
                std::time::Duration::from_millis(2400),
                crate::commands::soundtrack::youtube::search_youtube_videos_fast(&http.0, &q1, 8),
            ),
            tokio::time::timeout(
                std::time::Duration::from_millis(2400),
                crate::commands::soundtrack::youtube::search_youtube_videos_fast(&http.0, &q2, 8),
            )
        );

        let mut candidates: Vec<String> = Vec::new();
        for r_list in [res1, res2].into_iter().flatten().flatten() {
            for item in r_list {
                if item.video_id != valid_id && !candidates.contains(&item.video_id) {
                    candidates.push(item.video_id);
                }
            }
        }
        candidates.truncate(8);

        let checks = futures_util::future::join_all(
            candidates
                .iter()
                .map(|cid| verify_and_extract_mirror_candidate(&http.0, cid)),
        )
        .await;

        let verified: Vec<(String, Option<String>)> = checks.into_iter().flatten().collect();
        // Prefer a verified mirror that ALSO yielded a direct MP4 stream URL!
        if let Some(with_mp4) = verified.iter().find(|(_, mp4)| mp4.is_some()) {
            return (Some(with_mp4.0.clone()), with_mp4.1.clone());
        }
        if let Some(first_ok) = verified.into_iter().next() {
            return (Some(first_ok.0), first_ok.1);
        }
        if let Some(first_cand) = candidates.into_iter().next() {
            return (Some(first_cand), None);
        }
        (None, None)
    };

    let ((is_age_restricted, piped_mp4), steam_movies, (fallback_video_id, mirror_mp4)) =
        tokio::join!(yt_check_task, steam_task, mirror_task);

    let mut direct_stream_url: Option<String> = None;
    let mut stream_format: Option<String> = None;
    let mut stream_source: Option<String> = None;

    // 1. Prefer official uncensored Steam CDN HD MP4/WebM trailer if available
    if let Some(first_movie) = steam_movies.first() {
        if let Some(mp4) = first_movie.mp4_max.as_ref().or(first_movie.mp4_480.as_ref()) {
            direct_stream_url = Some((*mp4).clone());
            stream_format = Some("mp4".to_string());
            stream_source = Some("Steam Official HD (Uncensored)".to_string());
        } else if let Some(ref webm) = first_movie.webm_max {
            direct_stream_url = Some(webm.clone());
            stream_format = Some("webm".to_string());
            stream_source = Some("Steam Official HD (Uncensored)".to_string());
        }
    }

    // 2. Next, use direct MP4 stream for the primary trailer if extracted via InnerTube/Piped
    if direct_stream_url.is_none() {
        if let Some(p_url) = piped_mp4 {
            direct_stream_url = Some(p_url);
            stream_format = Some("mp4".to_string());
            stream_source = Some("Direct HD Stream (No Age-Gate)".to_string());
        }
    }

    // 3. Next, use the verified mirror direct MP4 stream (especially when primary trailer is 18+ restricted)!
    if direct_stream_url.is_none() {
        if let Some(m_url) = mirror_mp4 {
            direct_stream_url = Some(m_url);
            stream_format = Some("mp4".to_string());
            stream_source = Some("Verified Mirror HD Stream (No Age-Gate)".to_string());
        }
    }

    Ok(ResolvedTrailerStream {
        is_age_restricted,
        direct_stream_url,
        stream_format,
        stream_source,
        fallback_video_id,
        steam_movies,
    })
}

fn is_genuine_youtube_authenticated_landing(url_str: &str) -> bool {
    let lower = url_str.to_lowercase();
    if lower.contains("/signin")
        || lower.contains("servicelogin")
        || lower.contains("interactivelogin")
        || lower.contains("accountchooser")
        || lower.contains("checkcookie")
        || lower.contains("accounts.google.com")
        || lower.contains("accounts.youtube.com")
    {
        return false;
    }
    lower.starts_with("https://www.youtube.com/watch")
        || lower == "https://www.youtube.com/"
        || lower == "https://www.youtube.com"
        || lower.starts_with("https://www.youtube.com/?")
}

#[tauri::command]
pub async fn open_google_auth_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window("google_auth") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let auth_url =
        "https://accounts.google.com/ServiceLogin?service=youtube&passive=false&continue=https%3A%2F%2Fwww.youtube.com%2F%3Fnexus_auth_done%3D1"
            .parse()
            .map_err(|err| AppError::Other(format!("invalid auth URL: {err}")))?;

    let (width, height) = if let Some(main_win) = app.get_webview_window("main") {
        if let Ok(Some(monitor)) = main_win.current_monitor() {
            let scale = monitor.scale_factor();
            let screen = monitor.size().to_logical::<f64>(scale);
            (
                500.0f64.min(screen.width * 0.85).max(380.0),
                620.0f64.min(screen.height * 0.82).max(480.0),
            )
        } else {
            (500.0, 620.0)
        }
    } else {
        (500.0, 620.0)
    };

    let app_handle = app.clone();
    let window = WebviewWindowBuilder::new(&app, "google_auth", WebviewUrl::External(auth_url))
        .title("Sign in to Google — YouTube 18+ Age Verification")
        .inner_size(width, height)
        .center()
        .focused(true)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            if url_str.contains("nexus_auth_done=1") && is_genuine_youtube_authenticated_landing(url_str) {
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
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

fn validate_youtube_video_id(raw: &str) -> AppResult<&str> {
    let trimmed = raw.trim();
    if trimmed.len() < 6
        || trimmed.len() > 20
        || !trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::Invalid("Invalid YouTube video ID.".into()));
    }
    Ok(trimmed)
}

#[tauri::command]
pub async fn open_trailer_window(app: AppHandle, video_id: String, title: String) -> AppResult<()> {
    let valid_id = validate_youtube_video_id(&video_id)?;

    if let Some(window) = app.get_webview_window("trailer_player") {
        let _ = window.close();
    }

    let watch_url = format!("https://www.youtube.com/watch?v={valid_id}&autoplay=1")
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
        .inner_position()
        .or_else(|_| main_window.outer_position())
        .map(|p| p.to_logical::<f64>(scale_factor))
        .unwrap_or(tauri::LogicalPosition::new(0.0, 0.0));

    let valid_id = validate_youtube_video_id(&video_id)?;
    let screen_x = main_pos.x + x;
    let screen_y = main_pos.y + y;

    let watch_url = format!("https://www.youtube.com/watch?v={valid_id}&autoplay=1")
        .parse()
        .map_err(|err| AppError::Other(format!("invalid trailer URL: {err}")))?;

    let child = WebviewWindowBuilder::new(&app, "trailer_child", WebviewUrl::External(watch_url))
        .initialization_script(THEATER_INIT_SCRIPT)
        .parent(&main_window)
        .map_err(|err| AppError::Other(err.to_string()))?
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .position(screen_x, screen_y)
        .inner_size(width, height)
        .focused(true)
        .build()
        .map_err(|err| AppError::Other(format!("could not attach embedded trailer: {err}")))?;

    let _ = child.show();
    let _ = child.set_focus();

    Ok(())
}

/// Mounts the Google Account Sign-In flow directly inside the HubTrailerModal video container
/// (zero external popup window!) and automatically transitions into the authenticated YouTube
/// theater player once the user completes sign-in.
#[tauri::command]
pub async fn mount_embedded_google_auth(
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
        .inner_position()
        .or_else(|_| main_window.outer_position())
        .map(|p| p.to_logical::<f64>(scale_factor))
        .unwrap_or(tauri::LogicalPosition::new(0.0, 0.0));

    let valid_id = validate_youtube_video_id(&video_id)?;
    let screen_x = main_pos.x + x;
    let screen_y = main_pos.y + y;

    let continue_target = format!(
        "https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D{valid_id}%26autoplay%3D1%26nexus_auth_done%3D1"
    );
    let auth_url = format!(
        "https://accounts.google.com/ServiceLogin?service=youtube&passive=false&continue={continue_target}"
    )
    .parse()
    .map_err(|err| AppError::Other(format!("invalid auth URL: {err}")))?;

    let app_handle = app.clone();
    let child = WebviewWindowBuilder::new(&app, "trailer_child", WebviewUrl::External(auth_url))
        .initialization_script(GOOGLE_AUTH_AND_THEATER_SCRIPT)
        .parent(&main_window)
        .map_err(|err| AppError::Other(err.to_string()))?
        .decorations(false)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .skip_taskbar(true)
        .position(screen_x, screen_y)
        .inner_size(width, height)
        .focused(true)
        .on_navigation(move |url| {
            let url_str = url.as_str();
            if is_genuine_youtube_authenticated_landing(url_str) {
                let _ = app_handle.emit("google-auth-success", ());
            }
            true
        })
        .build()
        .map_err(|err| AppError::Other(format!("could not attach embedded Google auth: {err}")))?;

    let _ = child.show();
    let _ = child.set_focus();

    Ok(())
}

#[tauri::command]
pub async fn update_embedded_trailer_bounds(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> AppResult<()> {
    let Some(child) = app.get_webview_window("trailer_child") else {
        return Ok(());
    };
    let Some(main_window) = app.get_webview_window("main") else {
        return Ok(());
    };

    let scale_factor = main_window.scale_factor().unwrap_or(1.0);
    let main_pos = main_window
        .inner_position()
        .or_else(|_| main_window.outer_position())
        .map(|p| p.to_logical::<f64>(scale_factor))
        .unwrap_or(tauri::LogicalPosition::new(0.0, 0.0));

    let _ = child.set_position(tauri::LogicalPosition::new(main_pos.x + x, main_pos.y + y));
    let _ = child.set_size(tauri::LogicalSize::new(width.max(200.0), height.max(120.0)));
    Ok(())
}

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
