#![allow(clippy::all)]

use crate::commands::metadata::HttpClient;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, State};
use tokio::io::AsyncWriteExt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtItem {
    pub id: String,
    pub title: String,
    pub game_name: Option<String>,
    pub author: Option<String>,
    pub source: String,   // "wallhaven" | "safebooru" | "igdb" | "steamgriddb" | "steam"
    pub category: String, // "wallpaper" | "cover" | "hero" | "concept"
    pub image_url: String,
    pub thumb_url: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub file_size_bytes: Option<u64>,
    pub file_format: Option<String>,
    pub page_url: Option<String>,
    #[serde(default)]
    pub is_liked: bool,
    #[serde(default)]
    pub popularity: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtDownloadInfo {
    pub size_bytes: Option<u64>,
    pub mime_type: Option<String>,
    pub file_format: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtDownloadProgressEvent {
    pub download_id: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    pub percent: u8,
    pub status: String, // "downloading" | "completed" | "error"
}

fn url_encode_component(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for b in input.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            b' ' => out.push_str("%20"),
            other => out.push_str(&format!("%{:02X}", other)),
        }
    }
    out
}

fn sanitize_filename(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.');
    if trimmed.is_empty() {
        "nexus_artwork".to_string()
    } else {
        trimmed.chars().take(90).collect()
    }
}

fn infer_format_from_url_or_mime(url: &str, mime: Option<&str>) -> String {
    if let Some(m) = mime {
        let low = m.to_ascii_lowercase();
        if low.contains("png") {
            return "png".to_string();
        }
        if low.contains("webp") {
            return "webp".to_string();
        }
        if low.contains("jpeg") || low.contains("jpg") {
            return "jpg".to_string();
        }
    }
    let path_part = url.split('?').next().unwrap_or(url).to_ascii_lowercase();
    if path_part.ends_with(".png") {
        "png".to_string()
    } else if path_part.ends_with(".webp") {
        "webp".to_string()
    } else {
        "jpg".to_string()
    }
}

fn md5_or_fnv(s: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in s.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

/// Strict SFW filter applied to all results (both Explore and Search).
fn is_strict_sfw(text: &str) -> bool {
    let low = text.to_ascii_lowercase();
    const BLOCKED: &[&str] = &[
        "nsfw", "hentai", "nude", "nudity", "naked", "ecchi", "lewd",
        "lingerie", "underwear", "panties", "panty", "bikini", "swimsuit",
        "cleavage", "boobs", "breasts", "nipples", "uncensored", "erotic",
        "explicit", "porn", "xxx", "r18", "18+", "bdsm", "topless",
        "undressed", "pinup", "pin-up", "boudoir", "seductive", "sensual",
        "skimpy", "upskirt", "succubus", "ahegao", "no_bra", "no_panties",
        "spread_legs", "pussy", "penis", "sex", "bather", "bathers",
        "bathsheba", "venus", "aphrodite", "susanna", "bacchanal", "odalisque",
    ];
    !BLOCKED.iter().any(|kw| low.contains(kw))
}

/// Returns true only when the user explicitly searches for anime / JRPG-anime art.
fn is_anime_query(query: &str) -> bool {
    let low = query.trim().to_ascii_lowercase();
    if low.is_empty() {
        return false;
    }
    const ANIME_KEYWORDS: &[&str] = &[
        "anime", "manga", "waifu", "genshin", "honkai", "zenless", "wuthering",
        "arknights", "azur lane", "blue archive", "fate", "nier", "persona",
        "naruto", "one piece", "bleach", "dragon ball", "evangelion", "ghibli",
        "demon slayer", "jujutsu", "attack on titan", "chainsaw man", "vtuber",
        "vocaloid", "miku", "cel-shaded", "touhou", "hololive", "kawaii", "chibi",
    ];
    ANIME_KEYWORDS.iter().any(|kw| low.contains(kw))
}

async fn fetch_wallhaven(
    http: &reqwest::Client,
    query: &str,
    category: &str,
    page: u32,
    sync_nonce: u32,
) -> Vec<ArtItem> {
    // Strictly SFW (purity=100). Use General-only (categories=100) by default so popular gaming art
    // leads the feed instead of anime; enable Anime category (110) when user explicitly searches anime.
    let wh_categories = if is_anime_query(query) { "110" } else { "100" };
    let mut url = format!(
        "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&page={}&",
        page.max(1)
    );
    if query.trim().is_empty() {
        const EXPLORE_THEMES: &[&str] = &[
            "video games",
            "cyberpunk city",
            "dark fantasy",
            "sci-fi concept art",
            "samurai warrior",
            "fantasy landscape",
        ];
        const CONCEPT_THEMES: &[&str] = &[
            "game concept art",
            "fantasy concept art",
            "sci-fi concept art",
            "cyberpunk concept art",
        ];
        const PORTRAIT_THEMES: &[&str] = &[
            "cyberpunk",
            "fantasy",
            "sci-fi",
            "neon",
            "samurai",
            "space",
            "dark",
            "artwork",
        ];
        // Dynamic freshness + popularity mix: rotates between Trending This Month (1M),
        // Hot New This Week (1w), and All-Time Most Favorited so new uploads always flow in.
        let sorting = match (sync_nonce + page) % 3 {
            0 => "sorting=toplist&topRange=1M",
            1 => "sorting=favorites&order=desc",
            _ => "sorting=toplist&topRange=1w",
        };
        let rot = (sync_nonce as usize).wrapping_add(page.saturating_sub(1) as usize);
        if category == "cover" {
            // Rotate across high-supply portrait themes on every Load More page so vertical art never runs dry!
            let theme = PORTRAIT_THEMES[rot % PORTRAIT_THEMES.len()];
            let sub_page = (page.saturating_sub(1) / PORTRAIT_THEMES.len() as u32) + 1;
            url = format!(
                "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&page={sub_page}&q={}&{sorting}",
                url_encode_component(theme)
            );
        } else if category == "concept" {
            let theme = CONCEPT_THEMES[rot % CONCEPT_THEMES.len()];
            let sub_page = (page.saturating_sub(1) / CONCEPT_THEMES.len() as u32) + 1;
            url = format!(
                "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&page={sub_page}&q={}&{sorting}&atleast=1920x1080",
                url_encode_component(theme)
            );
        } else {
            let theme = EXPLORE_THEMES[rot % EXPLORE_THEMES.len()];
            let sub_page = (page.saturating_sub(1) / EXPLORE_THEMES.len() as u32) + 1;
            url = format!(
                "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&page={sub_page}&q={}&{sorting}&atleast=1920x1080",
                url_encode_component(theme)
            );
        }
    } else {
        let q_str = if category == "concept" {
            format!("{} concept art", query.trim())
        } else {
            query.trim().to_string()
        };
        url.push_str(&format!(
            "q={}&sorting=relevance",
            url_encode_component(&q_str)
        ));
    }
    if category == "cover" {
        url.push_str("&ratios=portrait");
    } else if category == "hero" {
        url.push_str("&ratios=21x9,32x9,16x9");
    } else if category == "wallpaper" {
        url.push_str("&ratios=16x9,16x10,21x9");
    }

    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(arr) = json.get("data").and_then(|d| d.as_array()) else {
        return Vec::new();
    };

    arr.iter()
        .filter_map(|item| {
            let purity = item.get("purity").and_then(|v| v.as_str()).unwrap_or("");
            if purity != "sfw" {
                return None;
            }
            let id = item.get("id")?.as_str()?;
            let image_url = item.get("path")?.as_str()?.to_string();
            let width = item.get("dimension_x").and_then(|v| v.as_u64()).map(|v| v as u32);
            let height = item.get("dimension_y").and_then(|v| v.as_u64()).map(|v| v as u32);
            let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);
            let file_size_bytes = item.get("file_size").and_then(|v| v.as_u64());
            let wh_ratio = match (width, height) {
                (Some(w), Some(h)) if h > 0 => w as f64 / h as f64,
                _ => 1.6,
            };
            let is_non_standard_ratio = is_portrait || wh_ratio >= 2.05 || wh_ratio < 1.2;
            // Wallhaven thumbs are always 3:2 cropped (300x200), which cuts off portrait & ultrawide art.
            // Use the uncropped image for portrait/ultrawide (and light <=1.2MB files) so nothing is cut off,
            // while keeping fast thumbs for heavy multi-MB 4K/8K standard landscape wallpapers.
            if is_non_standard_ratio && file_size_bytes.unwrap_or(0) > 2_800_000 {
                return None;
            }
            let thumb_url = if is_non_standard_ratio || file_size_bytes.unwrap_or(u64::MAX) <= 450_000 {
                image_url.clone()
            } else {
                item.get("thumbs")
                    .and_then(|t| t.get("large").or_else(|| t.get("original")))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&image_url)
                    .to_string()
            };
            let file_type = item
                .get("file_type")
                .and_then(|v| v.as_str())
                .map(|s| infer_format_from_url_or_mime(&image_url, Some(s)));
            let page_url = item.get("url").and_then(|v| v.as_str()).map(|s| s.to_string());
            let favs = item.get("favorites").and_then(|v| v.as_u64()).unwrap_or(0);
            let views = item.get("views").and_then(|v| v.as_u64()).unwrap_or(0);
            let wh_pop = 5_000u64.saturating_add(favs.saturating_mul(25)).saturating_add(views / 40);

            Some(ArtItem {
                id: format!("wh_{id}"),
                title: if query.trim().is_empty() {
                    format!("Gaming Wallpaper #{id}")
                } else {
                    format!("{} — Wallpaper #{id}", query.trim())
                },
                game_name: if query.trim().is_empty() {
                    None
                } else {
                    Some(query.trim().to_string())
                },
                author: None,
                source: "wallhaven".to_string(),
                category: if category == "concept" {
                    "concept".to_string()
                } else if category == "hero" {
                    "hero".to_string()
                } else if is_portrait {
                    "cover".to_string()
                } else {
                    "wallpaper".to_string()
                },
                image_url,
                thumb_url,
                width,
                height,
                file_size_bytes,
                file_format: file_type,
                page_url,
                is_liked: false,
                popularity: wh_pop,
            })
        })
        .collect()
}

