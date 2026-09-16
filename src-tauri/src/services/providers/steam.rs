use super::models::UnifiedArtwork;
use super::traits::ArtworkProvider;
use crate::error::AppResult;
use serde_json::Value;

pub struct SteamArtworkProvider {
    http: reqwest::Client,
}

impl SteamArtworkProvider {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }

    pub async fn resolve_app_id(&self, name: &str) -> Option<String> {
        let url = "https://store.steampowered.com/api/storesearch";
        let res = self
            .http
            .get(url)
            .query(&[("term", name), ("l", "english"), ("cc", "US")])
            .send()
            .await
            .ok()?;

        let json: Value = res.json().await.ok()?;
        let items = json.get("items").and_then(Value::as_array)?;
        let first = items.first()?;
        first.get("id").and_then(|id| id.as_i64()).map(|id| id.to_string())
    }
}

impl ArtworkProvider for SteamArtworkProvider {
    fn provider_name(&self) -> &'static str {
        "steam"
    }

    async fn get_artwork_options(
        &self,
        kind: &str,
        steam_app_id: Option<&str>,
        name: &str,
    ) -> AppResult<Vec<UnifiedArtwork>> {
        let app_id_owned = match steam_app_id {
            Some(id) if !id.is_empty() => Some(id.to_string()),
            _ => self.resolve_app_id(name).await,
        };

        let Some(app_id) = app_id_owned else {
            return Ok(Vec::new());
        };

        let cdn_base = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps";
        let mut results = Vec::new();

        match kind {
            "cover" => {
                // 1. Vertical 600x900 Box Art
                let cover_url = format!("{cdn_base}/{app_id}/library_600x900_2x.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-cover-600x900"),
                    url: cover_url.clone(),
                    thumbnail_url: cover_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 600,
                    height: 900,
                    provider: "steam".into(),
                    artwork_type: "cover".into(),
                });

                // 2. Horizontal Header Capsule
                let header_url = format!("{cdn_base}/{app_id}/header.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-header"),
                    url: header_url.clone(),
                    thumbnail_url: header_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 460,
                    height: 215,
                    provider: "steam".into(),
                    artwork_type: "cover".into(),
                });
            }
            "hero" => {
                // Library Hero banner (1920x620)
                let hero_url = format!("{cdn_base}/{app_id}/library_hero.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-hero"),
                    url: hero_url.clone(),
                    thumbnail_url: hero_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 1920,
                    height: 620,
                    provider: "steam".into(),
                    artwork_type: "hero".into(),
                });
            }
            "logo" => {
                // Transparent PNG logo
                let logo_url = format!("{cdn_base}/{app_id}/logo.png");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-logo"),
                    url: logo_url.clone(),
                    thumbnail_url: logo_url,
                    mime: "image/png".into(),
                    is_animated: false,
                    width: 640,
                    height: 360,
                    provider: "steam".into(),
                    artwork_type: "logo".into(),
                });
            }
            _ => {}
        }

        Ok(results)
    }
}
