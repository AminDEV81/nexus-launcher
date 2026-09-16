use super::token_cache::IgdbTokenCache;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const TOKEN_URL: &str = "https://id.twitch.tv/oauth2/token";
const API_BASE: &str = "https://api.igdb.com/v4";

/// Twitch's client-credentials token endpoint. IGDB is owned by Twitch,
/// so "IGDB API key" in practice means a Twitch Developer application's
/// Client ID + Client Secret exchanged here for a short-lived app token.
pub async fn get_access_token(
    client: &reqwest::Client,
    cache: &IgdbTokenCache,
    client_id: &str,
    client_secret: &str,
) -> AppResult<String> {
    if let Some(token) = cache.get_valid() {
        return Ok(token);
    }

    #[derive(serde::Deserialize)]
    struct TokenResponse {
        access_token: String,
        expires_in: u64,
    }

    let response = client
        .post(TOKEN_URL)
        .query(&[
            ("client_id", client_id),
            ("client_secret", client_secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|err| {
            AppError::Other(format!("could not reach Twitch for an IGDB token: {err}"))
        })?;

    if !response.status().is_success() {
        return Err(AppError::Invalid(
            "Twitch rejected the IGDB Client ID/Secret — double check them in Settings.".into(),
        ));
    }

    let token: TokenResponse = response
        .json()
        .await
        .map_err(|err| AppError::Other(format!("unexpected token response from Twitch: {err}")))?;

    cache.store(token.access_token.clone(), token.expires_in);
    Ok(token.access_token)
}

/// Raw APIcalypse query against an IGDB endpoint. Shared by the exact
/// match/detail helpers here and by the Game Hub's curated list queries
/// (`commands::hub`), which have no name to search on.
pub(crate) async fn query(
    client: &reqwest::Client,
    client_id: &str,
    token: &str,
    endpoint: &str,
    body: &str,
) -> AppResult<Value> {
    let response = client
        .post(format!("{API_BASE}/{endpoint}"))
        .header("Client-ID", client_id)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "text/plain")
        .body(body.to_string())
        .send()
        .await
        .map_err(|err| AppError::Other(format!("IGDB request failed: {err}")))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(AppError::Other(format!("IGDB returned {status}: {body}")));
    }

    response
        .json::<Value>()
        .await
        .map_err(|err| AppError::Other(format!("unexpected IGDB response: {err}")))
}

#[derive(Debug, Clone, Serialize)]
pub struct IgdbSearchResult {
    pub igdb_id: i64,
    pub name: String,
    pub release_year: Option<i32>,
    pub cover_url: Option<String>,
}

/// Escapes a value for use inside an APIcalypse double-quoted string
/// literal. `"` would terminate the literal early, and a trailing `\`
/// could consume the closing quote — either turns the rest of the query
/// body (our `where`/`limit` statements) into attacker-influenced
/// parsing. Neither character is meaningful in a game or genre name, so
/// they're stripped rather than escaped.
pub(crate) fn sanitize_query_value(value: &str) -> String {
    value.replace(['"', '\\'], "")
}

/// A plain-text search, used both for the automatic best-guess match
/// right after a game is added, and (once Epic 8 builds the UI for it)
/// manual re-matching when that guess is wrong.
pub async fn search(
    client: &reqwest::Client,
    client_id: &str,
    token: &str,
    name: &str,
) -> AppResult<Vec<IgdbSearchResult>> {
    let sanitized = sanitize_query_value(name);
    let body = format!(
        "search \"{sanitized}\";\nfields name, first_release_date, cover.image_id;\nlimit 8;"
    );

    let value = query(client, client_id, token, "games", &body).await?;
    let Value::Array(entries) = value else {
        return Ok(Vec::new());
    };

    Ok(entries.iter().filter_map(parse_search_result).collect())
}

