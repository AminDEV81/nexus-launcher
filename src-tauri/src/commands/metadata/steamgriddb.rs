use crate::error::{AppError, AppResult};
use crate::services::scores::normalize_game_title;
use futures_util::future::join_all;
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;

const API_BASE: &str = "https://www.steamgriddb.com/api/v2";

/// Built-in default SteamGridDB API key so the desktop app can always query
/// SteamGridDB API v2 directly (multi-page static + animated grids, heroes,
/// logos, and autocomplete) even when the user hasn't entered a custom key
/// in Settings.
pub const DEFAULT_STEAMGRIDDB_API_KEY: &str = "b852e99f9735844f4a44a6acad6cd456";

pub fn effective_api_key(configured: Option<&str>) -> &str {
    match configured.map(str::trim).filter(|s| !s.is_empty()) {
        Some(k) => k,
        None => DEFAULT_STEAMGRIDDB_API_KEY,
    }
}

/// Extracts a numeric SteamGridDB game ID if the user pasted a SteamGridDB URL
/// (e.g. `https://www.steamgriddb.com/game/5439908`) or a raw numeric ID (`5439908`).
pub fn extract_sgdb_game_id_from_input(input: &str) -> Option<i64> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.bytes().all(|b| b.is_ascii_digit()) {
        if let Ok(id) = trimmed.parse::<i64>() {
            if id > 0 {
                return Some(id);
            }
        }
    }
    if let Some(idx) = trimmed.find("/game/") {
        let rest = &trimmed[idx + 6..];
        let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(id) = digits.parse::<i64>() {
            if id > 0 {
                return Some(id);
            }
        }
    }
    None
}

fn validate_steam_app_id(steam_app_id: &str) -> AppResult<()> {
    if !steam_app_id.is_empty() && steam_app_id.bytes().all(|byte| byte.is_ascii_digit()) {
        Ok(())
    } else {
        Err(AppError::Invalid("invalid Steam App ID".into()))
    }
}

async fn get_with_key(client: &reqwest::Client, api_key: &str, path: &str) -> AppResult<Value> {
    let url = format!("{API_BASE}{path}");
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("Accept", "application/json")
        .header("Cache-Control", "no-cache")
        .send()
        .await
        .map_err(|err| AppError::Other(format!("SteamGridDB request failed: {err}")))?;

    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(AppError::Invalid(
            "SteamGridDB rejected the API key — double check it in Settings.".into(),
        ));
    }
    if !response.status().is_success() {
        return Ok(Value::Null);
    }

    response
        .json::<Value>()
        .await
        .map_err(|err| AppError::Other(format!("unexpected SteamGridDB response: {err}")))
}

async fn get(client: &reqwest::Client, api_key: &str, path: &str) -> AppResult<Value> {
    let key = effective_api_key(Some(api_key));
    match get_with_key(client, key, path).await {
        Ok(val) => Ok(val),
        Err(_) if key != DEFAULT_STEAMGRIDDB_API_KEY => {
            get_with_key(client, DEFAULT_STEAMGRIDDB_API_KEY, path).await
        }
        Err(err) => Err(err),
    }
}

fn is_nsfw_text(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    const BLOCKED_TERMS: &[&str] = &[
        "nsfw",
        "18+",
        "nude",
        "nudity",
        "naked",
        "hentai",
        "uncensored",
        "lewd",
        "erotic",
        "topless",
        "porn",
        "xxx",
        "r18",
        "r-18",
        "ecchi",
        "boobs",
        "breasts",
        "bikini mod",
        "skimpy",
    ];
    BLOCKED_TERMS.iter().any(|term| lower.contains(term))
}

fn is_safe_asset_item(item: &Value) -> bool {
    // Strictly reject any asset marked as NSFW or humor/adult on SteamGridDB
    if item.get("nsfw").and_then(Value::as_bool).unwrap_or(false) {
        return false;
    }
    if item.get("epilepsy").and_then(Value::as_bool).unwrap_or(false) {
        return false;
    }
    if let Some(notes) = item.get("notes").and_then(Value::as_str) {
        if is_nsfw_text(notes) {
            return false;
        }
    }
    true
}

fn first_asset_url(value: &Value) -> Option<String> {
    value
        .get("data")
        .and_then(Value::as_array)
        .and_then(|assets| assets.iter().find(|a| is_safe_asset_item(a)))
        .and_then(|asset| asset.get("url"))
        .and_then(Value::as_str)
        .map(str::to_string)
}

fn build_search_terms(name: &str) -> Vec<String> {
    let mut terms = Vec::new();
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return terms;
    }
    terms.push(trimmed.to_string());

    let norm = normalize_game_title(trimmed);
    if !norm.is_empty() && !terms.iter().any(|t| t.eq_ignore_ascii_case(&norm)) {
        terms.push(norm);
    }

    for sep in [":", " - ", " – ", " — "] {
        if let Some((base, _)) = trimmed.split_once(sep) {
            let base_clean = base.trim();
            if base_clean.len() >= 4
                && !terms.iter().any(|t| t.eq_ignore_ascii_case(base_clean))
            {
                terms.push(base_clean.to_string());
            }
        }
    }

    terms
}