/// Strictly SFW gaming & anime character fanart via Safebooru (zero NSFW, zero captcha).
async fn fetch_safebooru_art(
    http: &reqwest::Client,
    query: &str,
    category: &str,
    page: u32,
) -> Vec<ArtItem> {
    let pid = page.saturating_sub(1);
    let url = if query.trim().is_empty() {
        format!("https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=20&pid={pid}")
    } else {
        let tag = query
            .trim()
            .to_lowercase()
            .replace([':', '\'', '’'], "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("_");
        format!(
            "https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&tags={}&limit=20&pid={pid}",
            url_encode_component(&tag)
        )
    };
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(Value::Array(posts)) = resp.json::<Value>().await else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for post in posts {
        let Some(id_num) = post.get("id").and_then(|v| v.as_i64()) else {
            continue;
        };
        let rating = post.get("rating").and_then(|v| v.as_str()).unwrap_or("general");
        if rating != "general" && rating != "safe" {
            continue;
        }
        let tags = post.get("tags").and_then(|v| v.as_str()).unwrap_or("");
        if !is_strict_sfw(tags) {
            continue;
        }
        let dir_opt = post.get("directory").and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
        });
        let Some(dir) = dir_opt else {
            continue;
        };
        let Some(img_name) = post.get("image").and_then(|v| v.as_str()) else {
            continue;
        };
        let image_url = format!("https://safebooru.org/images/{dir}/{img_name}");
        let sample = post
            .get("sample")
            .and_then(|v| v.as_bool().or_else(|| v.as_i64().map(|n| n != 0)))
            .unwrap_or(false);
        let hash = post.get("hash").and_then(|v| v.as_str()).unwrap_or("");
        let thumb_url = if sample && !hash.is_empty() {
            format!("https://safebooru.org/samples/{dir}/sample_{hash}.jpg")
        } else {
            image_url.clone()
        };
        let width = post.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
        let height = post.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
        if let (Some(w), Some(h)) = (width, height) {
            if w.max(h) < 1200 {
                continue;
            }
        }
        if let (Some(w), Some(h)) = (width, height) {
            if w.max(h) < 1080 {
                continue;
            }
        }
        let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);

        out.push(ArtItem {
            id: format!("sb_{id_num}"),
            title: if query.trim().is_empty() {
                format!("Gaming Illustration #{id_num}")
            } else {
                format!("{} — Illustration #{id_num}", query.trim())
            },
            game_name: if query.trim().is_empty() {
                None
            } else {
                Some(query.trim().to_string())
            },
            author: None,
            source: "safebooru".to_string(),
            category: if category == "concept" {
                "concept".to_string()
            } else if is_portrait {
                "cover".to_string()
            } else {
                "concept".to_string()
            },
            file_format: Some(infer_format_from_url_or_mime(&image_url, None)),
            image_url,
            thumb_url,
            width,
            height,
            file_size_bytes: None,
            page_url: Some(format!("https://safebooru.org/index.php?page=post&s=view&id={id_num}")),
            is_liked: false,
            popularity: 0,
        });
    }
    out
}


