use super::models::{HubGameDetails, NameIdItem, UnifiedArtwork};
use super::traits::{ArtworkProvider, MetadataProvider};
use crate::commands::hub::{
    self, apply_hub_filters_and_sort, expand_search_query, search_steam_store_fallback, HubGame,
    HubSearchFilters,
};
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::collections::HashSet;
use std::time::Duration;

pub const DEFAULT_GATEWAY_URL: &str =
    "https://nexus-metadata-gateway.nexus-amin.workers.dev";

#[derive(Deserialize)]
struct GatewayEnvelope<T> {
    success: bool,
    data: Option<T>,
    error: Option<GatewayError>,
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct GatewayError {
    code: String,
    message: String,
}

pub struct NexusCloudProvider {
    http: reqwest::Client,
    base_url: String,
}

impl NexusCloudProvider {
    pub fn new(http: reqwest::Client, base_url: Option<String>) -> Self {
        let url = base_url
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_GATEWAY_URL.to_string());
        Self {
            http,
            base_url: url.trim_end_matches('/').to_string(),
        }
    }

    async fn get_json<T: for<'de> Deserialize<'de>>(&self, path: &str) -> AppResult<T> {
        let full_url = format!("{}{path}", self.base_url);
        let res = self
            .http
            .get(&full_url)
            .timeout(Duration::from_millis(3200))
            .send()
            .await
            .map_err(|err| {
                if err.is_connect() || err.is_timeout() {
                    AppError::Other("Network disconnected or server unreachable. Please check your internet connection.".into())
                } else {
                    AppError::Other("Unable to connect to game catalog. Please check your internet connection.".into())
                }
            })?;

        if res.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AppError::Other("Gateway rate limit reached. Please wait a moment.".into()));
        }

        let body_text = res
            .text()
            .await
            .map_err(|e| AppError::Other(format!("Failed to read response body: {e}")))?;

        let envelope: GatewayEnvelope<T> = serde_json::from_str(&body_text)
            .map_err(|err| AppError::Other(format!("Unable to parse game catalog response: {err}")))?;

        if !envelope.success {
            let msg = envelope
                .error
                .map(|e| e.message)
                .unwrap_or_else(|| "Game catalog returned an error".into());
            return Err(AppError::Other(msg));
        }

        envelope
            .data
            .ok_or_else(|| AppError::Other("No game data available.".into()))
    }

    pub async fn fetch_feed_with_genres(
        &self,
        feed: &str,
        offset: i64,
        genres_csv: Option<&str>,
    ) -> AppResult<Vec<HubGame>> {
        let mut path = format!("/api/v1/games/feed/{feed}?offset={offset}");
        if let Some(g) = genres_csv.filter(|s| !s.is_empty()) {
            path.push_str(&format!("&genres={g}"));
        }
        self.get_json(&path).await
    }
}

