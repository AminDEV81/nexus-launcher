use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct YouTubeTrackResult {
    pub video_id: String,
    pub title: String,
    pub channel: String,
    pub duration_seconds: Option<u64>,
    #[serde(default)]
    pub direct_audio_url: Option<String>,
}

/// Resolves a direct, full-length audio stream URL (`.m4a` / `.webm`) for a YouTube `video_id`
/// using YouTube InnerTube (`ANDROID_VR` + `IOS` clients) and Piped/Invidious fallback endpoints.
/// This allows `<audio>` in the frontend to play the entire 3-6 minute OST track directly without
/// hitting YouTube iframe `Error 150` restrictions on `http://tauri.localhost` or falling back to 30s previews!
pub async fn extract_youtube_direct_audio_url(
    client: &reqwest::Client,
    video_id: &str,
) -> Option<String> {
    let innertube_url = "https://www.youtube.com/youtubei/v1/player?prettyPrint=false";

    let vr_body = serde_json::json!({
        "videoId": video_id,
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
        "videoId": video_id,
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

    let piped_url = format!("https://pipedapi.kavin.rocks/streams/{video_id}");

    let (vr_resp, ios_resp, piped_resp) = tokio::join!(
        client
            .post(innertube_url)
            .timeout(Duration::from_millis(2200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 14; en_US; Quest 3; Build/UP1A.231005.007; Cronet/122.0.6261.64)"
            )
            .json(&vr_body)
            .send(),
        client
            .post(innertube_url)
            .timeout(Duration::from_millis(2200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)"
            )
            .json(&ios_body)
            .send(),
        client
            .get(&piped_url)
            .timeout(Duration::from_millis(2200))
            .send()
    );

    for resp in [vr_resp, ios_resp].into_iter().flatten() {
        if let Ok(json) = resp.json::<Value>().await {
            // 1. Prefer adaptiveFormats audio/mp4 (AAC .m4a) or audio/webm (Opus)
            if let Some(adaptive) = json
                .pointer("/streamingData/adaptiveFormats")
                .and_then(Value::as_array)
            {
                // First pass: look for audio/mp4 with direct URL
                for fmt in adaptive {
                    let mime = fmt.get("mimeType").and_then(Value::as_str).unwrap_or("");
                    let url = fmt.get("url").and_then(Value::as_str).unwrap_or("");
                    if !url.is_empty() && mime.starts_with("audio/mp4") {
                        return Some(url.to_string());
                    }
                }
                // Second pass: look for any audio/* with direct URL
                for fmt in adaptive {
                    let mime = fmt.get("mimeType").and_then(Value::as_str).unwrap_or("");
                    let url = fmt.get("url").and_then(Value::as_str).unwrap_or("");
                    if !url.is_empty() && mime.starts_with("audio/") {
                        return Some(url.to_string());
                    }
                }
            }
            // 2. Fallback to combined formats (video/mp4 with audio) which <audio> also plays natively
            if let Some(formats) = json
                .pointer("/streamingData/formats")
                .and_then(Value::as_array)
            {
                for fmt in formats {
                    let url = fmt.get("url").and_then(Value::as_str).unwrap_or("");
                    if !url.is_empty() {
                        return Some(url.to_string());
                    }
                }
            }
        }
    }

    if let Ok(resp) = piped_resp {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<Value>().await {
                if let Some(streams) = json.get("audioStreams").and_then(Value::as_array) {
                    for s in streams {
                        let url = s.get("url").and_then(Value::as_str).unwrap_or("");
                        if !url.is_empty() {
                            return Some(url.to_string());
                        }
                    }
                }
            }
        }
    }

    None
}

pub async fn search_youtube_videos_fast(
    client: &reqwest::Client,
    query: &str,
    limit: usize,
) -> AppResult<Vec<YouTubeTrackResult>> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }

    let url = reqwest::Url::parse_with_params(
        "https://www.youtube.com/results",
        &[("search_query", trimmed)],
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    let res = client
        .get(url)
        .timeout(Duration::from_millis(2200))
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

    let val: Value = match serde_json::from_str(json_str) {
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

                if let Some(dur) = duration_seconds {
                    if dur > 0 && dur < 35 {
                        continue;
                    }
                }

                results.push(YouTubeTrackResult {
                    video_id,
                    title,
                    channel,
                    duration_seconds,
                    direct_audio_url: None,
                });
            }
        }
    }

    Ok(results)
}

pub async fn search_youtube_tracks(
    query: &str,
    limit: usize,
) -> AppResult<Vec<YouTubeTrackResult>> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| AppError::Other(e.to_string()))?;

    let trimmed = query.trim();
    // If caller passed a direct 11-char YouTube video_id, resolve its direct audio stream immediately
    if trimmed.len() == 11
        && trimmed
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
    {
        let direct_audio_url = extract_youtube_direct_audio_url(&client, trimmed).await;
        return Ok(vec![YouTubeTrackResult {
            video_id: trimmed.to_string(),
            title: String::new(),
            channel: String::new(),
            duration_seconds: None,
            direct_audio_url,
        }]);
    }

    let url = reqwest::Url::parse_with_params(
        "https://www.youtube.com/results",
        &[("search_query", trimmed)],
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    let res = client
        .get(url)
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
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

    let val: Value = match serde_json::from_str(json_str) {
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

                // Skip YouTube Shorts or clips under 38 seconds when searching for full OST tracks
                if let Some(dur) = duration_seconds {
                    if dur > 0 && dur < 38 {
                        continue;
                    }
                }

                results.push(YouTubeTrackResult {
                    video_id,
                    title,
                    channel,
                    duration_seconds,
                    direct_audio_url: None,
                });
            }
        }
    }

    // Resolve direct full-length audio stream URL for the best OST track candidate so <audio> can play it directly!
    if !results.is_empty() {
        let best_idx = results
            .iter()
            .position(|r| {
                let low = r.title.to_lowercase();
                !low.contains("gameplay")
                    && !low.contains("walkthrough")
                    && !low.contains("review")
                    && !low.contains("reaction")
                    && !low.contains("trailer")
            })
            .unwrap_or(0);

        let target_vid = results[best_idx].video_id.clone();
        if let Some(audio_url) = extract_youtube_direct_audio_url(&client, &target_vid).await {
            results[best_idx].direct_audio_url = Some(audio_url);
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