/// Resolves up to 2 strictly matching SteamGridDB game IDs for a game title or URL/ID.
/// Rejects any non-matching or NSFW-titled candidates so unrelated games never pollute the cover picker.
pub async fn search_game_ids(
    client: &reqwest::Client,
    api_key: &str,
    name: &str,
) -> AppResult<Vec<i64>> {
    if let Some(explicit_id) = extract_sgdb_game_id_from_input(name) {
        return Ok(vec![explicit_id]);
    }

    let terms = build_search_terms(name);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let paths: Vec<String> = terms
        .iter()
        .take(2)
        .map(|t| format!("/search/autocomplete/{}", urlencoding_light(t)))
        .collect();

    let futs: Vec<_> = paths.iter().map(|p| get(client, api_key, p)).collect();
    let responses = join_all(futs).await;

    let clean_target = normalize_game_title(name);
    let mut exact_ids = Vec::new();
    let mut first_candidate_id: Option<i64> = None;
    let mut seen = HashSet::new();

    for res in responses.into_iter().flatten() {
        if let Some(results) = res.get("data").and_then(Value::as_array) {
            for (idx, item) in results.iter().take(4).enumerate() {
                if let Some(id) = item.get("id").and_then(Value::as_i64) {
                    let cand_name = item
                        .get("name")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    if is_nsfw_text(cand_name) {
                        continue;
                    }
                    let cand_clean = normalize_game_title(cand_name);
                    let sig_ok = crate::services::providers::steam::extract_sequel_or_spinoff_signature(&cand_clean)
                        == crate::services::providers::steam::extract_sequel_or_spinoff_signature(&clean_target);
                    if idx == 0 && first_candidate_id.is_none() && sig_ok {
                        first_candidate_id = Some(id);
                    }
                    if !clean_target.is_empty()
                        && !cand_clean.is_empty()
                        && crate::services::providers::steam::titles_match_on_word_boundaries(&cand_clean, &clean_target)
                        && seen.insert(id)
                    {
                        exact_ids.push(id);
                        if exact_ids.len() >= 2 {
                            return Ok(exact_ids);
                        }
                    }
                }
            }
        }
    }

    if exact_ids.is_empty() {
        if let Some(first_id) = first_candidate_id {
            exact_ids.push(first_id);
        }
    }

    Ok(exact_ids)
}