fn parse_search_result(entry: &Value) -> Option<IgdbSearchResult> {
    let igdb_id = entry.get("id")?.as_i64()?;
    let name = entry.get("name")?.as_str()?.to_string();
    let release_year = entry
        .get("first_release_date")
        .and_then(Value::as_i64)
        .and_then(unix_timestamp_to_year);
    let cover_url = entry
        .get("cover")
        .and_then(|cover| cover.get("image_id"))
        .and_then(Value::as_str)
        .map(|image_id| cover_image_url(image_id, "cover_small"));

    Some(IgdbSearchResult {
        igdb_id,
        name,
        release_year,
        cover_url,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IgdbVideo {
    pub name: Option<String>,
    pub video_id: String,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct IgdbGameDetails {
    pub name: String,
    pub description: Option<String>,
    pub release_date: Option<String>,
    pub game_type: Option<i64>,
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub cover_image_id: Option<String>,
    pub screenshot_image_ids: Vec<String>,
    /// IGDB's critic-aggregate score (0-100), used as a practical
    /// stand-in for Metacritic: unlike Metacritic and OpenCritic, IGDB
    /// actually has a free, public API, and its aggregated_rating is
    /// the closest equivalent available without a paid data source.
    pub critic_score: Option<i64>,
    pub trailer_url: Option<String>,
    pub videos: Vec<IgdbVideo>,
}

pub async fn get_game_details(
    client: &reqwest::Client,
    client_id: &str,
    token: &str,
    igdb_id: i64,
) -> AppResult<IgdbGameDetails> {
    let body = format!(
        "fields name, summary, first_release_date, game_type, genres.name, platforms.name, \
         involved_companies.company.name, involved_companies.developer, involved_companies.publisher, \
         cover.image_id, screenshots.image_id, videos.video_id, videos.name, aggregated_rating;\n\
         where id = {igdb_id};"
    );

    let value = query(client, client_id, token, "games", &body).await?;
    let Value::Array(entries) = value else {
        return Err(AppError::NotFound(format!(
            "no IGDB game with id {igdb_id}"
        )));
    };
    let entry = entries
        .into_iter()
        .next()
        .ok_or_else(|| AppError::NotFound(format!("no IGDB game with id {igdb_id}")))?;

    Ok(parse_game_details(&entry))
}

fn parse_game_details(entry: &Value) -> IgdbGameDetails {
    let game_type = entry.get("game_type").and_then(Value::as_i64);
    let name = entry
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let description = entry
        .get("summary")
        .and_then(Value::as_str)
        .map(str::to_string);

    let release_date = entry
        .get("first_release_date")
        .and_then(Value::as_i64)
        .and_then(unix_timestamp_to_date);

    let genres = string_list(entry, "genres");
    let platforms = string_list(entry, "platforms");

    let (developer, publisher) = involved_companies(entry);

    let cover_image_id = entry
        .get("cover")
        .and_then(|cover| cover.get("image_id"))
        .and_then(Value::as_str)
        .map(str::to_string);

    let screenshot_image_ids = entry
        .get("screenshots")
        .and_then(Value::as_array)
        .map(|screenshots| {
            screenshots
                .iter()
                .filter_map(|shot| shot.get("image_id").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let critic_score = entry
        .get("aggregated_rating")
        .and_then(Value::as_f64)
        .map(|rating| rating.round() as i64);

    let videos: Vec<IgdbVideo> = entry
        .get("videos")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|item| {
                    let video_id = item.get("video_id")?.as_str()?.to_string();
                    let name = item.get("name").and_then(Value::as_str).map(str::to_string);
                    Some(IgdbVideo { name, video_id })
                })
                .collect()
        })
        .unwrap_or_default();

    let trailer_url = videos
        .first()
        .map(|video| format!("https://www.youtube.com/watch?v={}", video.video_id));

    IgdbGameDetails {
        name,
        description,
        release_date,
        game_type,
        genres,
        platforms,
        developer,
        publisher,
        cover_image_id,
        screenshot_image_ids,
        critic_score,
        trailer_url,
        videos,
    }
}

/// `genres`/`platforms` both come back as `[{"id": .., "name": ".."}]`
/// once requested with the `.name` field selector.
fn string_list(entry: &Value, key: &str) -> Vec<String> {
    entry
        .get(key)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("name").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// `involved_companies` is a flat list with `developer`/`publisher`
/// booleans per entry rather than separate fields — this picks the
/// first company flagged as each role.
fn involved_companies(entry: &Value) -> (Option<String>, Option<String>) {
    let Some(companies) = entry.get("involved_companies").and_then(Value::as_array) else {
        return (None, None);
    };

    let mut developer = None;
    let mut publisher = None;

    for company in companies {
        let name = company
            .get("company")
            .and_then(|c| c.get("name"))
            .and_then(Value::as_str)
            .map(str::to_string);
        let Some(name) = name else { continue };

        if developer.is_none() && company.get("developer").and_then(Value::as_bool) == Some(true) {
            developer = Some(name.clone());
        }
        if publisher.is_none() && company.get("publisher").and_then(Value::as_bool) == Some(true) {
            publisher = Some(name);
        }
    }

    (developer, publisher)
}

fn unix_timestamp_to_year(timestamp: i64) -> Option<i32> {
    chrono::DateTime::from_timestamp(timestamp, 0)
        .map(|dt| dt.format("%Y").to_string().parse().unwrap_or(0))
}

fn unix_timestamp_to_date(timestamp: i64) -> Option<String> {
    chrono::DateTime::from_timestamp(timestamp, 0).map(|dt| dt.format("%Y-%m-%d").to_string())
}

/// Resolves a game's Steam AppID through IGDB's `external_games`.
/// `external_game_source = 1` is Steam — the endpoint's old `category`
/// field was removed, the same IGDB migration that turned
/// `games.category` into `game_type` (both verified live).
pub async fn get_steam_app_id(
    client: &reqwest::Client,
    client_id: &str,
    token: &str,
    igdb_id: i64,
) -> AppResult<Option<String>> {
    let body = format!("fields uid;\nwhere game = {igdb_id} & external_game_source = 1;\nlimit 1;");
    let value = query(client, client_id, token, "external_games", &body).await?;
    let Value::Array(entries) = value else {
        return Ok(None);
    };
    Ok(entries
        .first()
        .and_then(|entry| entry.get("uid"))
        .and_then(Value::as_str)
        .map(str::to_string))
}

pub fn cover_image_url(image_id: &str, size: &str) -> String {
    format!("https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IgdbCharacterResult {
    pub id: i64,
    pub name: String,
    pub image_url: String,
    pub thumbnail_url: String,
    pub game_name: Option<String>,
}

pub async fn search_characters(
    client: &reqwest::Client,
    client_id: &str,
    token: &str,
    term: &str,
    offset: usize,
    limit: usize,
) -> AppResult<Vec<IgdbCharacterResult>> {
    let sanitized = sanitize_query_value(term);
    let trimmed = sanitized.trim();
    let body = if trimmed.is_empty() {
        format!(
            "fields name, mug_shot.image_id, games.name;\nwhere mug_shot != null;\nlimit {limit};\noffset {offset};"
        )
    } else {
        format!(
            "search \"{trimmed}\";\nfields name, mug_shot.image_id, games.name;\nwhere mug_shot != null;\nlimit {limit};\noffset {offset};"
        )
    };

    let mut results = Vec::new();

    if let Ok(value) = query(client, client_id, token, "characters", &body).await {
        if let Some(arr) = value.as_array() {
            for item in arr {
                let id = item.get("id").and_then(Value::as_i64).unwrap_or(0);
                let name = item.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                let image_id = item.get("mug_shot").and_then(|m| m.get("image_id")).and_then(Value::as_str);
                if let Some(img_id) = image_id {
                    let game_name = item.get("games")
                        .and_then(Value::as_array)
                        .and_then(|g| g.first())
                        .and_then(|g| g.get("name"))
                        .and_then(Value::as_str)
                        .map(|s| s.to_string());

                    results.push(IgdbCharacterResult {
                        id,
                        name,
                        image_url: format!("https://images.igdb.com/igdb/image/upload/t_cover_big/{img_id}.jpg"),
                        thumbnail_url: format!("https://images.igdb.com/igdb/image/upload/t_thumb/{img_id}.jpg"),
                        game_name,
                    });
                }
            }
        }
    }

    // If searching and results are fewer than desired, also search games covers
    if !trimmed.is_empty() && results.len() < limit {
        let game_body = format!(
            "search \"{trimmed}\";\nfields name, cover.image_id;\nwhere cover != null;\nlimit 8;\noffset {offset};"
        );
        if let Ok(value) = query(client, client_id, token, "games", &game_body).await {
            if let Some(arr) = value.as_array() {
                for item in arr {
                    let id = item.get("id").and_then(Value::as_i64).unwrap_or(0);
                    let name = item.get("name").and_then(Value::as_str).unwrap_or("").to_string();
                    let image_id = item.get("cover").and_then(|c| c.get("image_id")).and_then(Value::as_str);
                    if let Some(img_id) = image_id {
                        results.push(IgdbCharacterResult {
                            id: 1_000_000 + id,
                            name: format!("{name} (Cover)"),
                            image_url: format!("https://images.igdb.com/igdb/image/upload/t_cover_big/{img_id}.jpg"),
                            thumbnail_url: format!("https://images.igdb.com/igdb/image/upload/t_thumb/{img_id}.jpg"),
                            game_name: Some(name),
                        });
                    }
                }
            }
        }
    }

    Ok(results)
}


#[cfg(test)]
mod tests {
    use super::sanitize_query_value;

    /// Both characters can terminate/extend IGDB's string literals and
    /// turn the rest of an APIcalypse body into user-influenced parsing
    /// — they must never survive sanitization.
    #[test]
    fn sanitize_strips_quote_and_backslash() {
        assert_eq!(sanitize_query_value(r#"witcher "3"#), "witcher 3");
        assert_eq!(sanitize_query_value(r#"path\to\game\"#), "pathtogame");
        assert_eq!(sanitize_query_value("grand theft auto"), "grand theft auto");
        assert_eq!(sanitize_query_value(""), "");
    }
}
