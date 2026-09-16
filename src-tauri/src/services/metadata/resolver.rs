use crate::commands::hub::HubGame;
use crate::commands::metadata::IgdbTokenCache;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::services::cache::MetadataCache;
use crate::services::providers::{
    nexus_cloud, ArtworkProvider, DirectIgdbProvider, DirectSteamGridDbProvider, HubGameDetails,
    MetadataProvider, NameIdItem, NexusCloudProvider, SteamArtworkProvider, UnifiedArtwork,
};
use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};

pub struct CircuitBreaker {
    consecutive_failures: AtomicU32,
    last_failure_time: AtomicI64,
}

impl Default for CircuitBreaker {
    fn default() -> Self {
        Self {
            consecutive_failures: AtomicU32::new(0),
            last_failure_time: AtomicI64::new(0),
        }
    }
}

impl CircuitBreaker {
    const FAILURE_THRESHOLD: u32 = 3;
    const COOLDOWN_SECONDS: i64 = 60;

    pub fn is_open(&self) -> bool {
        let failures = self.consecutive_failures.load(Ordering::Relaxed);
        if failures < Self::FAILURE_THRESHOLD {
            return false;
        }

        let now = chrono::Utc::now().timestamp();
        let last = self.last_failure_time.load(Ordering::Relaxed);
        now - last < Self::COOLDOWN_SECONDS
    }

    pub fn record_success(&self) {
        self.consecutive_failures.store(0, Ordering::Relaxed);
    }

    pub fn record_failure(&self) {
        self.consecutive_failures.fetch_add(1, Ordering::Relaxed);
        self.last_failure_time
            .store(chrono::Utc::now().timestamp(), Ordering::Relaxed);
    }
}

pub struct MetadataProviderResolver {
    http: reqwest::Client,
    token_cache: IgdbTokenCache,
    circuit_breaker: CircuitBreaker,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderMode {
    Public,
    Custom,
}

pub struct ResolvedConfig {
    pub mode: ProviderMode,
    pub public_proxy_url: Option<String>,
    pub igdb_client_id: Option<String>,
    pub igdb_client_secret: Option<String>,
    pub steamgriddb_api_key: Option<String>,
}

impl MetadataProviderResolver {
    pub fn new(http: reqwest::Client, token_cache: IgdbTokenCache) -> Self {
        Self {
            http,
            token_cache,
            circuit_breaker: CircuitBreaker::default(),
        }
    }

    pub fn get_config(&self, db: &Database) -> ResolvedConfig {
        let conn = db.connection.lock().expect("db mutex poisoned");
        let read = |key: &str| -> Option<String> {
            conn.query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get::<_, String>(0)
            })
            .ok()
            .and_then(|v| (!v.trim().is_empty()).then_some(v.trim().to_string()))
        };

        let mode_str = read("metadata_provider_mode").unwrap_or_else(|| "public".to_string());
        let mode = if mode_str.eq_ignore_ascii_case("custom") {
            ProviderMode::Custom
        } else {
            ProviderMode::Public
        };

