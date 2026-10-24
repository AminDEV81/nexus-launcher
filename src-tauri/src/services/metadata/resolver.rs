use crate::commands::hub::HubGame;
use crate::commands::metadata::IgdbTokenCache;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use crate::services::cache::MetadataCache;
use crate::services::providers::{
    nexus_cloud, ArtworkProvider, DirectIgdbProvider, DirectSteamGridDbProvider, HubGameDetails,
    MetadataProvider, NameIdItem, NexusCloudProvider, SteamArtworkProvider, UnifiedArtwork,
};
use crate::services::scores;
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
    const FAILURE_THRESHOLD: u32 = 2;
    const COOLDOWN_SECONDS: i64 = 30;

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

    pub fn trip_immediately(&self) {
        self.consecutive_failures
            .store(Self::FAILURE_THRESHOLD, Ordering::Relaxed);
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
        self.fetch_feed_with_genres(db, feed, offset, None).await
    }

    pub async fn fetch_feed_with_genres(
        &self,
        db: &Database,
        feed: &str,
        offset: i64,
        genres_csv: Option<&str>,
    ) -> AppResult<Vec<HubGame>> {
        let config = self.get_config(db);
        let mode_str = match config.mode {
            ProviderMode::Public => "public",
            ProviderMode::Custom => "custom",
        };
        let genre_suffix = genres_csv.filter(|s| !s.is_empty()).unwrap_or("all");
        let cache_key = format!("feed:v8:{mode_str}:{feed}:{offset}:{genre_suffix}");

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        scores::enrich_hub_games_batch(Some(&conn), &mut games);
                        return Ok(games);
                    }
                }
            }
        }
        if self.circuit_breaker.is_open() {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                    scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    return Ok(games);
                }
            }
            return Err(AppError::Other(
                "Network connection offline. Serving cached data.".into(),
            ));
        }

        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.fetch_feed_with_genres(feed, offset, genres_csv).await
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
            Ok(mut games) => {
                self.circuit_breaker.record_success();
                {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    if let Ok(json) = serde_json::to_string(&games) {
                        let _ = feed;
                        let ttl = 12 * 3600; // 12-hour cache window
                        let _ = MetadataCache::set(&conn, &cache_key, "feed", &json, ttl);
                    }
                }
                Ok(games)
            }
            Err(err) => {
                let err_str = err.to_string();
                if err_str.contains("disconnect")
                    || err_str.contains("unreachable")
                    || err_str.contains("timed out")
                    || err_str.contains("Network")
                {
                    self.circuit_breaker.trip_immediately();
                } else {
                    self.circuit_breaker.record_failure();
                }
                let conn = db.connection.lock().expect("db mutex poisoned");
                if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                    if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        scores::enrich_hub_games_batch(Some(&conn), &mut games);
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
        filters: &crate::commands::hub::HubSearchFilters,
    ) -> AppResult<Vec<HubGame>> {
        let config = self.get_config(db);
        let mode_str = match config.mode {
            ProviderMode::Public => "public",
            ProviderMode::Custom => "custom",
        };
        let clean_q = query.trim().to_lowercase();
        let g_str = filters
            .genre_ids
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let p_str = filters
            .platform_ids
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .map(|id| id.to_string())
            .collect::<Vec<_>>()
            .join(",");
        let rel_str = filters.release.as_deref().unwrap_or("");
        let yf_str = filters.year_from.map(|y| y.to_string()).unwrap_or_default();
        let yt_str = filters.year_to.map(|y| y.to_string()).unwrap_or_default();
        let rating_str = filters
            .min_rating
            .map(|r| r.to_string())
            .unwrap_or_default();
        let sort_str = filters.sort.as_deref().unwrap_or("");
        let cat_str = filters.game_category.as_deref().unwrap_or("");
        let mode_filter_str = filters.game_mode.as_deref().unwrap_or("");
        let rel_only_str = if filters.only_released.unwrap_or(false) { "1" } else { "0" };
        let on_sale_str = if filters.on_sale.unwrap_or(false) { "1" } else { "0" };

        if filters.on_sale.unwrap_or(false) && offset == 0 {
            let discounted = crate::commands::hub::fetch_popular_discounted_hub_games(db, &self.http).await;
            return Ok(crate::commands::hub::apply_hub_filters_and_sort(discounted, query, filters));
        }

        let cache_key = format!(
            "search:v19:{mode_str}:{clean_q}:{offset}:{g_str}:{p_str}:{rel_str}:{yf_str}:{yt_str}:{rating_str}:{sort_str}:{cat_str}:{mode_filter_str}:{rel_only_str}:{on_sale_str}"
        );

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        if !games.is_empty() {
                            scores::enrich_hub_games_batch(Some(&conn), &mut games);
                            return Ok(games);
                        }
                    }
                }
            }
        }

        if self.circuit_breaker.is_open() {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                    scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    return Ok(games);
                }
            }
            return Err(AppError::Other(
                "Network connection offline. Serving cached data.".into(),
            ));
        }

        let result = match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                cloud.search_games(query, offset, filters).await
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
                direct.search_games(query, offset, filters).await
            }
        };

        match result {
            Ok(mut games) => {
                self.circuit_breaker.record_success();
                {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    if !games.is_empty() {
                        if let Ok(json) = serde_json::to_string(&games) {
                            let _ =
                                MetadataCache::set(&conn, &cache_key, "search", &json, 4 * 3600);
                        }
                    }
                }
                Ok(games)
            }
            Err(err) => {
                let err_str = err.to_string();
                if err_str.contains("disconnect")
                    || err_str.contains("unreachable")
                    || err_str.contains("timed out")
                    || err_str.contains("Network")
                {
                    self.circuit_breaker.trip_immediately();
                } else {
                    self.circuit_breaker.record_failure();
                }
                let conn = db.connection.lock().expect("db mutex poisoned");
                if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                    if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        scores::enrich_hub_games_batch(Some(&conn), &mut games);
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
        self.get_game_details_with_hint(db, igdb_id, None).await
    }

    pub async fn get_game_details_with_hint(
        &self,
        db: &Database,
        igdb_id: i64,
        expected_name: Option<&str>,
    ) -> AppResult<Option<HubGameDetails>> {
        // Resolve the expected game identity from hint, curated catalog, or feed cache
        let known_game = crate::commands::hub::find_curated_hub_game(igdb_id, expected_name)
            .or_else(|| crate::commands::hub::find_cached_feed_hub_game(db, igdb_id));

        let effective_expected_name: Option<String> = expected_name
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string)
            .or_else(|| known_game.as_ref().map(|g| g.name.clone()));

        let norm_hint = effective_expected_name
            .as_deref()
            .map(crate::commands::hub::normalize_title_for_identity)
            .unwrap_or_default();

        let cache_key = format!("details:v10:{igdb_id}:{norm_hint}");

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(mut details) = serde_json::from_str::<HubGameDetails>(&payload) {
                        let matches_hint = effective_expected_name
                            .as_deref()
                            .map(|exp| crate::commands::hub::hub_titles_match(&details.game.name, exp))
                            .unwrap_or(true);
                        if matches_hint {
                            scores::enrich_hub_game_scores(Some(&conn), &mut details.game);
                            if details.metacritic_score.is_none() {
                                details.metacritic_score = details.game.metacritic_score;
                            }
                            if details.opencritic_score.is_none() {
                                details.opencritic_score = details.game.opencritic_score;
                            }
                            return Ok(Some(details));
                        }
                    }
                }
            }
        }

        let config = self.get_config(db);

        // If igdb_id >= 1_000_000_000, it is a synthetic Steam App ID (1_000_000_000 + steam_app_id)
        let result = if igdb_id >= 1_000_000_000 {
            Ok(None)
        } else {
            match config.mode {
                ProviderMode::Public => {
                    let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url.clone());
                    cloud.get_game_details(igdb_id).await
                }
                ProviderMode::Custom => {
                    if let (Some(cid), Some(sec)) = (config.igdb_client_id.clone(), config.igdb_client_secret.clone()) {
                        let direct = DirectIgdbProvider::new(
                            self.http.clone(),
                            self.token_cache.clone(),
                            cid,
                            sec,
                        );
                        direct.get_game_details(igdb_id).await
                    } else {
                        Ok(None)
                    }
                }
            }
        };

        // Verify that the returned IGDB game actually matches the expected game name!
        // If IGDB returned a different game (due to curated/synthetic ID collision), reject it and resolve by title/curated entry.
        let verified_primary = match result {
            Ok(Some(d)) => {
                let is_valid_match = match effective_expected_name.as_deref() {
                    Some(exp) => crate::commands::hub::hub_titles_match(&d.game.name, exp),
                    None => true,
                };
                if is_valid_match {
                    Some(d)
                } else {
                    None
                }
            }
            _ => None,
        };

        let resolved_result: AppResult<Option<HubGameDetails>> = if let Some(d) = verified_primary {
            Ok(Some(d))
        } else if let Some(curated_game) = known_game {
            let aid = curated_game.steam_app_id.clone();
            Ok(Some(HubGameDetails {
                game: HubGame {
                    igdb_id,
                    ..curated_game
                },
                developer: None,
                publisher: None,
                trailer_url: None,
                videos: Vec::new(),
                screenshot_urls: Vec::new(),
                metacritic_score: None,
                opencritic_score: None,
                steam_app_id: aid,
                system_requirements: None,
                download_size: None,
            }))
        } else {
            let steam_aid = if igdb_id >= 1_000_000_000 {
                (igdb_id - 1_000_000_000).to_string()
            } else {
                igdb_id.to_string()
            };
            if let Ok(Some(steam)) =
                crate::commands::metadata::steam_store::get_app_details(&self.http, &steam_aid).await
            {
                Ok(Some(HubGameDetails {
                    game: HubGame {
                        igdb_id,
                        name: steam.name.unwrap_or_else(|| format!("Steam Game #{steam_aid}")),
                        summary: steam.description,
                        release_date: None,
                        game_type: Some(0),
                        cover_url: Some(format!(
                            "https://cdn.cloudflare.steamstatic.com/steam/apps/{steam_aid}/library_600x900_2x.jpg"
                        )),
                        backdrop_url: steam.screenshot_urls.first().cloned().or_else(|| {
                            Some(format!(
                                "https://cdn.akamai.steamstatic.com/steam/apps/{steam_aid}/header.jpg"
                            ))
                        }),
                        rating: steam.metacritic_score,
                        rating_count: Some(500),
                        metacritic_score: steam.metacritic_score,
                        opencritic_score: None,
                        hypes: None,
                        genres: if steam.genres.is_empty() {
                            vec!["Action".to_string(), "Adventure".to_string()]
                        } else {
                            steam.genres
                        },
                        platforms: vec!["PC (Microsoft Windows)".to_string()],
                        steam_app_id: Some(steam_aid.clone()),
                        discount_percent: None,
                        sale_price_formatted: None,
                        original_price_formatted: None,
                    },
                    developer: steam.developer,
                    publisher: steam.publisher,
                    trailer_url: None,
                    videos: Vec::new(),
                    screenshot_urls: steam.screenshot_urls,
                    metacritic_score: steam.metacritic_score,
                    opencritic_score: None,
                    steam_app_id: Some(steam_aid),
                    system_requirements: steam.system_requirements,
                    download_size: None,
                }))
            } else {
                Ok(None)
            }
        };

        match resolved_result {
            Ok(Some(mut details)) => {
                self.circuit_breaker.record_success();
                let mut score_details = details.clone();
                let (_, _) = tokio::join!(
                    crate::commands::hub::enrich_hub_game_details_live(&self.http, &mut details),
                    scores::enrich_hub_details_scores(db, &self.http, &mut score_details)
                );
                details.metacritic_score =
                    score_details.metacritic_score.or(details.metacritic_score);
                details.opencritic_score =
                    score_details.opencritic_score.or(details.opencritic_score);
                details.game.metacritic_score = score_details
                    .game
                    .metacritic_score
                    .or(details.game.metacritic_score);
                details.game.opencritic_score = score_details
                    .game
                    .opencritic_score
                    .or(details.game.opencritic_score);
                if let Ok(json) = serde_json::to_string(&details) {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    let _ = MetadataCache::set(&conn, &cache_key, "details", &json, 12 * 3600);
                }
                Ok(Some(details))
            }
            Ok(None) => Ok(None),
            Err(err) => Err(err),
        }
    }

    pub async fn get_similar_games(
        &self,
        db: &Database,
        igdb_id: i64,
    ) -> AppResult<Vec<HubGame>> {
        let cache_key = format!("similar:v6:{igdb_id}");

        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, &cache_key) {
                if !is_stale {
                    if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        scores::enrich_hub_games_batch(Some(&conn), &mut games);
                        return Ok(games);
                    }
                }
            }
        }

        if self.circuit_breaker.is_open() {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                    scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    return Ok(games);
                }
            }
            return Err(AppError::Other(
                "Network connection offline. Serving cached data.".into(),
            ));
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

        match result {
            Ok(mut games) => {
                self.circuit_breaker.record_success();
                {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    scores::enrich_hub_games_batch(Some(&conn), &mut games);
                    if let Ok(json) = serde_json::to_string(&games) {
                        let _ = MetadataCache::set(&conn, &cache_key, "similar", &json, 86_400);
                    }
                }
                Ok(games)
            }
            Err(err) => {
                let err_str = err.to_string();
                if err_str.contains("disconnect")
                    || err_str.contains("unreachable")
                    || err_str.contains("timed out")
                    || err_str.contains("Network")
                {
                    self.circuit_breaker.trip_immediately();
                } else {
                    self.circuit_breaker.record_failure();
                }
                let conn = db.connection.lock().expect("db mutex poisoned");
                if let Some((payload, _)) = MetadataCache::get(&conn, &cache_key) {
                    if let Ok(mut games) = serde_json::from_str::<Vec<HubGame>>(&payload) {
                        scores::enrich_hub_games_batch(Some(&conn), &mut games);
                        return Ok(games);
                    }
                }
                Err(err)
            }
        }
    }

    pub async fn list_genres(&self, db: &Database) -> AppResult<Vec<NameIdItem>> {
        let cache_key = "genres:list:v2";
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, cache_key) {
                if !is_stale {
                    if let Ok(items) = serde_json::from_str::<Vec<NameIdItem>>(&payload) {
                        if !items.is_empty() {
                            return Ok(items);
                        }
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
                    return Ok(crate::commands::hub::default_hub_genres());
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

        match result {
            Ok(items) if !items.is_empty() => {
                if let Ok(json) = serde_json::to_string(&items) {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    let _ = MetadataCache::set(&conn, cache_key, "genres", &json, 7 * 86_400);
                }
                Ok(items)
            }
            _ => Ok(crate::commands::hub::default_hub_genres()),
        }
    }

    pub async fn list_platforms(&self, db: &Database) -> AppResult<Vec<NameIdItem>> {
        let cache_key = "platforms:list:v2";
        {
            let conn = db.connection.lock().expect("db mutex poisoned");
            if let Some((payload, is_stale)) = MetadataCache::get(&conn, cache_key) {
                if !is_stale {
                    if let Ok(items) = serde_json::from_str::<Vec<NameIdItem>>(&payload) {
                        if !items.is_empty() {
                            return Ok(items);
                        }
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
                    return Ok(crate::commands::hub::default_hub_platforms());
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

        match result {
            Ok(items) if !items.is_empty() => {
                if let Ok(json) = serde_json::to_string(&items) {
                    let conn = db.connection.lock().expect("db mutex poisoned");
                    let _ = MetadataCache::set(&conn, cache_key, "platforms", &json, 7 * 86_400);
                }
                Ok(items)
            }
            _ => Ok(crate::commands::hub::default_hub_platforms()),
        }
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

        let steam_assets = steam_provider
            .get_artwork_options(kind, steam_app_id, name)
            .await
            .unwrap_or_default();

        let mut sgdb_assets = Vec::new();
        match config.mode {
            ProviderMode::Public => {
                let cloud = NexusCloudProvider::new(self.http.clone(), config.public_proxy_url);
                match cloud.get_artwork_options(kind, steam_app_id, name).await {
                    Ok(assets) => sgdb_assets = assets,
                    Err(err) => {
                        log::warn!("Failed to fetch artwork options from cloud: {err}");
                    }
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

        let mut combined = Vec::new();
        let mut seen_urls = std::collections::HashSet::new();

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
