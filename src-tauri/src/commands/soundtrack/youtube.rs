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

const NON_ORIGINAL_YOUTUBE_MARKERS: &[&str] = &[
    "español",
    "espanol",
    "spanish",
    "português",
    "portugues",
    "français",
    "francais",
    "deutsch",
    "italiano",
    "русский",
    "fandub",
    "dublado",
    "traducida",
    "subtitulado",
    "sub espanol",
    "sub español",
    "en español",
    "al español",
    "cover",
    "vocal cover",
    "guitar cover",
    "metal cover",
    "drum cover",
    "bass cover",
    "parody",
    "parodia",
    "karaoke",
    "instrumental remake",
    "piano tutorial",
    "synthesia",
    "8-bit",
    "8 bit",
    "chiptune remix",
    "nightcore",
    "slowed",
    "reverb",
    "mashup",
    "megamix",
    "gameplay",
    "walkthrough",
    "playthrough",
    "lets play",
    "let's play",
    "review",
    "reaction",
    "trailer",
    "teaser",
    "30 sec",
    "30 second",
    "preview",
    "#shorts",
];

fn is_authentic_ost_video(title: &str, channel: &str, query: &str) -> bool {
    let low_title = title.to_lowercase();
    let low_channel = channel.to_lowercase();
    let low_query = query.to_lowercase();

    for marker in NON_ORIGINAL_YOUTUBE_MARKERS {
        // Only reject a marker if the user did not explicitly search for it
        if (low_title.contains(marker) || low_channel.contains(marker))
            && !low_query.contains(marker)
        {
            return false;
        }
    }
    true
}

fn ost_authenticity_score(r: &YouTubeTrackResult) -> i32 {
    let low_title = r.title.to_lowercase();
    let low_channel = r.channel.to_lowercase();
    let mut score = 0i32;

    if low_channel.ends_with("- topic") || low_channel.contains("official") {
        score += 40;
    }
    if low_title.contains("soundtrack")
        || low_title.contains("ost")
        || low_title.contains("original score")
    {
        score += 30;
    }
    if let Some(dur) = r.duration_seconds {
        // Full single OST tracks are typically 55s to 12 minutes
        if (55..=720).contains(&dur) {
            score += 25;
        } else if dur > 3600 {
            // Avoid 2-hour full-album compilation videos when resolving a single track
            score -= 35;
        }
    }
    if low_title.contains("remix") || low_title.contains("live") {
        score -= 15;
    }
    score
}

