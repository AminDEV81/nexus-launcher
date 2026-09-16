use super::models::UnifiedArtwork;
use super::traits::ArtworkProvider;
use crate::commands::metadata::steamgriddb;
use crate::error::AppResult;

pub struct DirectSteamGridDbProvider {
    http: reqwest::Client,
    api_key: String,
}

impl DirectSteamGridDbProvider {
    pub fn new(http: reqwest::Client, api_key: String) -> Self {
        Self { http, api_key }
    }
}

impl ArtworkProvider for DirectSteamGridDbProvider {
    fn provider_name(&self) -> &'static str {
        "direct_steamgriddb"
    }

    async fn get_artwork_options(
        &self,
        kind: &str,
        steam_app_id: Option<&str>,
        name: &str,
    ) -> AppResult<Vec<UnifiedArtwork>> {
        let sgdb_game_id = if steam_app_id.is_none() && !name.is_empty() {
            steamgriddb::search_game_id(&self.http, &self.api_key, name)
                .await
                .ok()
                .flatten()
        } else {
            None
        };

        let grid_options = match kind {
            "cover" => {
                steamgriddb::search_grid_options(
                    &self.http,
                    &self.api_key,
                    steam_app_id,
                    sgdb_game_id,
                )
                .await?
            }
            "hero" => {
                steamgriddb::search_hero_options(
                    &self.http,
                    &self.api_key,
                    steam_app_id,
                    sgdb_game_id,
                )
                .await?
            }
            "logo" => {
                steamgriddb::search_logo_options(
                    &self.http,
                    &self.api_key,
                    steam_app_id,
                    sgdb_game_id,
                )
                .await?
            }
            _ => Vec::new(),
        };

        let unified = grid_options
            .into_iter()
            .map(|opt| UnifiedArtwork {
                id: opt.id.to_string(),
                url: opt.url,
                thumbnail_url: opt.thumbnail_url,
                mime: opt.mime,
                is_animated: opt.is_animated,
                width: opt.width,
                height: opt.height,
                provider: "steamgrid".into(),
                artwork_type: kind.to_string(),
            })
            .collect();

        Ok(unified)
    }
}
