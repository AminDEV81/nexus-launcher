use super::models::{HubGameDetails, NameIdItem, UnifiedArtwork};
use super::traits::{ArtworkProvider, MetadataProvider};
use crate::commands::hub::{HubGame, HubSearchFilters};
use crate::error::{AppError, AppResult};
use serde::Deserialize;

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
        let encoded_q = urlencoding_light(clean_q);
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
            path.push_str(&format!("&release={rel}"));
        }

        if let Some(mr) = filters.min_rating {
            path.push_str(&format!("&min_rating={mr}"));
        }

        if let Some(s) = &filters.sort {
            path.push_str(&format!("&sort={s}"));
        }

        let res = self.get_json::<Vec<HubGame>>(&path).await;
        match res {
            Ok(games) if !games.is_empty() => Ok(games),
            _ => {
                // Smart fallback for filters when query text is empty
                if clean_q.is_empty() {
                    if effective_release.as_deref() == Some("upcoming") {
                        return self.fetch_feed("coming_soon", offset).await;
                    }
                    if filters.min_rating.unwrap_or(0) >= 80 || filters.sort.as_deref() == Some("rating") {
                        if let Ok(mut top) = self.fetch_feed("top_rated", offset).await {
                            if let Some(min_r) = filters.min_rating {
                                top.retain(|g| g.rating.unwrap_or(0) >= min_r);
                            }
                            return Ok(top);
                        }
                    }
                    if effective_release.as_deref() == Some("new") {
                        return self.fetch_feed("new_releases", offset).await;
                    }
                }
                res
            }
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
        self.get_json("/api/v1/games/genres").await
    }

    async fn list_platforms(&self) -> AppResult<Vec<NameIdItem>> {
        self.get_json("/api/v1/games/platforms").await
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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_live_cloud_artwork_options() {
        let http = reqwest::Client::new();
        let cloud = NexusCloudProvider::new(http, None);
        let res = cloud.get_artwork_options("cover", None, "Cyberpunk 2077").await;
        println!("Result for Cyberpunk: {:?}", res.as_ref().map(|v| v.len()));
        assert!(res.is_ok());
        let artworks = res.unwrap();
        assert!(artworks.len() > 10, "Expected >10 artworks, got {}", artworks.len());

        let res2 = cloud.get_artwork_options("cover", None, "Replaced").await;
        println!("Result for Replaced covers: {:?}", res2.as_ref().map(|v| v.len()));
        assert!(res2.is_ok());
        let artworks2 = res2.unwrap();
        assert!(artworks2.len() > 10, "Expected >10 artworks, got {}", artworks2.len());

        let res_hero = cloud.get_artwork_options("hero", None, "Cyberpunk 2077").await;
        println!("Result for Cyberpunk heroes: {:?}", res_hero.as_ref().map(|v| v.len()));
        assert!(res_hero.is_ok());
        assert!(res_hero.unwrap().len() > 10);

        let res_logo = cloud.get_artwork_options("logo", None, "Cyberpunk 2077").await;
        println!("Result for Cyberpunk logos: {:?}", res_logo.as_ref().map(|v| v.len()));
        assert!(res_logo.is_ok());
        assert!(res_logo.unwrap().len() > 10);
    }
}