/// Resolves a direct, full-length audio stream URL (`.m4a` / `.webm`) for a YouTube `video_id`
/// using YouTube InnerTube (`ANDROID_VR` + `IOS` + `ANDROID_TESTSUITE` clients) and Piped fallback endpoints.
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

    let testsuite_body = serde_json::json!({
        "videoId": video_id,
        "context": {
            "client": {
                "clientName": "ANDROID_TESTSUITE",
                "clientVersion": "1.9",
                "androidSdkVersion": 30,
                "hl": "en",
                "gl": "US"
            }
        }
    });

    let piped_url = format!("https://pipedapi.kavin.rocks/streams/{video_id}");
    let piped_mirror_url = format!("https://api.piped.private.coffee/streams/{video_id}");

    let (vr_resp, ios_resp, ts_resp, piped_resp, piped_mirror_resp) = tokio::join!(
        client
            .post(innertube_url)
            .timeout(Duration::from_millis(4200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 14; en_US; Quest 3; Build/UP1A.231005.007; Cronet/122.0.6261.64)"
            )
            .json(&vr_body)
            .send(),
        client
            .post(innertube_url)
            .timeout(Duration::from_millis(4200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)"
            )
            .json(&ios_body)
            .send(),
        client
            .post(innertube_url)
            .timeout(Duration::from_millis(4200))
            .header(
                reqwest::header::USER_AGENT,
                "com.google.android.youtube/1.9 (Linux; U; Android 11; en_US)"
            )
            .json(&testsuite_body)
            .send(),
        client
            .get(&piped_url)
            .timeout(Duration::from_millis(3800))
            .send(),
        client
            .get(&piped_mirror_url)
            .timeout(Duration::from_millis(3800))
            .send()
    );

    for resp in [vr_resp, ios_resp, ts_resp].into_iter().flatten() {
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

    for p_resp in [piped_resp, piped_mirror_resp].into_iter().flatten() {
        if p_resp.status().is_success() {
            if let Ok(json) = p_resp.json::<Value>().await {
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
        .timeout(Duration::from_millis(4200))
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
            if results.len() >= limit * 2 {
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

                // Reject 30-second / 45-second previews and shorts (< 60 seconds)
                if let Some(dur) = duration_seconds {
                    if dur > 0 && dur < 60 {
                        continue;
                    }
                }

                if !is_authentic_ost_video(&title, &channel, trimmed) {
                    continue;
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

    // If direct YouTube HTML scraping returned empty, fallback to Piped API search
    if results.is_empty() {
        if let Ok(piped_list) = search_piped_music_fallback(client, trimmed, limit, true).await {
            results.extend(piped_list);
        }
    }

    results.sort_by_key(|r| std::cmp::Reverse(ost_authenticity_score(r)));
    results.truncate(limit);

    Ok(results)
}

async fn search_piped_music_fallback(
    client: &reqwest::Client,
    query: &str,
    limit: usize,
    ost_only: bool,
) -> AppResult<Vec<YouTubeTrackResult>> {
    let filter = if ost_only { "music_songs" } else { "videos" };
    let endpoints = [
        "https://pipedapi.kavin.rocks/search",
        "https://api.piped.private.coffee/search",
    ];
    for base in endpoints {
        let Ok(u) = reqwest::Url::parse_with_params(base, &[("q", query), ("filter", filter)]) else {
            continue;
        };
        if let Ok(resp) = client.get(u).timeout(Duration::from_millis(3800)).send().await {
            if resp.status().is_success() {
                if let Ok(json) = resp.json::<Value>().await {
                    if let Some(items) = json.get("items").and_then(Value::as_array) {
                        let mut out = Vec::new();
                        for it in items {
                            if out.len() >= limit {
                                break;
                            }
                            let url_field = it.get("url").and_then(Value::as_str).unwrap_or("");
                            let vid = url_field
                                .strip_prefix("/watch?v=")
                                .unwrap_or_else(|| it.get("id").and_then(Value::as_str).unwrap_or(""));
                            if vid.len() != 11 {
                                continue;
                            }
                            let title = it.get("title").and_then(Value::as_str).unwrap_or("").to_string();
                            let channel = it.get("uploaderName").and_then(Value::as_str).unwrap_or("").to_string();
                            let dur = it.get("duration").and_then(Value::as_u64);
                            if ost_only {
                                if let Some(d) = dur {
                                    if d > 0 && d < 60 {
                                        continue;
                                    }
                                }
                            }
                            out.push(YouTubeTrackResult {
                                video_id: vid.to_string(),
                                title,
                                channel,
                                duration_seconds: dur,
                                direct_audio_url: None,
                            });
                        }
                        if !out.is_empty() {
                            return Ok(out);
                        }
                    }
                }
            }
        }
    }
    Ok(Vec::new())
}

pub async fn search_youtube_trailer_videos_fast(
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

    let mut results = Vec::new();
    if let Ok(res) = client
        .get(url)
        .timeout(Duration::from_millis(4200))
        .header(
            reqwest::header::USER_AGENT,
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "en-US,en;q=0.9")
        .send()
        .await
    {
        if res.status().is_success() {
            if let Ok(html) = res.text().await {
                let marker = "var ytInitialData = ";
                if let Some(start_idx) = html.find(marker) {
                    let json_slice = &html[start_idx + marker.len()..];
                    if let Some(end_idx) = json_slice.find(";</script>") {
                        if let Ok(val) = serde_json::from_str::<Value>(&json_slice[..end_idx]) {
                            if let Some(items) = val
                                .pointer("/contents/twoColumnSearchResultsRenderer/primaryContents/sectionListRenderer/contents/0/itemSectionRenderer/contents")
                                .and_then(|v| v.as_array())
                            {
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
                                            if dur > 0 && dur < 25 {
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
                        }
                    }
                }
            }
        }
    }

    if results.is_empty() {
        if let Ok(piped_list) = search_piped_music_fallback(client, trimmed, limit, false).await {
            results.extend(piped_list);
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

    let mut results = search_youtube_videos_fast(&client, trimmed, limit).await?;

    // Resolve direct full-length audio stream URLs concurrently for the top 2 authentic OST candidates
    if !results.is_empty() {
        let first_vid = results[0].video_id.clone();
        if results.len() >= 2 {
            let second_vid = results[1].video_id.clone();
            let (first_audio, second_audio) = tokio::join!(
                extract_youtube_direct_audio_url(&client, &first_vid),
                extract_youtube_direct_audio_url(&client, &second_vid),
            );
            if let Some(u1) = first_audio {
                results[0].direct_audio_url = Some(u1);
            }
            if let Some(u2) = second_audio {
                results[1].direct_audio_url = Some(u2);
            }
        } else if let Some(u1) = extract_youtube_direct_audio_url(&client, &first_vid).await {
            results[0].direct_audio_url = Some(u1);
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
