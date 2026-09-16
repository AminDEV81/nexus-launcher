use crate::error::{AppError, AppResult};
use serde_json::Value;

/// Steam's storefront endpoint (the same data the public store page
/// shows: genres, description, developers, publishers, release date,
/// Metacritic score, screenshots) is open to everyone — no API key,
/// no OAuth. It only covers games that actually have a Steam listing,
/// so this is scoped to games with a `steam_app_id` (set automatically
/// by Epic 5's Steam scan, or whenever a game happens to match one on
/// SteamGridDB/IGDB), but for those games it needs zero configuration —
/// a real alternative to IGDB, not a workaround of it.
const API_BASE: &str = "https://store.steampowered.com/api/appdetails";

pub struct SteamAppDetails {
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    pub metacritic_score: Option<i64>,
    /// Full-resolution screenshot URLs, already in display order.
    pub screenshot_urls: Vec<String>,
}

pub async fn get_app_details(
    client: &reqwest::Client,
    steam_app_id: &str,
) -> AppResult<Option<SteamAppDetails>> {
    let response = client
        .get(API_BASE)
        .query(&[("appids", steam_app_id), ("l", "english")])
        .send()
        .await
        .map_err(|err| AppError::Other(format!("Steam store request failed: {err}")))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let body: Value = response
        .json()
        .await
        .map_err(|err| AppError::Other(format!("unexpected Steam store response: {err}")))?;

    let entry = body.get(steam_app_id);
    let success = entry
        .and_then(|e| e.get("success"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !success {
        // Not every appid is a real store listing (some are tools, dedicated
        // servers, or delisted) — that's a normal "nothing here", not an error.
        return Ok(None);
    }

    let Some(data) = entry.and_then(|e| e.get("data")) else {
        return Ok(None);
    };

    Ok(Some(parse_app_details(data)))
}

fn parse_app_details(data: &Value) -> SteamAppDetails {
    let description = data
        .get("short_description")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    let developer = data
        .get("developers")
        .and_then(Value::as_array)
        .map(|items| join_strings(items))
        .filter(|value| !value.is_empty());

    let publisher = data
        .get("publishers")
        .and_then(Value::as_array)
        .map(|items| join_strings(items))
        .filter(|value| !value.is_empty());

    let genres = data
        .get("genres")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("description").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let release_date = data
        .get("release_date")
        .and_then(|rd| rd.get("date"))
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(parse_steam_date);

    let metacritic_score = data
        .get("metacritic")
        .and_then(|m| m.get("score"))
        .and_then(Value::as_i64);

    let screenshot_urls = data
        .get("screenshots")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("path_full").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    SteamAppDetails {
        description,
        developer,
        publisher,
        release_date,
        genres,
        metacritic_score,
        screenshot_urls,
    }
}

fn join_strings(items: &[Value]) -> String {
    items
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Steam's store date is a human-readable, locale-formatted string (e.g.
/// "21 Nov, 2019"), unlike IGDB's clean `YYYY-MM-DD` — parsed into the
/// same format so both sources sort/display consistently. Falls back to
/// the original string if the format doesn't match what Steam usually
/// sends (still better than dropping the date entirely).
fn parse_steam_date(raw: &str) -> String {
    chrono::NaiveDate::parse_from_str(raw, "%e %b, %Y")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| raw.to_string())
}
