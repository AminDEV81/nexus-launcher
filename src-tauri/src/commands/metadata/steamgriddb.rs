use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::Value;

const API_BASE: &str = "https://www.steamgriddb.com/api/v2";

/// `steam_app_id` is interpolated into request *paths* below (e.g.
/// `/grids/steam/{app_id}`). It originates from the DB (frontend-shaped
/// on insert), so a value containing `/`, `..`, or `?` would rewrite the
/// request into a different endpoint. Steam AppIDs are plain integers —
/// anything else is rejected outright.
fn validate_steam_app_id(steam_app_id: &str) -> AppResult<()> {
    if !steam_app_id.is_empty() && steam_app_id.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(())
    } else {
        Err(AppError::Invalid("invalid Steam App ID".into()))
    }
}

async fn get(client: &reqwest::Client, api_key: &str, path: &str) -> AppResult<Value> {
    let response = client
        .get(format!("{API_BASE}{path}"))
        .header("Authorization", format!("Bearer {api_key}"))
        .send()
        .await
        .map_err(|err| AppError::Other(format!("SteamGridDB request failed: {err}")))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::Invalid(
            "SteamGridDB rejected the API key — double check it in Settings.".into(),
        ));
    }
    if !response.status().is_success() {
        // A 404 here just means "no assets of this type for this game",
        // which is common and not worth surfacing as an error.
        return Ok(Value::Null);
    }

    response
        .json::<Value>()
        .await
        .map_err(|err| AppError::Other(format!("unexpected SteamGridDB response: {err}")))
}

fn first_asset_url(value: &Value) -> Option<String> {
    value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|assets| assets.first())
        .and_then(|asset| asset.get("url"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Name-based lookup for games with no Steam AppID (Epic/GOG/EA/...).
/// Takes the top autocomplete result — good enough for an automatic
/// background fetch; a manual re-pick UI is left for a future pass.
/// Games *with* a Steam AppID skip this entirely: `get_artwork_url`
/// queries SteamGridDB's per-asset `/steam/{app_id}` endpoints directly,
/// which is both simpler and more likely to return a properly tagged
/// match than resolving a separate SteamGridDB game id first.
pub async fn search_game_id(
    client: &reqwest::Client,
    api_key: &str,
    name: &str,
) -> AppResult<Option<i64>> {
    let encoded = urlencoding_light(name);
    let value = get(client, api_key, &format!("/search/autocomplete/{encoded}")).await?;

    Ok(value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|results| results.first())
        .and_then(|result| result.get("id"))
        .and_then(Value::as_i64))
}

pub enum ArtworkKind {
    Hero,
    Logo,
}

impl ArtworkKind {
    fn segment(&self) -> &'static str {
        match self {
            ArtworkKind::Hero => "heroes",
            ArtworkKind::Logo => "logos",
        }
    }
}

