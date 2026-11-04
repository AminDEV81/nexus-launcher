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
        // Always resolve SteamGridDB game IDs by name EVEN when steam_app_id is present!
        // For newly released games or games with multiple editions, community artists
        // frequently upload covers to the SteamGridDB game entry (`/game/{id}`) before or
        // instead of the Steam App ID endpoint (`/steam/{app_id}`).
        let sgdb_game_ids = if !name.trim().is_empty() {
            steamgriddb::search_game_ids(&self.http, &self.api_key, name)
                .await
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let segment = match kind {
            "cover" => "grids",
            "hero" => "heroes",
            "logo" => "logos",
            _ => return Ok(Vec::new()),
        };

        let grid_options = steamgriddb::search_asset_options_multi(
            &self.http,
            &self.api_key,
            segment,
            steam_app_id,
            &sgdb_game_ids,
        )
        .await?;

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