        ResolvedConfig {
            mode,
            public_proxy_url: Some(nexus_cloud::DEFAULT_GATEWAY_URL.to_string()),
            igdb_client_id: read("igdb_client_id"),
            igdb_client_secret: read("igdb_client_secret"),
            steamgriddb_api_key: read("steamgriddb_api_key"),
        }
    }

    // -----------------------------------------------------------------
    // Metadata Operations (Feed, Search, Details, Genres, Platforms)
    // -----------------------------------------------------------------

    pub async fn fetch_feed(
        &self,
        db: &Database,
        feed: &str,
        offset: i64,
    ) -> AppResult<Vec<HubGame>> {
        let config = self.get_config(db);
        let mode_str = match config.mode {
            ProviderMode::Public => "public",
            ProviderMode::Custom => "custom",
        };
        let cache_key = format!("feed:v4:{mode_str}:{feed}:{offset}");

        // Check local cache first (Layer 1)
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        return Ok(games);
                    }
                }
            }
        }
        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.fetch_feed(feed, offset).await
            }
            ProviderMode::Custom => {
                let (Some(cid), Some(sec)) = (config.igdb_client_id, config.igdb_client_secret)
                else {
                    return Err(AppError::Invalid(
                        "IGDB Client ID and Secret are missing in Settings.".into(),
                    ));
                };
                let direct = DirectIgdbProvider::new(
                    self.http.clone(),
                    self.token_cache.clone(),
                    cid,
                    sec,
                );
                direct.fetch_feed(feed, offset).await
            }
        };

        match result {
            Ok(games) => {
                self.circuit_breaker.record_success();
                if let Ok(json) = serde_json::to_string(&games) {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    let ttl = match feed {
                        "new_releases" => 3600,
                        "coming_soon" => 3 * 3600,
                        _ => 6 * 3600,
                    };
                    let _ = MetadataCache::set(&conn, &cache_key, "feed", &json, ttl);
                }
                Ok(games)
            }
            Err(err) => {
                self.circuit_breaker.record_failure();
                // Graceful fallback to stale local cache if available!
                let conn = db.connection.lock().expect("db mutex poisoned");
                if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                    if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        return Ok(games);
                    }
                }
                Err(err)
            }
        }
    }

    pub async fn search_games(
        &self,
        db: &Database,
        query: &str,
        offset: i64,
        genre_id: Option<i64>,
        platform_id: Option<i64>,
    ) -> AppResult<Vec<HubGame>> {
        let config = self.get_config(db);
        let mode_str = match config.mode {
            ProviderMode::Public => "public",
            ProviderMode::Custom => "custom",
        };
        let clean_q = query.trim().to_lowercase();
        let cache_key = format!(
            "search:v4:{mode_str}:{clean_q}:{offset}:{}:{}",
            genre_id.unwrap_or(0),
            platform_id.unwrap_or(0)
        );

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        return Ok(games);
                    }
                }
            }
        }
        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud
                    .search_games(query, offset, genre_id, platform_id)
                    .await
            }
            ProviderMode::Custom => {
                let (Some(cid), Some(sec)) = (config.igdb_client_id, config.igdb_client_secret)
                else {
                    return Err(AppError::Invalid(
                        "IGDB Client ID and Secret are missing in Settings.".into(),
                    ));
                };
                let direct = DirectIgdbProvider::new(
                    self.http.clone(),
                    self.token_cache.clone(),
                    cid,
                    sec,
                );
                direct
                    .search_games(query, offset, genre_id, platform_id)
                    .await
            }
        };

        match result {
            Ok(games) => {
                if let Ok(json) = serde_json::to_string(&games) {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    let _ = MetadataCache::set(&conn, &cache_key, "search", &json, 4 * 3600);
                }
                Ok(games)
            }
            Err(err) => {
                let conn = db.connection.lock().expect("db mutex poisoned");
                if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                    if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        return Ok(games);
                    }
                }
                Err(err)
            }
        }
    }

    pub async fn get_game_details(
        &self,
        db: &Database,
        igdb_id: i64,
    ) -> AppResult<Option<HubGameDetails>> {
        let cache_key = format!("details:{igdb_id}");

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(details) = serde_json::from_str::<HubGameDetails>(&payload) {
                        return Ok(Some(details));
                    }
                }
            }
        }

        let config = self.get_config(db);
        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.get_game_details(igdb_id).await
            }
            ProviderMode::Custom => {
                let (Some(cid), Some(sec)) = (config.igdb_client_id, config.igdb_client_secret)
                else {
                    return Err(AppError::Invalid(
                        "IGDB Client ID and Secret are missing in Settings.".into(),
                    ));
                };
                let direct = DirectIgdbProvider::new(
                    self.http.clone(),
                    self.token_cache.clone(),
                    cid,
                    sec,
                );
                direct.get_game_details(igdb_id).await
            }
        };

        if let Ok(Some(ref details)) = result {
            if let Ok(json) = serde_json::to_string(details) {
                let conn = db.connection.lock().expect("db mutex poisoned");
                let _ = MetadataCache::set(&conn, &cache_key, "details", &json, 3 * 86_400);
            }
        }

        result
    }

    pub async fn get_similar_games(
        &self,
        db: &Database,
        igdb_id: i64,
    ) -> AppResult<Vec<HubGame>> {
        let cache_key = format!("similar:v4:{igdb_id}");

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        return Ok(games);
                    }
                }
            }
        }

        let config = self.get_config(db);
        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.get_similar_games(igdb_id).await
            }
            ProviderMode::Custom => {
                let (Some(cid), Some(sec)) = (config.igdb_client_id, config.igdb_client_secret)
                else {
                    return Err(AppError::Invalid(
                        "IGDB Client ID and Secret are missing in Settings.".into(),
                    ));
                };
                let direct = DirectIgdbProvider::new(
                    self.http.clone(),
                    self.token_cache.clone(),
                    cid,
                    sec,
                );
                direct.get_similar_games(igdb_id).await
            }
        };

        if let Ok(ref games) = result {
            if let Ok(json) = serde_json::to_string(games) {
                let conn = db.connection.lock().expect("db mutex poisoned");
                let _ = MetadataCache::set(&conn, &cache_key, "similar", &json, 86_400);
            }
        }

        result
    }

    pub async fn list_genres(&self, db: &Database) -> AppResult<Vec<NameIdItem>> {
        let cache_key = "genres:list";
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, cache_key) {
                if !is_stale {
                    if let Ok(items) = serde_json::from_str::<Vec<NameIdItem>>(&payload) {
                        return Ok(items);
                    }
                }
            }
        }

        let config = self.get_config(db);
        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.list_genres().await
            }
            ProviderMode::Custom => {
                let (Some(cid), Some(sec)) = (config.igdb_client_id, config.igdb_client_secret)
                else {
                    return Err(AppError::Invalid(
                        "IGDB Client ID and Secret are missing in Settings.".into(),
                    ));
                };
                let direct = DirectIgdbProvider::new(
                    self.http.clone(),
                    self.token_cache.clone(),
                    cid,
                    sec,
                );
                direct.list_genres().await
            }
        };

        if let Ok(ref items) = result {
            if let Ok(json) = serde_json::to_string(items) {
                let conn = db.connection.lock().expect("db mutex poisoned");
                let _ = MetadataCache::set(&conn, cache_key, "genres", &json, 7 * 86_400);
            }
        }

        result
    }

    pub async fn list_platforms(&self, db: &Database) -> AppResult<Vec<NameIdItem>> {
        let cache_key = "platforms:list";
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, cache_key) {
                if !is_stale {
                    if let Ok(items) = serde_json::from_str::<Vec<NameIdItem>>(&payload) {
                        return Ok(items);
                    }
                }
            }
        }

        let config = self.get_config(db);
        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.list_platforms().await
            }
            ProviderMode::Custom => {
                let (Some(cid), Some(sec)) = (config.igdb_client_id, config.igdb_client_secret)
                else {
                    return Err(AppError::Invalid(
                        "IGDB Client ID and Secret are missing in Settings.".into(),
                    ));
                };
                let direct = DirectIgdbProvider::new(
                    self.http.clone(),
                    self.token_cache.clone(),
                    cid,
                    sec,
                );
                direct.list_platforms().await
            }
        };

        if let Ok(ref items) = result {
            if let Ok(json) = serde_json::to_string(items) {
                let conn = db.connection.lock().expect("db mutex poisoned");
                let _ = MetadataCache::set(&conn, cache_key, "platforms", &json, 7 * 86_400);
            }
        }

        result
    }

    // -----------------------------------------------------------------
    // Artwork Operations (Multi-provider aggregation: Steam + SteamGrid)
    // -----------------------------------------------------------------

    pub async fn get_artwork_options(
        &self,
        db: &Database,
        kind: &str, // "cover", "hero", "logo"
        steam_app_id: Option<&str>,
        name: &str,
    ) -> AppResult<Vec<UnifiedArtwork>> {
        let config = self.get_config(db);
        let steam_provider = SteamArtworkProvider::new(self.http.clone());

        // Always get Steam official artwork (guaranteed high quality & fast)
        let steam_assets = steam_provider
            .get_artwork_options(kind, steam_app_id, name)
            .await
            .unwrap_or_default();

        // Query SteamGridDB (via Cloud Gateway in Public mode or direct in Custom mode)
        let mut sgdb_assets = Vec::new();
        match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                if let Ok(assets) = cloud.get_artwork_options(kind, steam_app_id, name).await {
                    sgdb_assets = assets;
                }
            }
            ProviderMode::Custom => {
                if let Some(key) = config.steamgriddb_api_key {
                    let direct = DirectSteamGridDbProvider::new(self.http.clone(), key);
                    if let Ok(assets) = direct.get_artwork_options(kind, steam_app_id, name).await {
                        sgdb_assets = assets;
                    }
                }
            }
        }

        // Merge & deduplicate by URL
        let mut combined = Vec::new();
        let mut seen_urls = std::collections::HashSet::new();

        // Prioritize official Steam artwork first
        for asset in steam_assets {
            if seen_urls.insert(asset.url.clone()) {
                combined.push(asset);
            }
        }

        for asset in sgdb_assets {
            if seen_urls.insert(asset.url.clone()) {
                combined.push(asset);
            }
        }

        Ok(combined)
    }
}