/// Fetches the first available image URL for a game, preferring a
/// direct Steam AppID lookup (more likely to exist and to be tagged
/// appropriately) and falling back to the resolved SteamGridDB game id.
pub async fn get_artwork_url(
    client: &reqwest::Client,
    api_key: &str,
    kind: ArtworkKind,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Option<String>> {
    if let Some(steam_app_id) = steam_app_id {
        validate_steam_app_id(steam_app_id)?;
        let value = get(
            client,
            api_key,
            &format!("/{}/steam/{steam_app_id}", kind.segment()),
        )
        .await?;
        if let Some(url) = first_asset_url(&value) {
            return Ok(Some(url));
        }
    }

    if let Some(game_id) = sgdb_game_id {
        let value = get(
            client,
            api_key,
            &format!("/{}/game/{game_id}", kind.segment()),
        )
        .await?;
        if let Some(url) = first_asset_url(&value) {
            return Ok(Some(url));
        }
    }

    Ok(None)
}

/// Minimal, dependency-free percent-encoding for a search term used in
/// a URL path segment — avoids pulling in a whole crate just to escape
/// spaces and punctuation in game titles.
fn urlencoding_light(input: &str) -> String {
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

#[derive(Debug, Clone, Serialize)]
pub struct GridOption {
    pub id: i64,
    pub url: String,
    pub thumbnail_url: String,
    /// Most animated assets on SteamGridDB are animated WebP, which
    /// Chromium (and so WebView2) plays natively in a plain `<img>` —
    /// but some are `.webm`/`.mp4` video files instead, which an
    /// `<img>` simply can't render (shows as blank/broken). The
    /// frontend uses this to decide `<img>` vs `<video>` per option
    /// rather than assuming every animated result is WebP.
    pub mime: String,
    pub is_animated: bool,
    pub width: i64,
    pub height: i64,
}

fn parse_asset_option(item: &Value) -> Option<GridOption> {
    Some(GridOption {
        id: item.get("id")?.as_i64()?,
        url: item.get("url")?.as_str()?.to_string(),
        thumbnail_url: item
            .get("thumb")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        mime: item
            .get("mime")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        is_animated: item
            .get("animated")
            .and_then(Value::as_bool)
            .unwrap_or(false),
        width: item.get("width").and_then(Value::as_i64).unwrap_or(0),
        height: item.get("height").and_then(Value::as_i64).unwrap_or(0),
    })
}

/// Every option SteamGridDB has for a game under the given segment
/// (`"grids"` for covers, `"heroes"` for banners), static and animated
/// alike — the manual picker's data source. Unlike `get_artwork_url`'s
/// "just give me one", this is the full list; the frontend pages
/// through it.
///
/// Fetched as two *separate* requests (`types=static`, `types=animated`)
/// rather than one combined `types=static,animated` request relying on
/// each result's own `animated` field to tell them apart: comma-list
/// query params are a common source of subtly-wrong behavior across
/// APIs, and this way `is_animated` is set from *which request returned
/// it*, not from a field whose exact name/presence isn't guaranteed —
/// self-verifying by construction instead of a guess.
pub async fn search_asset_options(
    client: &reqwest::Client,
    api_key: &str,
    segment: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    if steam_app_id.is_none() && sgdb_game_id.is_none() {
        return Ok(Vec::new());
    }

    let mut static_options = fetch_assets(
        client,
        api_key,
        segment,
        steam_app_id,
        sgdb_game_id,
        "static",
    )
    .await?;
    for option in &mut static_options {
        option.is_animated = false;
    }

    let mut animated_options = fetch_assets(
        client,
        api_key,
        segment,
        steam_app_id,
        sgdb_game_id,
        "animated",
    )
    .await?;
    for option in &mut animated_options {
        option.is_animated = true;
    }

    static_options.extend(animated_options);
    Ok(static_options)
}

pub async fn search_grid_options(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    search_asset_options(client, api_key, "grids", steam_app_id, sgdb_game_id).await
}

/// Same idea as `search_grid_options` but for hero/banner artwork — the
/// "Change Banner" picker's data source.
pub async fn search_hero_options(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    search_asset_options(client, api_key, "heroes", steam_app_id, sgdb_game_id).await
}

pub async fn search_logo_options(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    search_asset_options(client, api_key, "logos", steam_app_id, sgdb_game_id).await
}

async fn fetch_assets(
    client: &reqwest::Client,
    api_key: &str,
    segment: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
    asset_type: &str,
) -> AppResult<Vec<GridOption>> {
    let path = if let Some(steam_app_id) = steam_app_id {
        validate_steam_app_id(steam_app_id)?;
        format!("/{segment}/steam/{steam_app_id}?types={asset_type}")
    } else if let Some(game_id) = sgdb_game_id {
        format!("/{segment}/game/{game_id}?types={asset_type}")
    } else {
        return Ok(Vec::new());
    };

    let value = get(client, api_key, &path).await?;
    Ok(value
        .get("data")
        .and_then(Value::as_array)
        .map(|items| items.iter().filter_map(parse_asset_option).collect())
        .unwrap_or_default())
}

/// SteamGridDB has no real concept of "game screenshots" — heroes are
/// wide artwork banners, sometimes stylized key art, sometimes an
/// actual in-game screenshot, uploaded by the community. This is a
/// best-effort substitute for the details panel's screenshot gallery
/// when a game has no IGDB screenshots (either because IGDB isn't
/// configured, or IGDB simply doesn't have any for that title) — every
/// hero SteamGridDB has, not just the single best one `get_artwork_url`
/// picks for the banner.
pub async fn list_hero_urls(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<String>> {
    let path = if let Some(steam_app_id) = steam_app_id {
        validate_steam_app_id(steam_app_id)?;
        format!("/heroes/steam/{steam_app_id}?types=static")
    } else if let Some(game_id) = sgdb_game_id {
        format!("/heroes/game/{game_id}?types=static")
    } else {
        return Ok(Vec::new());
    };

    let value = get(client, api_key, &path).await?;
    Ok(value
        .get("data")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("url").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default())
}

pub async fn search_icons(
    client: &reqwest::Client,
    api_key: &str,
    term: &str,
) -> AppResult<Vec<GridOption>> {
    let encoded = urlencoding_light(term);
    let auto_res = get(client, api_key, &format!("/search/autocomplete/{encoded}")).await?;
    let mut options = Vec::new();

    if let Some(games) = auto_res.get("data").and_then(Value::as_array) {
        for game in games.iter().take(2) {
            if let Some(game_id) = game.get("id").and_then(Value::as_i64) {
                let icon_res = get(client, api_key, &format!("/icons/game/{game_id}")).await?;
                if let Some(icons) = icon_res.get("data").and_then(Value::as_array) {
                    for icon in icons.iter().take(6) {
                        if let Some(opt) = parse_asset_option(icon) {
                            options.push(opt);
                        }
                    }
                }
            }
        }
    }

    Ok(options)
}

