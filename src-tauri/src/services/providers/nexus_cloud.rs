use super::models::{HubGameDetails, NameIdItem, UnifiedArtwork};
use super::traits::{ArtworkProvider, MetadataProvider};
use crate::commands::hub::HubGame;
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
        genre_id: Option<i64>,
        platform_id: Option<i64>,
    ) -> AppResult<Vec<HubGame>> {
        let encoded_q = urlencoding_light(query);
        let mut path = format!("/api/v1/games/search?q={encoded_q}&offset={offset}");
        if let Some(gid) = genre_id {
            path.push_str(&format!("&genre={gid}"));
        }
        if let Some(pid) = platform_id {
            path.push_str(&format!("&platform={pid}"));
        }
        self.get_json(&path).await
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