/// Strictly SFW high-res gaming & anime wallpapers from Konachan.net (rating:s only).
async fn fetch_konachan_safe_art(
    http: &reqwest::Client,
    query: &str,
    page: u32,
) -> Vec<ArtItem> {
    let tags = if query.trim().is_empty() {
        "rating:safe".to_string()
    } else {
        let clean = query
            .trim()
            .to_lowercase()
            .replace([':', '\'', '’'], "")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("_");
        format!("rating:safe {clean}")
    };
    let url = format!(
        "https://konachan.net/post.json?tags={}&limit=20&page={}",
        url_encode_component(&tags),
        page.max(1)
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(Value::Array(posts)) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for post in posts {
        let rating = post.get("rating").and_then(|v| v.as_str()).unwrap_or("");
        if rating != "s" {
            continue;
        }
        let tags_str = post.get("tags").and_then(|v| v.as_str()).unwrap_or("");
        if !is_strict_sfw(tags_str) {
            continue;
        }
        let Some(id_num) = post.get("id").and_then(|v| v.as_i64()) else {
            continue;
        };
        let Some(file_url) = post
            .get("file_url")
            .or_else(|| post.get("jpeg_url"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
        else {
            continue;
        };
        let thumb_url = post
            .get("sample_url")
            .or_else(|| post.get("preview_url"))
            .and_then(|v| v.as_str())
            .unwrap_or(&file_url)
            .to_string();
        let width = post.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
        let height = post.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
        let file_size_bytes = post.get("file_size").and_then(|v| v.as_u64());
        let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);
        let ext = infer_format_from_url_or_mime(&file_url, None);

        out.push(ArtItem {
            id: format!("kcs_{id_num}"),
            title: if query.trim().is_empty() {
                format!("HD Illustration #{id_num}")
            } else {
                format!("{} — Illustration #{id_num}", query.trim())
            },
            game_name: if query.trim().is_empty() {
                None
            } else {
                Some(query.trim().to_string())
            },
            author: post.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
            source: "konachan".to_string(),
            category: if is_portrait {
                "cover".to_string()
            } else {
                "wallpaper".to_string()
            },
            image_url: file_url,
            thumb_url,
            width,
            height,
            file_size_bytes,
            file_format: Some(ext),
            page_url: Some(format!("https://konachan.net/post/show/{id_num}")),
            is_liked: false,
            popularity: 0,
        });
    }
    out
}

/// Official IGDB artworks & 1080p screenshots via the Nexus Metadata Gateway.
async fn fetch_igdb_gateway_art(http: &reqwest::Client, query: &str, page: u32) -> Vec<ArtItem> {
    let search_url = if query.trim().is_empty() {
        let offset = (page.saturating_sub(1)) * 12;
        let feed = if page % 2 == 0 { "new_releases" } else { "top_rated" };
        format!("https://nexus-metadata-gateway.nexus-amin.workers.dev/api/v1/games/feed/{feed}?offset={offset}")
    } else {
        let encoded = url_encode_component(query.trim());
        format!("https://nexus-metadata-gateway.nexus-amin.workers.dev/api/v1/games/search?q={encoded}&limit=6")
    };
    let Ok(resp) = http
        .get(&search_url)
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(items) = json.get("data").and_then(|d| d.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for g in items.iter().take(10) {
        let Some(id) = g.get("igdb_id").and_then(|v| v.as_i64()) else {
            continue;
        };
        let name = g.get("name").and_then(|v| v.as_str()).unwrap_or(query.trim());
        if let Some(backdrop) = g.get("backdrop_url").and_then(|v| v.as_str()) {
            out.push(ArtItem {
                id: format!("igdb_shot_{id}"),
                title: format!("{name} — IGDB Official Artwork"),
                game_name: Some(name.to_string()),
                author: Some("IGDB Official".into()),
                source: "igdb".to_string(),
                category: "wallpaper".to_string(),
                image_url: backdrop.to_string(),
                thumb_url: backdrop.replace("t_1080p", "t_screenshot_med"),
                width: Some(1920),
                height: Some(1080),
                file_size_bytes: None,
                file_format: Some("jpg".into()),
                page_url: None,
                is_liked: false,
                popularity: 0,
            });
        }
        // Game box covers intentionally omitted — Art & Wallpaper focuses strictly on art & wallpapers.
    }
    out
}

async fn fetch_steam_and_sgdb_for_game(http: &reqwest::Client, query: &str) -> Vec<ArtItem> {
    if query.trim().is_empty() {
        return Vec::new();
    }
    let mut out = Vec::new();
    let encoded = url_encode_component(query.trim());

    let steam_search_url = format!(
        "https://store.steampowered.com/api/storesearch/?term={encoded}&l=english&cc=us"
    );
    let gateway_hero_url = format!(
        "https://nexus-metadata-gateway.nexus-amin.workers.dev/api/v1/artwork/options/hero?name={encoded}"
    );

    let (steam_res, hero_res) = tokio::join!(
        http.get(&steam_search_url)
            .timeout(std::time::Duration::from_millis(3200))
            .send(),
        http.get(&gateway_hero_url)
            .timeout(std::time::Duration::from_millis(3200))
            .send(),
    );

    if let Ok(r) = steam_res {
        if let Ok(json) = r.json::<Value>().await {
            if let Some(app_id) = json
                .get("items")
                .and_then(|i| i.as_array())
                .and_then(|arr| arr.first())
                .and_then(|first| first.get("id"))
                .and_then(|v| v.as_i64())
            {
                let details_url =
                    format!("https://store.steampowered.com/api/appdetails?appids={app_id}");
                if let Ok(dr) = http
                    .get(&details_url)
                    .timeout(std::time::Duration::from_millis(3200))
                    .send()
                    .await
                {
                    if let Ok(djson) = dr.json::<Value>().await {
                        let key = app_id.to_string();
                        if let Some(data) = djson.get(&key).and_then(|x| x.get("data")) {
                            let gname = data
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or(query.trim())
                                .to_string();
                            let hero = format!(
                                "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_hero.jpg"
                            );
                            out.push(ArtItem {
                                id: format!("steam_hero_{app_id}"),
                                title: format!("{gname} — Official Hero Banner"),
                                game_name: Some(gname.clone()),
                                author: Some("Steam Official".into()),
                                source: "steam".into(),
                                category: "hero".into(),
                                image_url: hero.clone(),
                                thumb_url: hero,
                                width: Some(1920),
                                height: Some(620),
                                file_size_bytes: None,
                                file_format: Some("jpg".into()),
                                page_url: Some(format!("https://store.steampowered.com/app/{app_id}")),
                                is_liked: false,
                                popularity: 0,
                            });
                            if let Some(shots) = data.get("screenshots").and_then(|s| s.as_array()) {
                                for (idx, s) in shots.iter().take(8).enumerate() {
                                    if let Some(full) = s.get("path_full").and_then(|v| v.as_str()) {
                                        let thumb = s
                                            .get("path_thumbnail")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or(full);
                                        out.push(ArtItem {
                                            id: format!("steam_shot_{app_id}_{idx}"),
                                            title: format!("{gname} — Screenshot #{}", idx + 1),
                                            game_name: Some(gname.clone()),
                                            author: Some("Steam Official".into()),
                                            source: "steam".into(),
                                            category: "wallpaper".into(),
                                            image_url: full.to_string(),
                                            thumb_url: thumb.to_string(),
                                            width: Some(1920),
                                            height: Some(1080),
                                            file_size_bytes: None,
                                            file_format: Some("jpg".into()),
                                            page_url: Some(format!(
                                                "https://store.steampowered.com/app/{app_id}"
                                            )),
                                            is_liked: false,
                                            popularity: 0,
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

    for (resp_res, cat) in [(hero_res, "hero")] {
        if let Ok(r) = resp_res {
            if let Ok(json) = r.json::<Value>().await {
                if let Some(arr) = json.get("data").and_then(|d| d.as_array()) {
                    for (idx, item) in arr.iter().take(12).enumerate() {
                        let Some(img_url) = item.get("url").and_then(|v| v.as_str()) else {
                            continue;
                        };
                        let thumb = item
                            .get("thumb")
                            .and_then(|v| v.as_str())
                            .unwrap_or(img_url);
                        let w = item.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
                        let h = item.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
                        let src = item
                            .get("source")
                            .and_then(|v| v.as_str())
                            .unwrap_or("steamgriddb");
                        out.push(ArtItem {
                            id: format!("sgdb_{cat}_{:x}_{idx}", md5_or_fnv(img_url)),
                            title: format!(
                                "{} — {} #{}",
                                query.trim(),
                                if cat == "hero" { "Hero Art" } else { "Cover Art" },
                                idx + 1
                            ),
                            game_name: Some(query.trim().to_string()),
                            author: item
                                .get("author")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string()),
                            source: src.to_string(),
                            category: cat.to_string(),
                            file_format: Some(infer_format_from_url_or_mime(img_url, None)),
                            image_url: img_url.to_string(),
                            thumb_url: thumb.to_string(),
                            width: w,
                            height: h,
                            file_size_bytes: None,
                            page_url: None,
                            is_liked: false,
                            popularity: 0,
                        });
                    }
                }
            }
        }
    }

    out
}


/// 1. Official Microsoft Bing 4K UHD Wallpapers (fast 1080p preview + 3840x2160 UHD full download).
async fn fetch_bing_uhd_wallpapers(http: &reqwest::Client, query: &str, page: u32) -> Vec<ArtItem> {
    if !query.trim().is_empty() {
        let low = query.trim().to_ascii_lowercase();
        let relevant = ["landscape", "nature", "mountain", "space", "night", "ocean", "forest", "city", "minimal", "wallpaper"]
            .iter()
            .any(|k| low.contains(k));
        if !relevant {
            return Vec::new();
        }
    }
    let idx = (page.saturating_sub(1)) * 8;
    if idx > 8 {
        return Vec::new();
    }
    let url = format!(
        "https://www.bing.com/HPImageArchive.aspx?format=js&idx={idx}&n=8&mkt=en-US"
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(images) = json.get("images").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for (i, img) in images.iter().enumerate() {
        let Some(urlbase) = img.get("urlbase").and_then(|v| v.as_str()) else {
            continue;
        };
        let title = img
            .get("title")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .unwrap_or("Bing 4K UHD Wallpaper");
        let copyright = img
            .get("copyright")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let hsh = img
            .get("hsh")
            .and_then(|v| v.as_str())
            .unwrap_or("bing");
        let full_url = format!("https://www.bing.com{urlbase}_UHD.jpg");
        let thumb_url = format!("https://www.bing.com{urlbase}_1366x768.jpg");
        out.push(ArtItem {
            id: format!("bing_{hsh}_{i}"),
            title: format!("{title} — 4K UHD"),
            game_name: None,
            author: copyright,
            source: "bing_uhd".into(),
            category: "wallpaper".into(),
            image_url: full_url,
            thumb_url,
            width: Some(3840),
            height: Some(2160),
            file_size_bytes: None,
            file_format: Some("jpg".into()),
            page_url: Some("https://www.bing.com".into()),
            is_liked: false,
            popularity: 7_400u64.saturating_sub((i as u64) * 90),
        });
    }
    out
}

/// 2. Openverse HD Creative Commons Art & Visuals (strictly mature=false, fast thumbnails, zero API key).
async fn fetch_openverse_art(
    http: &reqwest::Client,
    query: &str,
    page: u32,
    sync_nonce: u32,
) -> Vec<ArtItem> {
    const EXPLORE_ART_QUERIES: &[&str] = &[
        "cyberpunk neon art",
        "sci-fi concept art",
        "fantasy landscape painting",
        "futuristic city night",
        "digital illustration space",
    ];
    let rot = (sync_nonce as usize).wrapping_add(page.saturating_sub(1) as usize);
    let q_str = if query.trim().is_empty() {
        EXPLORE_ART_QUERIES[rot % EXPLORE_ART_QUERIES.len()].to_string()
    } else {
        query.trim().to_string()
    };
    let sub_page = if query.trim().is_empty() {
        (page.saturating_sub(1) / EXPLORE_ART_QUERIES.len() as u32) + 1
    } else {
        page.max(1)
    };
    let url = format!(
        "https://api.openverse.org/v1/images/?q={}&page={}&page_size=14&mature=false&size=large",
        url_encode_component(&q_str),
        sub_page
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(results) = json.get("results").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for (idx, item) in results.iter().enumerate() {
        let Some(id) = item.get("id").and_then(|v| v.as_str()) else {
            continue;
        };
        let Some(full_url) = item.get("url").and_then(|v| v.as_str()) else {
            continue;
        };
        if !full_url.starts_with("https://") {
            continue;
        }
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("HD Digital Artwork");
        if !is_strict_sfw(title) {
            continue;
        }
        let width = item.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
        let height = item.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
        if let (Some(w), Some(h)) = (width, height) {
            if w.max(h) < 1280 {
                continue;
            }
        }
        let thumb_url = item
            .get("thumbnail")
            .and_then(|v| v.as_str())
            .filter(|s| s.starts_with("https://"))
            .unwrap_or(full_url)
            .to_string();
        let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);
        let is_wide = matches!((width, height), (Some(w), Some(h)) if (w as f64 / h.max(1) as f64) >= 2.05);
        let creator = item
            .get("creator")
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .map(|s| s.to_string());
        let page_url = item
            .get("foreign_landing_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let ext = infer_format_from_url_or_mime(full_url, None);

        out.push(ArtItem {
            id: format!("ov_{id}"),
            title: title.chars().take(80).collect(),
            game_name: if query.trim().is_empty() {
                None
            } else {
                Some(query.trim().to_string())
            },
            author: creator,
            source: "openverse".into(),
            category: if is_wide {
                "hero".into()
            } else if is_portrait {
                "cover".into()
            } else {
                "concept".into()
            },
            image_url: full_url.to_string(),
            thumb_url,
            width,
            height,
            file_size_bytes: None,
            file_format: Some(ext),
            page_url,
            is_liked: false,
            popularity: 6_800u64.saturating_sub((idx as u64) * 80),
        });
    }
    out
}

/// 3. Art Institute of Chicago Public IIIF API: ultra-high-res classical, dark fantasy & epic paintings.
async fn fetch_artic_art(
    http: &reqwest::Client,
    query: &str,
    page: u32,
    sync_nonce: u32,
) -> Vec<ArtItem> {
    const EXPLORE_PAINTINGS: &[&str] = &[
        "night sky landscape",
        "dragon samurai armor",
        "castle storm mountain",
        "mythology battle dramatic",
        "architecture gothic cathedral",
    ];
    let rot = (sync_nonce as usize).wrapping_add(page.saturating_sub(1) as usize);
    let q_str = if query.trim().is_empty() {
        EXPLORE_PAINTINGS[rot % EXPLORE_PAINTINGS.len()].to_string()
    } else {
        let low = query.trim().to_ascii_lowercase();
        let art_match = ["fantasy", "dark", "samurai", "medieval", "painting", "art", "dragon", "castle", "space", "night", "landscape", "gothic"]
            .iter()
            .any(|k| low.contains(k));
        if !art_match {
            return Vec::new();
        }
        query.trim().to_string()
    };
    let url = format!(
        "https://api.artic.edu/api/v1/artworks/search?q={}&page={}&limit=10&fields=id,title,artist_title,image_id,thumbnail",
        url_encode_component(&q_str),
        page.max(1)
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(arr) = json.get("data").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for (idx, item) in arr.iter().enumerate() {
        let Some(id_num) = item.get("id").and_then(|v| v.as_i64()) else {
            continue;
        };
        let Some(image_id) = item.get("image_id").and_then(|v| v.as_str()) else {
            continue;
        };
        let title = item
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("Fine Art Masterpiece");
        if !is_strict_sfw(title) {
            continue;
        }
        let width = item
            .get("thumbnail")
            .and_then(|t| t.get("width"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let height = item
            .get("thumbnail")
            .and_then(|t| t.get("height"))
            .and_then(|v| v.as_u64())
            .map(|v| v as u32);
        let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);
        let artist = item
            .get("artist_title")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string());
        let thumb_url = format!("https://www.artic.edu/iiif/2/{image_id}/full/600,/0/default.jpg");
        let full_url = format!("https://www.artic.edu/iiif/2/{image_id}/full/full/0/default.jpg");

        out.push(ArtItem {
            id: format!("artic_{id_num}"),
            title: title.chars().take(80).collect(),
            game_name: None,
            author: artist,
            source: "artic".into(),
            category: if is_portrait { "cover".into() } else { "concept".into() },
            image_url: full_url,
            thumb_url,
            width,
            height,
            file_size_bytes: None,
            file_format: Some("jpg".into()),
            page_url: Some(format!("https://www.artic.edu/artworks/{id_num}")),
            is_liked: false,
            popularity: 6_200u64.saturating_sub((idx as u64) * 70),
        });
    }
    out
}

/// 3b. Dedicated Wallhaven Digital & Concept Art stream (high-popularity paintings & game art, >=1920x1080).
async fn fetch_wallhaven_digital_art(
    http: &reqwest::Client,
    query: &str,
    page: u32,
    sync_nonce: u32,
) -> Vec<ArtItem> {
    let wh_categories = if is_anime_query(query) { "110" } else { "100" };
    const ART_THEMES: &[&str] = &[
        "digital art",
        "concept art",
        "fantasy art",
        "sci-fi art",
        "cyberpunk art",
    ];
    let q_str = if query.trim().is_empty() {
        ART_THEMES[(sync_nonce as usize) % ART_THEMES.len()].to_string()
    } else {
        format!("{} art", query.trim())
    };
    let art_sort = if (sync_nonce + page) % 2 == 0 {
        "sorting=toplist&topRange=1M"
    } else {
        "sorting=favorites&order=desc"
    };
    let url = format!(
        "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&atleast=1920x1080&{art_sort}&page={}&q={}",
        page.max(1),
        url_encode_component(&q_str)
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(arr) = json.get("data").and_then(|d| d.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            if item.get("purity").and_then(|v| v.as_str()).unwrap_or("") != "sfw" {
                return None;
            }
            let id = item.get("id")?.as_str()?;
            let image_url = item.get("path")?.as_str()?.to_string();
            let width = item.get("dimension_x").and_then(|v| v.as_u64()).map(|v| v as u32);
            let height = item.get("dimension_y").and_then(|v| v.as_u64()).map(|v| v as u32);
            let file_size_bytes = item.get("file_size").and_then(|v| v.as_u64());
            let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);
            let wh_ratio = match (width, height) {
                (Some(w), Some(h)) if h > 0 => w as f64 / h as f64,
                _ => 1.6,
            };
            let is_non_standard = is_portrait || wh_ratio >= 2.05 || wh_ratio < 1.2;
            if is_non_standard && file_size_bytes.unwrap_or(0) > 2_800_000 {
                return None;
            }
            let thumb_url = if is_non_standard || file_size_bytes.unwrap_or(u64::MAX) <= 450_000 {
                image_url.clone()
            } else {
                item.get("thumbs")
                    .and_then(|t| t.get("large").or_else(|| t.get("original")))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&image_url)
                    .to_string()
            };
            let favs = item.get("favorites").and_then(|v| v.as_u64()).unwrap_or(0);
            let views = item.get("views").and_then(|v| v.as_u64()).unwrap_or(0);
            let pop = 6_200u64.saturating_add(favs.saturating_mul(25)).saturating_add(views / 40);
            Some(ArtItem {
                id: format!("wha_{id}"),
                title: if query.trim().is_empty() {
                    format!("Digital Concept Art #{id}")
                } else {
                    format!("{} — Concept Art #{id}", query.trim())
                },
                game_name: if query.trim().is_empty() { None } else { Some(query.trim().to_string()) },
                author: None,
                source: "wallhaven_art".into(),
                category: if is_portrait { "cover".into() } else { "concept".into() },
                image_url: image_url.clone(),
                thumb_url,
                width,
                height,
                file_size_bytes,
                file_format: Some(infer_format_from_url_or_mime(&image_url, None)),
                page_url: item.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                is_liked: false,
                popularity: pop,
            })
        })
        .collect()
}

/// 4. Waifu.im SFW: strictly non-NSFW character illustrations with exact dimensions.
async fn fetch_waifu_im_sfw(http: &reqwest::Client, query: &str) -> Vec<ArtItem> {
    // Skip when searching a specific non-anime game query unless it's Explore or matches character/anime
    let mut url = "https://api.waifu.im/search?is_nsfw=false&many=true".to_string();
    if !query.trim().is_empty() {
        let low = query.trim().to_ascii_lowercase();
        if low.contains("genshin") || low.contains("raiden") {
            url.push_str("&included_tags=raiden-shogun");
        } else if low.contains("honkai") || low.contains("anime") || low.contains("nier") {
            url.push_str("&included_tags=waifu");
        } else {
            return Vec::new();
        }
    } else {
        url.push_str("&included_tags=waifu");
    }

    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(images) = json.get("images").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for img in images.iter().take(12) {
        if img.get("is_nsfw").and_then(|v| v.as_bool()).unwrap_or(false) {
            continue;
        }
        let Some(url_str) = img.get("url").and_then(|v| v.as_str()) else {
            continue;
        };
        let id = img
            .get("image_id")
            .and_then(|v| v.as_i64())
            .map(|n| n.to_string())
            .unwrap_or_else(|| format!("{:x}", md5_or_fnv(url_str)));
        let width = img.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
        let height = img.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
        let byte_size = img.get("byte_size").and_then(|v| v.as_u64());
        let is_portrait = matches!((width, height), (Some(w), Some(h)) if h > w);
        let artist = img
            .get("artist")
            .and_then(|a| a.get("name"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        out.push(ArtItem {
            id: format!("wim_{id}"),
            title: format!("Character Illustration #{id}"),
            game_name: None,
            author: artist,
            source: "waifu_im".into(),
            category: if is_portrait { "cover".into() } else { "concept".into() },
            file_format: Some(infer_format_from_url_or_mime(url_str, None)),
            image_url: url_str.to_string(),
            thumb_url: url_str.to_string(),
            width,
            height,
            file_size_bytes: byte_size,
            page_url: img.get("source").and_then(|v| v.as_str()).map(|s| s.to_string()),
            is_liked: false,
            popularity: 0,
        });
    }
    out
}

/// 5. Nekos.best SFW: strictly SFW character illustrations with artist attribution.
async fn fetch_nekos_best_sfw(http: &reqwest::Client, query: &str) -> Vec<ArtItem> {
    let url = if query.trim().is_empty() {
        "https://nekos.best/api/v2/neko?amount=10".to_string()
    } else {
        format!(
            "https://nekos.best/api/v2/search?query={}&type=1&amount=10",
            url_encode_component(query.trim())
        )
    };
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(results) = json.get("results").and_then(|v| v.as_array()) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for (idx, item) in results.iter().enumerate() {
        let Some(img_url) = item.get("url").and_then(|v| v.as_str()) else {
            continue;
        };
        let artist = item
            .get("artist_name")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        let src_url = item
            .get("source_url")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
        out.push(ArtItem {
            id: format!("nb_{:x}_{idx}", md5_or_fnv(img_url)),
            title: if query.trim().is_empty() {
                format!("Digital Illustration #{}", idx + 1)
            } else {
                format!("{} — Illustration #{}", query.trim(), idx + 1)
            },
            game_name: if query.trim().is_empty() {
                None
            } else {
                Some(query.trim().to_string())
            },
            author: artist,
            source: "nekos_best".into(),
            category: "concept".into(),
            file_format: Some(infer_format_from_url_or_mime(img_url, None)),
            image_url: img_url.to_string(),
            thumb_url: img_url.to_string(),
            width: None,
            height: None,
            file_size_bytes: None,
            page_url: src_url,
            is_liked: false,
            popularity: 0,
        });
    }
    out
}


/// 6. Wallhaven 5K–8K Ultra-HD stream (SFW only, >= 5120x2880).
async fn fetch_wallhaven_8k(http: &reqwest::Client, query: &str, page: u32) -> Vec<ArtItem> {
    let wh_categories = if is_anime_query(query) { "110" } else { "100" };
    let q_str = if query.trim().is_empty() {
        "video games OR cyberpunk OR fantasy OR sci-fi".to_string()
    } else {
        query.trim().to_string()
    };
    let range_8k = if page % 2 == 1 { "3M" } else { "1y" };
    let url = format!(
        "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&atleast=5120x2880&sorting=toplist&topRange={range_8k}&page={}&q={}",
        page.max(1),
        url_encode_component(&q_str)
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(arr) = json.get("data").and_then(|d| d.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            if item.get("purity").and_then(|v| v.as_str()).unwrap_or("") != "sfw" {
                return None;
            }
            let id = item.get("id")?.as_str()?;
            let image_url = item.get("path")?.as_str()?.to_string();
            let width = item.get("dimension_x").and_then(|v| v.as_u64()).map(|v| v as u32);
            let height = item.get("dimension_y").and_then(|v| v.as_u64()).map(|v| v as u32);
            let file_size_bytes = item.get("file_size").and_then(|v| v.as_u64());
            let thumb_url = item
                .get("thumbs")
                .and_then(|t| t.get("large").or_else(|| t.get("original")))
                .and_then(|v| v.as_str())
                .unwrap_or(&image_url)
                .to_string();
            let favs = item.get("favorites").and_then(|v| v.as_u64()).unwrap_or(0);
            let views = item.get("views").and_then(|v| v.as_u64()).unwrap_or(0);
            let wh8k_pop = 6_500u64.saturating_add(favs.saturating_mul(25)).saturating_add(views / 40);
            let is_wide = matches!((width, height), (Some(w), Some(h)) if (w as f64 / h.max(1) as f64) >= 2.1);
            Some(ArtItem {
                id: format!("wh8k_{id}"),
                title: format!("8K Ultra-HD Wallpaper #{id}"),
                game_name: if query.trim().is_empty() { None } else { Some(query.trim().to_string()) },
                author: None,
                source: "wallhaven_8k".into(),
                category: if is_wide { "hero".into() } else { "wallpaper".into() },
                image_url: image_url.clone(),
                thumb_url,
                width,
                height,
                file_size_bytes,
                file_format: Some(infer_format_from_url_or_mime(&image_url, None)),
                page_url: item.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                is_liked: false,
                popularity: wh8k_pop,
            })
        })
        .collect()
}

/// 7. Wallhaven 8K Ultrawide & Dual-Monitor panoramic stream (>= 5120x2160, 21:9 / 32:9).
async fn fetch_wallhaven_ultrawide_8k(http: &reqwest::Client, query: &str, page: u32) -> Vec<ArtItem> {
    let wh_categories = if is_anime_query(query) { "110" } else { "100" };
    const UW_THEMES: &[&str] = &[
        "cyberpunk",
        "sci-fi",
        "fantasy",
        "space",
        "landscape",
        "video games",
    ];
    let (q_part, sub_page) = if query.trim().is_empty() {
        let theme = UW_THEMES[(page.saturating_sub(1) as usize) % UW_THEMES.len()];
        let sp = (page.saturating_sub(1) / UW_THEMES.len() as u32) + 1;
        (format!("&q={}", url_encode_component(theme)), sp)
    } else {
        (format!("&q={}", url_encode_component(query.trim())), page.max(1))
    };
    let uw_sort = if page % 2 == 1 {
        "sorting=toplist&topRange=3M"
    } else {
        "sorting=favorites&order=desc"
    };
    let url = format!(
        "https://wallhaven.cc/api/v1/search?categories={wh_categories}&purity=100&ratios=21x9,32x9&atleast=2560x1080&{uw_sort}&page={sub_page}{q_part}"
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(arr) = json.get("data").and_then(|d| d.as_array()) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|item| {
            if item.get("purity").and_then(|v| v.as_str()).unwrap_or("") != "sfw" {
                return None;
            }
            let id = item.get("id")?.as_str()?;
            let image_url = item.get("path")?.as_str()?.to_string();
            let width = item.get("dimension_x").and_then(|v| v.as_u64()).map(|v| v as u32);
            let height = item.get("dimension_y").and_then(|v| v.as_u64()).map(|v| v as u32);
            let file_size_bytes = item.get("file_size").and_then(|v| v.as_u64());
            // Use uncropped ultrawide image when <=3.5MB so 21:9/32:9 panoramas aren't chopped to 3:2
            let thumb_url = if file_size_bytes.unwrap_or(u64::MAX) <= 1_400_000 {
                image_url.clone()
            } else {
                item.get("thumbs")
                    .and_then(|t| t.get("large").or_else(|| t.get("original")))
                    .and_then(|v| v.as_str())
                    .unwrap_or(&image_url)
                    .to_string()
            };
            Some(ArtItem {
                id: format!("whuw_{id}"),
                title: format!("Ultrawide Panoramic #{id}"),
                game_name: if query.trim().is_empty() { None } else { Some(query.trim().to_string()) },
                author: None,
                source: "wallhaven_uw".into(),
                category: "hero".into(),
                image_url: image_url.clone(),
                thumb_url,
                width,
                height,
                file_size_bytes,
                file_format: Some(infer_format_from_url_or_mime(&image_url, None)),
                page_url: item.get("url").and_then(|v| v.as_str()).map(|s| s.to_string()),
                is_liked: false,
                popularity: 0,
            })
        })
        .collect()
}

/// 8. NASA Images API: 4K–8K+ cosmos, nebula & sci-fi space wallpapers.
async fn fetch_nasa_8k_art(http: &reqwest::Client, query: &str, page: u32) -> Vec<ArtItem> {
    let q_str = if query.trim().is_empty() {
        "nebula galaxy cosmos".to_string()
    } else {
        let low = query.trim().to_ascii_lowercase();
        if low.contains("space") || low.contains("starfield") || low.contains("no man") || low.contains("mass effect") || low.contains("sci") {
            "nebula deep space".to_string()
        } else {
            return Vec::new();
        }
    };
    let url = format!(
        "https://images-api.nasa.gov/search?q={}&media_type=image&page_size=12&page={}",
        url_encode_component(&q_str),
        page.max(1)
    );
    let Ok(resp) = http
        .get(&url)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    else {
        return Vec::new();
    };
    if !resp.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = resp.json::<Value>().await else {
        return Vec::new();
    };
    let Some(items) = json
        .get("collection")
        .and_then(|c| c.get("items"))
        .and_then(|i| i.as_array())
    else {
        return Vec::new();
    };

    let mut out = Vec::new();
    for item in items.iter().take(10) {
        let Some(data) = item.get("data").and_then(|d| d.as_array()).and_then(|a| a.first()) else {
            continue;
        };
        let Some(nasa_id) = data.get("nasa_id").and_then(|v| v.as_str()) else {
            continue;
        };
        let title = data
            .get("title")
            .and_then(|v| v.as_str())
            .unwrap_or("NASA Deep Space 8K")
            .to_string();
        let Some(thumb) = item
            .get("links")
            .and_then(|l| l.as_array())
            .and_then(|a| a.first())
            .and_then(|f| f.get("href"))
            .and_then(|v| v.as_str())
        else {
            continue;
        };
        let orig = thumb.replace("~thumb.jpg", "~orig.jpg").replace("~medium.jpg", "~orig.jpg");
        out.push(ArtItem {
            id: format!("nasa_{nasa_id}"),
            title,
            game_name: None,
            author: Some("NASA / ESA".into()),
            source: "nasa".into(),
            category: "wallpaper".into(),
            image_url: orig,
            thumb_url: thumb.to_string(),
            width: Some(7680),
            height: Some(4320),
            file_size_bytes: None,
            file_format: Some("jpg".into()),
            page_url: Some(format!("https://images.nasa.gov/details/{nasa_id}")),
            is_liked: false,
            popularity: 0,
        });
    }
    out
}

static ART_SEARCH_CACHE: std::sync::OnceLock<
    std::sync::Mutex<std::collections::HashMap<String, (std::time::Instant, Vec<ArtItem>)>>,
> = std::sync::OnceLock::new();

#[tauri::command]
pub async fn search_art_wallpapers(
    db: State<'_, Database>,
    http: State<'_, HttpClient>,
    query: String,
    category: Option<String>,
    page: Option<u32>,
    sync_nonce: Option<u32>,
) -> AppResult<Vec<ArtItem>> {
    let q = query.trim().to_string();
    let cat = category.unwrap_or_else(|| "all".to_string());
    let pg = page.unwrap_or(1).max(1);
    let nonce = sync_nonce.unwrap_or(0);

    let cache_key = format!("{}|{}|{}|{}", q.to_ascii_lowercase(), cat, pg, nonce);
    let cache = ART_SEARCH_CACHE.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()));
    if let Ok(guard) = cache.lock() {
        if let Some((ts, cached)) = guard.get(&cache_key) {
            if ts.elapsed() < std::time::Duration::from_secs(180) {
                return Ok(cached.clone());
            }
        }
    }

    let explore_seeds = [
        "Elden Ring",
        "Cyberpunk 2077",
        "Red Dead Redemption 2",
        "God of War",
        "Ghost of Tsushima",
        "The Witcher 3",
        "Black Myth: Wukong",
        "Baldur's Gate 3",
        "DOOM Eternal",
        "Sekiro: Shadows Die Twice",
        "Horizon Forbidden West",
        "Hollow Knight",
        "Resident Evil 4",
        "Grand Theft Auto V",
        "Clair Obscur: Expedition 33",
        "Helldivers 2",
        "Dark Souls III",
        "Assassin's Creed Mirage",
        "Final Fantasy VII",
        "Lies of P",
        "Alan Wake 2",
        "Star Wars Jedi: Survivor",
        "Monster Hunter: World",
        "Marvel's Spider-Man",
        "Death Stranding",
        "Halo Infinite",
        "Armored Core VI",
        "Destiny 2",
    ];
    let game_future = async {
        if q.is_empty() {
            let base = (((pg - 1) + nonce) as usize * 2) % explore_seeds.len();
            let (g1, g2, igdb1) = tokio::join!(
                fetch_steam_and_sgdb_for_game(&http.0, explore_seeds[base]),
                fetch_steam_and_sgdb_for_game(&http.0, explore_seeds[(base + 1) % explore_seeds.len()]),
                fetch_igdb_gateway_art(&http.0, "", pg + nonce),
            );
            let mut mixed = Vec::new();
            if cat == "hero" {
                for list in [g1, g2] {
                    mixed.extend(list.into_iter().filter(|i| i.category == "hero").take(6));
                }
            } else if cat == "cover" {
                // Vertical / Portrait art comes from Wallhaven Portrait, Openverse & Art Institute (not game box covers)
            } else if cat == "wallpaper" {
                for list in [g1, g2] {
                    mixed.extend(
                        list.into_iter()
                            .filter(|i| i.category == "wallpaper" || i.category == "hero")
                            .take(6),
                    );
                }
                mixed.extend(igdb1.into_iter().filter(|i| i.category == "wallpaper"));
            } else {
                for list in [g1, g2] {
                    for hero in list.iter().filter(|i| i.category == "hero").take(3) {
                        mixed.push(hero.clone());
                    }
                    for shot in list.iter().filter(|i| i.category == "wallpaper").take(3) {
                        mixed.push(shot.clone());
                    }
                }
                mixed.extend(igdb1);
            }
            mixed
        } else {
            let (steam_sgdb, igdb_items) = tokio::join!(
                fetch_steam_and_sgdb_for_game(&http.0, &q),
                fetch_igdb_gateway_art(&http.0, &q, pg),
            );
            let mut all = steam_sgdb;
            all.extend(igdb_items);
            all
        }
    };

    let effective_wh_page = pg + (nonce % 3);
    let cap = std::time::Duration::from_millis(3600);
    let is_search = !q.is_empty();
    let (
        wh_items,
        wh_art_items,
        wh_8k_items,
        wh_uw_items,
        wh_portrait_items,
        bing_items,
        openverse_items,
        artic_items,
        sb_items,
        kc_items,
        wim_items,
        nb_items,
        nasa_items,
        game_items,
    ) = tokio::join!(
        async {
            tokio::time::timeout(cap, fetch_wallhaven(&http.0, &q, &cat, effective_wh_page, nonce))
                .await
                .unwrap_or_default()
        },
        async {
            if !is_search && (cat == "all" || cat == "concept") {
                tokio::time::timeout(cap, fetch_wallhaven_digital_art(&http.0, &q, effective_wh_page, nonce))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if is_search || (pg + nonce) % 2 == 0 || cat == "wallpaper" {
                tokio::time::timeout(cap, fetch_wallhaven_8k(&http.0, &q, effective_wh_page))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if cat == "hero" || (!is_search && ((pg + nonce) % 2 == 1 || pg >= 2)) {
                tokio::time::timeout(cap, fetch_wallhaven_ultrawide_8k(&http.0, &q, effective_wh_page))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if !is_search && (cat == "all" || cat == "cover") {
                tokio::time::timeout(cap, fetch_wallhaven(&http.0, &q, "cover", effective_wh_page, nonce))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            tokio::time::timeout(cap, fetch_bing_uhd_wallpapers(&http.0, &q, pg))
                .await
                .unwrap_or_default()
        },
        async {
            tokio::time::timeout(cap, fetch_openverse_art(&http.0, &q, pg, nonce))
                .await
                .unwrap_or_default()
        },
        async {
            tokio::time::timeout(cap, fetch_artic_art(&http.0, &q, pg, nonce))
                .await
                .unwrap_or_default()
        },
        async {
            if is_anime_query(&q) {
                tokio::time::timeout(cap, fetch_safebooru_art(&http.0, &q, &cat, pg + nonce))
                    .await
                    .unwrap_or_default()
            } else if q.is_empty() {
                tokio::time::timeout(cap, fetch_safebooru_art(&http.0, "video_games", &cat, pg + nonce))
                    .await
                    .unwrap_or_default()
                    .into_iter()
                    .take(2)
                    .collect()
            } else {
                Vec::new()
            }
        },
        async {
            if is_anime_query(&q) {
                tokio::time::timeout(cap, fetch_konachan_safe_art(&http.0, &q, pg + nonce))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if is_anime_query(&q) {
                tokio::time::timeout(cap, fetch_waifu_im_sfw(&http.0, &q))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            if is_anime_query(&q) {
                tokio::time::timeout(cap, fetch_nekos_best_sfw(&http.0, &q))
                    .await
                    .unwrap_or_default()
            } else {
                Vec::new()
            }
        },
        async {
            tokio::time::timeout(cap, fetch_nasa_8k_art(&http.0, &q, pg + nonce))
                .await
                .unwrap_or_default()
        },
        async {
            tokio::time::timeout(std::time::Duration::from_millis(4200), game_future)
                .await
                .unwrap_or_default()
        },
    );

    let mut wh_mixed = Vec::with_capacity(wh_items.len() + wh_portrait_items.len());
    let mut it_main = wh_items.into_iter();
    let mut it_port = wh_portrait_items.into_iter();
    loop {
        let mut any = false;
        if let Some(a) = it_main.next() {
            wh_mixed.push(a);
            any = true;
        }
        if let Some(b) = it_port.next() {
            wh_mixed.push(b);
            any = true;
        }
        if !any {
            break;
        }
    }

    let liked_ids: HashSet<String> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let mut set = HashSet::new();
        if let Ok(mut stmt) = conn.prepare("SELECT id FROM liked_artworks") {
            if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                for id in rows.flatten() {
                    set.insert(id);
                }
            }
        }
        set
    };

    let mut seen_urls = HashSet::new();
    let mut merged = Vec::new();

    let mut it_wh = wh_mixed.into_iter();
    let mut it_wha = wh_art_items.into_iter();
    let mut it_8k = wh_8k_items.into_iter();
    let mut it_uw = wh_uw_items.into_iter();
    let mut it_bing = bing_items.into_iter();
    let mut it_ov = openverse_items.into_iter();
    let mut it_artic = artic_items.into_iter();
    let mut it_sb = sb_items.into_iter();
    let mut it_kc = kc_items.into_iter();
    let mut it_wim = wim_items.into_iter();
    let mut it_nb = nb_items.into_iter();
    let mut it_nasa = nasa_items.into_iter();
    let mut it_gm = game_items.into_iter();
    loop {
        let mut pushed_any = false;
        for next_opt in [
            it_gm.next(),
            it_8k.next(),
            it_wh.next(),
            it_wha.next(),
            it_uw.next(),
            it_bing.next(),
            it_ov.next(),
            it_artic.next(),
            it_nasa.next(),
            it_sb.next(),
            it_kc.next(),
            it_wim.next(),
            it_nb.next(),
        ] {
            if let Some(mut item) = next_opt {
                pushed_any = true;
                if !is_strict_sfw(&item.title) {
                    continue;
                }
                if !seen_urls.insert(item.image_url.clone()) {
                    continue;
                }
                if cat != "all" && item.category != cat {
                    continue;
                }
                // Keep Explore crisp: skip tiny low-res non-cover images
                if q.is_empty() && item.category != "cover" {
                    if let (Some(w), Some(h)) = (item.width, item.height) {
                        if w.max(h) < 1280 {
                            continue;
                        }
                    }
                }
                item.is_liked = liked_ids.contains(&item.id);
                if item.popularity == 0 {
                    let res_bonus = match (item.width, item.height) {
                        (Some(w), Some(h)) if w.max(h) >= 5120 => 1_800,
                        (Some(w), Some(h)) if w.max(h) >= 3840 => 1_400,
                        (Some(w), Some(h)) if w.max(h) >= 2560 => 900,
                        (Some(w), Some(h)) if w.max(h) >= 1920 => 500,
                        _ => 100,
                    };
                    let base_score: u64 = match item.source.as_str() {
                        "steam" => 9_200,
                        "steamgriddb" => 8_900,
                        "igdb" => 8_500,
                        "wallhaven_8k" => 8_800,
                        "wallhaven_art" => 8_600,
                        "wallhaven_uw" => 7_800,
                        "wallhaven" => 7_600,
                        "bing_uhd" => 7_400,
                        "openverse" => 6_800,
                        "artic" => 6_400,
                        "nasa" => 5_200,
                        "safebooru" | "konachan" | "waifu_im" | "nekos_best" => {
                            if is_anime_query(&q) { 7_600 } else { 2_200 }
                        }
                        _ => 5_000,
                    };
                    let rank_decay = (merged.len() as u64).saturating_mul(35);
                    item.popularity = base_score
                        .saturating_add(res_bonus)
                        .saturating_sub(rank_decay);
                }
                merged.push(item);
            }
        }
        if !pushed_any {
            break;
        }
    }

    // Always place the most popular, highest-impact artworks first
    merged.sort_by(|a, b| b.popularity.cmp(&a.popularity));

    if !merged.is_empty() {
        if let Ok(mut guard) = cache.lock() {
            if guard.len() >= 24 {
                guard.clear();
            }
            guard.insert(cache_key, (std::time::Instant::now(), merged.clone()));
        }
    }

    Ok(merged)
}

#[tauri::command]
pub async fn toggle_like_artwork(db: State<'_, Database>, item: ArtItem) -> AppResult<bool> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let exists: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM liked_artworks WHERE id = ?1)",
            [&item.id],
            |row| row.get(0),
        )
        .unwrap_or(false);

    if exists {
        conn.execute("DELETE FROM liked_artworks WHERE id = ?1", [&item.id])
            .map_err(AppError::Database)?;
        Ok(false)
    } else {
        conn.execute(
            "INSERT OR REPLACE INTO liked_artworks \
             (id, title, game_name, author, source, category, image_url, thumb_url, width, height, file_size_bytes, file_format, page_url) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            rusqlite::params![
                item.id,
                item.title,
                item.game_name,
                item.author,
                item.source,
                item.category,
                item.image_url,
                item.thumb_url,
                item.width.map(|v| v as i64),
                item.height.map(|v| v as i64),
                item.file_size_bytes.map(|v| v as i64),
                item.file_format,
                item.page_url,
            ],
        )
        .map_err(AppError::Database)?;
        Ok(true)
    }
}

#[tauri::command]
pub async fn list_liked_artworks(db: State<'_, Database>) -> AppResult<Vec<ArtItem>> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let mut stmt = conn
        .prepare(
            "SELECT id, title, game_name, author, source, category, image_url, thumb_url, width, height, file_size_bytes, file_format, page_url \
             FROM liked_artworks ORDER BY liked_at DESC",
        )
        .map_err(AppError::Database)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ArtItem {
                id: row.get(0)?,
                title: row.get(1)?,
                game_name: row.get(2)?,
                author: row.get(3)?,
                source: row.get(4)?,
                category: row.get(5)?,
                image_url: row.get(6)?,
                thumb_url: row.get(7)?,
                width: row.get::<_, Option<i64>>(8)?.map(|v| v as u32),
                height: row.get::<_, Option<i64>>(9)?.map(|v| v as u32),
                file_size_bytes: row.get::<_, Option<i64>>(10)?.map(|v| v as u64),
                file_format: row.get(11)?,
                page_url: row.get(12)?,
                is_liked: true,
                popularity: 0,
            })
        })
        .map_err(AppError::Database)?;
    Ok(rows.flatten().collect())
}

#[tauri::command]
pub fn get_default_art_download_dir() -> AppResult<String> {
    let base = dirs::picture_dir()
        .or_else(dirs::download_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    Ok(base.join("Nexus Wallpapers").to_string_lossy().to_string())
}


const MAX_ARTWORK_DOWNLOAD_BYTES: u64 = 100 * 1024 * 1024; // 100 MB safety ceiling

fn validate_public_art_url(url: &str) -> AppResult<reqwest::Url> {
    let parsed = reqwest::Url::parse(url)
        .map_err(|e| AppError::Invalid(format!("Invalid artwork URL: {e}")))?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err(AppError::Invalid("Unsupported URL scheme".into()));
    }
    let Some(host) = parsed.host_str() else {
        return Err(AppError::Invalid("Artwork URL must include a valid host".into()));
    };
    let low_host = host.to_ascii_lowercase();
    if low_host == "localhost"
        || low_host.ends_with(".local")
        || low_host.ends_with(".internal")
    {
        return Err(AppError::Invalid("Local or internal URLs are not allowed".into()));
    }
    if let Ok(ip) = host.trim_matches(&['[', ']'][..]).parse::<std::net::IpAddr>() {
        let is_private = match ip {
            std::net::IpAddr::V4(v4) => {
                v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_broadcast()
                    || v4.is_unspecified()
            }
            std::net::IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
        };
        if is_private {
            return Err(AppError::Invalid("Private or loopback IP URLs are not allowed".into()));
        }
    }
    Ok(parsed)
}

#[tauri::command]
pub async fn get_artwork_download_info(
    http: State<'_, HttpClient>,
    url: String,
) -> AppResult<ArtDownloadInfo> {
    let parsed = validate_public_art_url(&url)?;

    let mut size_bytes: Option<u64> = None;
    let mut mime: Option<String> = None;

    if let Ok(r) = http
        .0
        .head(parsed.clone())
        .header("User-Agent", "Mozilla/5.0 NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_millis(3200))
        .send()
        .await
    {
        if r.status().is_success() {
            size_bytes = r.content_length().or_else(|| {
                r.headers()
                    .get(reqwest::header::CONTENT_LENGTH)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.trim().parse::<u64>().ok())
            });
            mime = r
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
        }
    }

    if size_bytes.is_none() {
        if let Ok(r) = http
            .0
            .get(parsed)
            .header("User-Agent", "Mozilla/5.0 NexusLauncher/0.8.0")
            .header("Range", "bytes=0-0")
            .timeout(std::time::Duration::from_millis(3200))
            .send()
            .await
        {
            if mime.is_none() {
                mime = r
                    .headers()
                    .get(reqwest::header::CONTENT_TYPE)
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string());
            }
            if let Some(cr) = r
                .headers()
                .get(reqwest::header::CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
            {
                if let Some(total_str) = cr.rsplit('/').next() {
                    if let Ok(parsed_total) = total_str.trim().parse::<u64>() {
                        size_bytes = Some(parsed_total);
                    }
                }
            }
            if size_bytes.is_none() && r.status() == reqwest::StatusCode::OK {
                size_bytes = r.content_length().or_else(|| {
                    r.headers()
                        .get(reqwest::header::CONTENT_LENGTH)
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.trim().parse::<u64>().ok())
                });
            }
        }
    }

    let file_format = infer_format_from_url_or_mime(&url, mime.as_deref());
    Ok(ArtDownloadInfo {
        size_bytes,
        mime_type: mime,
        file_format,
    })
}

#[tauri::command]
pub async fn download_artwork_file(
    app: AppHandle,
    http: State<'_, HttpClient>,
    url: String,
    dest_dir: String,
    filename: String,
    download_id: String,
) -> AppResult<String> {
    let parsed = validate_public_art_url(&url)?;

    let dir = PathBuf::from(&dest_dir);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Invalid(format!("Cannot create folder {dest_dir}: {e}")))?;

    let resp = http
        .0
        .get(parsed)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| AppError::Invalid(format!("Download request failed: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Invalid(format!(
            "Server returned HTTP {}",
            resp.status()
        )));
    }

    let total_bytes = resp.content_length();
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let ext = infer_format_from_url_or_mime(&url, mime.as_deref());
    let safe_base = sanitize_filename(&filename);
    let final_name = if safe_base.to_ascii_lowercase().ends_with(&format!(".{ext}")) {
        safe_base
    } else {
        format!("{safe_base}.{ext}")
    };

    let final_path = dir.join(&final_name);
    let part_path = dir.join(format!("{final_name}.part"));

    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| AppError::Invalid(format!("Cannot write file: {e}")))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut last_pct: i16 = -1;

    while let Some(chunk_res) = stream.next().await {
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                drop(file);
                let _ = tokio::fs::remove_file(&part_path).await;
                return Err(AppError::Invalid(format!("Stream error: {e}")));
            }
        };
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_ARTWORK_DOWNLOAD_BYTES {
            drop(file);
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(AppError::Invalid(
                "Artwork file exceeded 100 MB safety limit; download aborted.".into(),
            ));
        }
        if let Err(e) = file.write_all(&chunk).await {
            drop(file);
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(AppError::Invalid(format!("Disk write error: {e}")));
        }

        let pct = match total_bytes {
            Some(tot) if tot > 0 => ((downloaded as f64 / tot as f64) * 100.0).min(100.0) as u8,
            _ => 50,
        };
        if pct as i16 != last_pct {
            last_pct = pct as i16;
            let _ = app.emit(
                "art-download-progress",
                ArtDownloadProgressEvent {
                    download_id: download_id.clone(),
                    downloaded_bytes: downloaded,
                    total_bytes,
                    percent: pct,
                    status: "downloading".into(),
                },
            );
        }
    }

    file.flush()
        .await
        .map_err(|e| AppError::Invalid(format!("Flush error: {e}")))?;
    drop(file);

    tokio::fs::rename(&part_path, &final_path)
        .await
        .map_err(|e| AppError::Invalid(format!("Finalize error: {e}")))?;

    let _ = app.emit(
        "art-download-progress",
        ArtDownloadProgressEvent {
            download_id,
            downloaded_bytes: downloaded,
            total_bytes: Some(downloaded),
            percent: 100,
            status: "completed".into(),
        },
    );

    Ok(final_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_art_folder(file_path: String) -> AppResult<()> {
    let p = Path::new(&file_path);
    #[cfg(target_os = "windows")]
    {
        if p.exists() {
            let _ = std::process::Command::new("explorer.exe")
                .arg(format!("/select,{}", p.to_string_lossy()))
                .spawn();
        } else if let Some(parent) = p.parent() {
            let _ = std::process::Command::new("explorer.exe")
                .arg(parent)
                .spawn();
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Some(parent) = p.parent() {
            let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_desktop_wallpaper(
    http: State<'_, HttpClient>,
    url: String,
    filename: String,
) -> AppResult<String> {
    let parsed = validate_public_art_url(&url)?;
    let dir_str = get_default_art_download_dir()?;
    let dir = PathBuf::from(&dir_str);
    std::fs::create_dir_all(&dir)
        .map_err(|e| AppError::Invalid(format!("Cannot create wallpaper folder: {e}")))?;

    let resp = http
        .0
        .get(parsed)
        .header("User-Agent", "NexusLauncher/0.8.0")
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| AppError::Invalid(format!("Wallpaper download failed: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Invalid(format!("Server returned HTTP {}", resp.status())));
    }

    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let ext = infer_format_from_url_or_mime(&url, mime.as_deref());
    let safe_base = sanitize_filename(&filename);
    let final_name = if safe_base.to_ascii_lowercase().ends_with(&format!(".{ext}")) {
        safe_base
    } else {
        format!("{safe_base}.{ext}")
    };

    let final_path = dir.join(&final_name);
    let part_path = dir.join(format!("{final_name}.part"));
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|e| AppError::Invalid(format!("Cannot write wallpaper file: {e}")))?;

    let mut stream = resp.bytes_stream();
    let mut downloaded: u64 = 0;
    while let Some(chunk_res) = stream.next().await {
        let chunk = match chunk_res {
            Ok(c) => c,
            Err(e) => {
                drop(file);
                let _ = tokio::fs::remove_file(&part_path).await;
                return Err(AppError::Invalid(format!("Stream error: {e}")));
            }
        };
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > MAX_ARTWORK_DOWNLOAD_BYTES {
            drop(file);
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(AppError::Invalid("Artwork exceeded 100 MB safety limit".into()));
        }
        if let Err(e) = file.write_all(&chunk).await {
            drop(file);
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err(AppError::Invalid(format!("Disk write error: {e}")));
        }
    }
    file.flush()
        .await
        .map_err(|e| AppError::Invalid(format!("Flush error: {e}")))?;
    drop(file);

    tokio::fs::rename(&part_path, &final_path)
        .await
        .map_err(|e| AppError::Invalid(format!("Finalize error: {e}")))?;

    let saved_str = final_path.to_string_lossy().to_string();

    #[cfg(target_os = "windows")]
    {
        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPIF_SENDCHANGE, SPIF_UPDATEINIFILE, SPI_SETDESKWALLPAPER,
        };
        let wide: Vec<u16> = OsStr::new(&saved_str)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let ok = unsafe {
            SystemParametersInfoW(
                SPI_SETDESKWALLPAPER,
                0,
                wide.as_ptr() as *mut core::ffi::c_void,
                SPIF_UPDATEINIFILE | SPIF_SENDCHANGE,
            )
        };
        if ok == 0 {
            return Err(AppError::Invalid(
                "Windows refused to apply the desktop wallpaper.".into(),
            ));
        }
    }

    Ok(saved_str)
}
