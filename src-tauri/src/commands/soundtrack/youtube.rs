use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeTrackResult {
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration_seconds: Option<u64>,
}

pub async fn search_youtube_tracks(
    query: &str,
    limit: usize,
) -> AppResult<Vec<YouTubeTrackResult>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let url = reqwest::Url::parse_with_params(
        "https://www.youtube.com/results",
        &[("search_query", query)],
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    let res = client
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .send()
        .await
        .map_err(|e| AppError::Other(e.to_string()))?;

    if !res.status().is_success() {
        return Ok(Vec::new());
    }

    let html = res.text().await.map_err(|e| AppError::Other(e.to_string()))?;

    let marker = "var ytInitialData = ";
    let Some(start_idx) = html.find(marker) else {
        return Ok(Vec::new());
    };
    let json_slice = &html[start_idx + marker.len()..];
    let Some(end_idx) = json_slice.find(";</script>") else {
        return Ok(Vec::new());
    };
    let json_str = &json_slice[..end_idx];

    let val: serde_json::Value = match serde_json::from_str(json_str) {
        Ok(v) => v,
        Err(_) => return Ok(Vec::new()),
    };

    let mut results = Vec::new();

    let items = val
        .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents/0/itemSectionRenderer/contents")
        .and_then(|v| v.as_array());

    if let Some(items) = items {
        for item in items {
            if results.len() >= limit {
                break;
            }
            if let Some(vr) = item.get("videoRenderer") {
                let video_id = match vr.get("videoId").and_then(|v| v.as_str()) {
                    Some(id) if !id.is_empty() => id.to_string(),
                    _ => continue,
                };

                let title = vr
                    .pointer("/title/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();

                let channel = vr
                    .pointer("/ownerText/runs/0/text")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();

                let duration_seconds = vr
                    .pointer("/lengthText/simpleText")
                    .and_then(|v| v.as_str())
                    .and_then(parse_duration_string);

                results.push(YouTubeTrackResult {
                    video_id,
                    title,
                    channel,
                    duration_seconds,
                });
            }
        }
    }

    Ok(results)
}

fn parse_duration_string(text: &str) -> Option<u64> {
    let parts: Vec<&str> = text.trim().split(':').collect();
    match parts.len() {
        2 => {
            let m: u64 = parts[0].parse().ok()?;
            let s: u64 = parts[1].parse().ok()?;
            Some(m * 60 + s)
        }
        3 => {
            let h: u64 = parts[0].parse().ok()?;
            let m: u64 = parts[1].parse().ok()?;
            let s: u64 = parts[2].parse().ok()?;
            Some(h * 3600 + m * 60 + s)
        }
        _ => None,
    }
}