impl MetadataProvider for NexusCloudProvider {
    fn provider_name(&self) -> &'static str {
        "nexus_cloud"
    }

    async fn fetch_feed(&self, feed: &str, offset: i64) -> AppResult<Vec<HubGame>> {
        let path = format!("/api/v1/games/feed/{feed}?offset={offset}");
        self.get_json(&path).await
    }

    async fn search_games(
        &self,
        query: &str,
        offset: i64,
        filters: &HubSearchFilters,
    ) -> AppResult<Vec<HubGame>> {
        let clean_q = query.trim();
        let expanded_q = expand_search_query(clean_q);
        let encoded_q = urlencoding_light(&expanded_q);
        let mut path = format!("/api/v1/games/search?q={encoded_q}&offset={offset}");

        let mut genre_ids = Vec::new();
        if let Some(ids) = &filters.genre_ids {
            genre_ids.extend(ids.iter().copied().filter(|&id| id > 0));
        } else if let Some(id) = filters.genre_id {
            if id > 0 {
                genre_ids.push(id);
            }
        }
        for gid in &genre_ids {
            path.push_str(&format!("&genre={gid}"));
        }

        let mut platform_ids = Vec::new();
        if let Some(ids) = &filters.platform_ids {
            platform_ids.extend(ids.iter().copied().filter(|&id| id > 0));
        } else if let Some(id) = filters.platform_id {
            if id > 0 {
                platform_ids.push(id);
            }
        }
        for pid in &platform_ids {
            path.push_str(&format!("&platform={pid}"));
        }

        let effective_release = match (&filters.release, filters.year_from, filters.year_to) {
            (Some(r), _, _) if !r.trim().is_empty() => Some(r.trim().to_string()),
            (_, Some(from), Some(to)) => Some(format!("{from}-{to}")),
            (_, Some(from), None) => Some(format!("{from}+")),
            (_, None, Some(to)) => Some(format!("-{to}")),
            _ => None,
        };
        if let Some(rel) = &effective_release {
            path.push_str(&format!("&release={}", urlencoding_light(rel)));
        }

        if let Some(mr) = filters.min_rating {
            path.push_str(&format!("&min_rating={mr}"));
        }

        if let Some(s) = &filters.sort {
            path.push_str(&format!("&sort={}", urlencoding_light(s)));
        }

        if let Some(cat) = &filters.game_category {
            if !cat.trim().is_empty() && cat != "all" {
                path.push_str(&format!("&game_category={}", urlencoding_light(cat)));
            }
        }

        if let Some(mode) = &filters.game_mode {
            if !mode.trim().is_empty() && mode != "all" {
                path.push_str(&format!("&game_mode={}", urlencoding_light(mode)));
            }
        }

        // Run primary cloud search, raw query fallback, and Steam Store popularity search CONCURRENTLY!
        let need_raw = !clean_q.is_empty() && expanded_q != clean_q;
        let raw_path = if need_raw {
            Some(format!(
                "/api/v1/games/search?q={}&offset={offset}",
                urlencoding_light(clean_q)
            ))
        } else {
            None
        };

        let (primary_res, raw_res, steam_games) = tokio::join!(
            self.get_json::<Vec<HubGame>>(&path),
            async {
                if let Some(ref rp) = raw_path {
                    self.get_json::<Vec<HubGame>>(rp).await.ok()
                } else {
                    None
                }
            },
            async {
                if !clean_q.is_empty() && offset == 0 {
                    tokio::time::timeout(
                        Duration::from_millis(2000),
                        search_steam_store_fallback(&self.http, &expanded_q),
                    )
                    .await
                    .unwrap_or_default()
                } else {
                    Vec::new()
                }
            }
        );

        let mut combined: Vec<HubGame> = Vec::new();
        let mut seen = HashSet::new();

        if let Ok(games) = &primary_res {
            for g in games {
                if seen.insert(g.igdb_id) {
                    combined.push(g.clone());
                }
            }
        }

        if let Some(more) = raw_res {
            if combined.len() < 12 {
                for g in more {
                    if seen.insert(g.igdb_id) {
                        combined.push(g);
                    }
                }
            }
        }

        // Actively enrich candidate pool when special edition/category filters are active using tokio::join!
        let cat_filter = filters.game_category.as_deref().unwrap_or("");
        if cat_filter == "remake" && !clean_q.is_empty() {
            let q_enc = urlencoding_light(&expanded_q);
            let p1 = format!("/api/v1/games/search?q={q_enc}%20Remake&offset=0");
            let p2 = format!("/api/v1/games/search?q={q_enc}%20Remastered&offset=0");
            let p3 = format!("/api/v1/games/search?q={q_enc}%20Definitive&offset=0");
            let (r1, r2, r3) = tokio::join!(
                self.get_json::<Vec<HubGame>>(&p1),
                self.get_json::<Vec<HubGame>>(&p2),
                self.get_json::<Vec<HubGame>>(&p3)
            );
            for res in [r1, r2, r3].into_iter().flatten() {
                for g in res {
                    if seen.insert(g.igdb_id) {
                        combined.push(g);
                    }
                }
            }
        } else if cat_filter == "expansion" && !clean_q.is_empty() {
            let q_enc = urlencoding_light(&expanded_q);
            let p1 = format!("/api/v1/games/search?q={q_enc}%20Expansion&offset=0");
            let p2 = format!("/api/v1/games/search?q={q_enc}%20Edition&offset=0");
            let (r1, r2) = tokio::join!(
                self.get_json::<Vec<HubGame>>(&p1),
                self.get_json::<Vec<HubGame>>(&p2)
            );
            for res in [r1, r2].into_iter().flatten() {
                for g in res {
                    if seen.insert(g.igdb_id) {
                        combined.push(g);
                    }
                }
            }
        }

        for g in steam_games {
            if seen.insert(g.igdb_id) {
                combined.push(g);
            }
        }

        // Post-filter to see how many valid matches we actually have after strict filter enforcement
        let filtered_now = apply_hub_filters_and_sort(combined.clone(), clean_q, filters);

        // If filter-only browsing (clean_q is empty) returned too few results, synthesize a rich catalog pool from the cloud feeds!
        if clean_q.is_empty() && filtered_now.len() < 16 {
            let genres_csv = if !genre_ids.is_empty() {
                Some(
                    genre_ids
                        .iter()
                        .map(|id| id.to_string())
                        .collect::<Vec<_>>()
                        .join(","),
                )
            } else {
                None
            };

            let g1_str = genre_ids.first().map(|id| id.to_string());
            let g2_str = genre_ids.get(1).map(|id| id.to_string());
            let (f_rec, f_top, f_new, f_soon, f_g1, f_g2) = tokio::join!(
                self.fetch_feed_with_genres("recommended", offset, genres_csv.as_deref()),
                self.fetch_feed("top_rated", offset),
                self.fetch_feed("new_releases", offset),
                self.fetch_feed("coming_soon", offset),
                async {
                    if let Some(ref g1) = g1_str {
                        self.fetch_feed_with_genres("recommended", offset, Some(g1)).await
                    } else {
                        Ok(Vec::new())
                    }
                },
                async {
                    if let Some(ref g2) = g2_str {
                        self.fetch_feed_with_genres("recommended", offset, Some(g2)).await
                    } else {
                        Ok(Vec::new())
                    }
                }
            );

            for feed_res in [f_rec, f_top, f_new, f_soon, f_g1, f_g2] {
                if let Ok(list) = feed_res {
                    for g in list {
                        if seen.insert(g.igdb_id) {
                            combined.push(g);
                        }
                    }
                }
            }
        }

        let result_list = apply_hub_filters_and_sort(combined, clean_q, filters);
        if !result_list.is_empty() {
            Ok(result_list)
        } else {
            primary_res.map(|g| apply_hub_filters_and_sort(g, clean_q, filters))
        }
    }

    async fn get_game_details(&self, igdb_id: i64) -> AppResult<Option<HubGameDetails>> {
        let path = format!("/api/v1/games/details/{igdb_id}");
        match self.get_json(&path).await {
            Ok(details) => Ok(Some(details)),
            Err(err) => {
                let msg = err.to_string();
                if msg.contains("404") || msg.to_lowercase().contains("not found") {
                    Ok(None)
                } else {
                    Err(err)
                }
            }
        }
    }

    async fn get_similar_games(&self, igdb_id: i64) -> AppResult<Vec<HubGame>> {
        let path = format!("/api/v1/games/similar/{igdb_id}");
        self.get_json(&path).await
    }

    async fn list_genres(&self) -> AppResult<Vec<NameIdItem>> {
        match self.get_json::<Vec<NameIdItem>>("/api/v1/games/genres").await {
            Ok(items) if !items.is_empty() => Ok(items),
            _ => Ok(hub::default_hub_genres()),
        }
    }

    async fn list_platforms(&self) -> AppResult<Vec<NameIdItem>> {
        match self.get_json::<Vec<NameIdItem>>("/api/v1/games/platforms").await {
            Ok(items) if !items.is_empty() => Ok(items),
            _ => Ok(hub::default_hub_platforms()),
        }
    }
}

impl ArtworkProvider for NexusCloudProvider {
    fn provider_name(&self) -> &'static str {
        "nexus_cloud"
    }

    async fn get_artwork_options(
        &self,
        kind: &str,
        steam_app_id: Option<&str>,
        name: &str,
    ) -> AppResult<Vec<UnifiedArtwork>> {
        let encoded_name = urlencoding_light(name);
        let mut path = format!("/api/v1/artwork/options/{kind}?name={encoded_name}");
        if let Some(app_id) = steam_app_id {
            path.push_str(&format!("&app_id={app_id}"));
        }
        self.get_json(&path).await
    }
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