pub async fn search_game_id(
    client: &reqwest::Client,
    api_key: &str,
    name: &str,
) -> AppResult<Option<i64>> {
    let ids = search_game_ids(client, api_key, name).await?;
    Ok(ids.into_iter().next())
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

pub async fn get_artwork_url(
    client: &reqwest::Client,
    api_key: &str,
    kind: ArtworkKind,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Option<String>> {
    if let Some(game_id) = sgdb_game_id {
        let game_path = format!(
            "/{}/game/{game_id}?nsfw=false&humor=false&epilepsy=false",
            kind.segment()
        );
        let value = get(client, api_key, &game_path).await?;
        if let Some(url) = first_asset_url(&value) {
            return Ok(Some(url));
        }
    }

    if let Some(steam_app_id) = steam_app_id {
        if validate_steam_app_id(steam_app_id).is_ok() {
            let steam_path = format!(
                "/{}/steam/{steam_app_id}?nsfw=false&humor=false&epilepsy=false",
                kind.segment()
            );
            let value = get(client, api_key, &steam_path).await?;
            if let Some(url) = first_asset_url(&value) {
                return Ok(Some(url));
            }
        }
    }

    Ok(None)
}

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
    pub mime: String,
    pub is_animated: bool,
    pub width: i64,
    pub height: i64,
}

fn parse_asset_option(item: &Value) -> Option<GridOption> {
    // Strictly block any NSFW or unsafe item at the parser level as well
    if !is_safe_asset_item(item) {
        return None;
    }

    let id = item.get("id")?.as_i64()?;
    let url = item.get("url")?.as_str()?.trim().to_string();
    if url.is_empty() {
        return None;
    }
    let thumb = item
        .get("thumb")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(&url)
        .to_string();
    let mime = item
        .get("mime")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let is_animated = item
        .get("animated")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || mime.starts_with("video/")
        || url.ends_with(".webm")
        || url.ends_with(".mp4")
        || url.ends_with(".gif");

    Some(GridOption {
        id,
        url,
        thumbnail_url: thumb,
        mime,
        is_animated,
        width: item.get("width").and_then(Value::as_i64).unwrap_or(0),
        height: item.get("height").and_then(Value::as_i64).unwrap_or(0),
    })
}

pub async fn search_asset_options_multi(
    client: &reqwest::Client,
    api_key: &str,
    segment: &str,
    steam_app_id: Option<&str>,
    sgdb_game_ids: &[i64],
) -> AppResult<Vec<GridOption>> {
    if steam_app_id.is_none() && sgdb_game_ids.is_empty() {
        return Ok(Vec::new());
    }

    let (mut static_options, mut animated_options) = tokio::join!(
        fetch_assets_multi(client, api_key, segment, steam_app_id, sgdb_game_ids, "static"),
        fetch_assets_multi(client, api_key, segment, steam_app_id, sgdb_game_ids, "animated")
    );

    let mut combined = Vec::new();
    let mut seen_urls = HashSet::new();

    if let Ok(ref mut statics) = static_options {
        for option in statics.drain(..) {
            if seen_urls.insert(option.url.clone()) {
                let mut o = option;
                o.is_animated = false;
                combined.push(o);
            }
        }
    }

    if let Ok(ref mut animateds) = animated_options {
        for option in animateds.drain(..) {
            if seen_urls.insert(option.url.clone()) {
                let mut o = option;
                o.is_animated = true;
                combined.push(o);
            }
        }
    }

    Ok(combined)
}

pub async fn search_asset_options(
    client: &reqwest::Client,
    api_key: &str,
    segment: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    let ids: Vec<i64> = sgdb_game_id.into_iter().collect();
    search_asset_options_multi(client, api_key, segment, steam_app_id, &ids).await
}

pub async fn search_grid_options(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    search_asset_options(client, api_key, "grids", steam_app_id, sgdb_game_id).await
}

#[allow(dead_code)]
pub async fn search_hero_options(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    search_asset_options(client, api_key, "heroes", steam_app_id, sgdb_game_id).await
}

#[allow(dead_code)]
pub async fn search_logo_options(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<GridOption>> {
    search_asset_options(client, api_key, "logos", steam_app_id, sgdb_game_id).await
}

async fn fetch_assets_from_path(
    client: &reqwest::Client,
    api_key: &str,
    path: &str,
) -> Vec<GridOption> {
    match get(client, api_key, path).await {
        Ok(value) => value
            .get("data")
            .and_then(Value::as_array)
            .map(|items| items.iter().filter_map(parse_asset_option).collect())
            .unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

async fn fetch_assets_multi(
    client: &reqwest::Client,
    api_key: &str,
    segment: &str,
    steam_app_id: Option<&str>,
    sgdb_game_ids: &[i64],
    asset_type: &str,
) -> AppResult<Vec<GridOption>> {
    let mut paths = Vec::new();
    let max_pages: usize = if segment == "grids" && asset_type == "static" {
        3
    } else {
        2
    };

    // Always enforce `nsfw=false&humor=false&epilepsy=false` so NSFW content is strictly excluded!
    for (idx, &game_id) in sgdb_game_ids.iter().take(2).enumerate() {
        let pages_for_this_id = if idx == 0 { max_pages } else { 1 };
        for page in 0..pages_for_this_id {
            paths.push(format!(
                "/{segment}/game/{game_id}?types={asset_type}&nsfw=false&humor=false&epilepsy=false&page={page}"
            ));
        }
    }

    if let Some(steam_app_id) = steam_app_id {
        if validate_steam_app_id(steam_app_id).is_ok() {
            for page in 0..2 {
                paths.push(format!(
                    "/{segment}/steam/{steam_app_id}?types={asset_type}&nsfw=false&humor=false&epilepsy=false&page={page}"
                ));
            }
        }
    }

    let futs: Vec<_> = paths
        .iter()
        .map(|path| fetch_assets_from_path(client, api_key, path))
        .collect();
    let batches = join_all(futs).await;

    let mut out = Vec::new();
    let mut seen_urls = HashSet::new();

    for items in batches {
        for item in items {
            if seen_urls.insert(item.url.clone()) {
                out.push(item);
            }
        }
    }

    Ok(out)
}

pub async fn list_hero_urls(
    client: &reqwest::Client,
    api_key: &str,
    steam_app_id: Option<&str>,
    sgdb_game_id: Option<i64>,
) -> AppResult<Vec<String>> {
    let ids: Vec<i64> = sgdb_game_id.into_iter().collect();
    let options =
        fetch_assets_multi(client, api_key, "heroes", steam_app_id, &ids, "static").await?;
    Ok(options.into_iter().map(|opt| opt.url).collect())
}

pub async fn search_icons(
    client: &reqwest::Client,
    api_key: &str,
    term: &str,
) -> AppResult<Vec<GridOption>> {
    let encoded = urlencoding_light(term);
    let auto_path = format!("/search/autocomplete/{encoded}");
    let auto_res = get(client, api_key, &auto_path).await?;
    let mut options = Vec::new();

    if let Some(games) = auto_res.get("data").and_then(Value::as_array) {
        for game in games.iter().take(2) {
            if let Some(game_id) = game.get("id").and_then(Value::as_i64) {
                let icon_path =
                    format!("/icons/game/{game_id}?nsfw=false&humor=false&epilepsy=false");
                let icon_res = get(client, api_key, &icon_path).await?;
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
