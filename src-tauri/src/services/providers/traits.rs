use super::models::{HubGameDetails, NameIdItem, UnifiedArtwork};
use crate::commands::hub::HubGame;
use crate::error::AppResult;

pub trait MetadataProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;

    fn fetch_feed(
        &self,
        feed: &str,
        offset: i64,
    ) -> impl std::future::Future<Output = AppResult<Vec<HubGame>>> + Send;

    fn search_games(
        &self,
        query: &str,
        offset: i64,
        genre_id: Option<i64>,
        platform_id: Option<i64>,
    ) -> impl std::future::Future<Output = AppResult<Vec<HubGame>>> + Send;

    fn get_game_details(
        &self,
        igdb_id: i64,
    ) -> impl std::future::Future<Output = AppResult<Option<HubGameDetails>>> + Send;

    fn get_similar_games(
        &self,
        igdb_id: i64,
    ) -> impl std::future::Future<Output = AppResult<Vec<HubGame>>> + Send;

    fn list_genres(&self) -> impl std::future::Future<Output = AppResult<Vec<NameIdItem>>> + Send;

    fn list_platforms(&self) -> impl std::future::Future<Output = AppResult<Vec<NameIdItem>>> + Send;
}

pub trait ArtworkProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;

    fn get_artwork_options(
        &self,
        kind: &str, // "cover", "hero", "logo"
        steam_app_id: Option<&str>,
        name: &str,
    ) -> impl std::future::Future<Output = AppResult<Vec<UnifiedArtwork>>> + Send;
}
