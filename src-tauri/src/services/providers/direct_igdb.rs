use super::models::{HubGameDetails, HubVideo, NameIdItem};
use super::traits::MetadataProvider;
use crate::commands::hub::{self, HubGame, STANDALONE_GAME_TYPES};
use crate::commands::metadata::igdb;
use crate::commands::metadata::IgdbTokenCache;
use crate::error::{AppError, AppResult};
use chrono::Utc;
use serde_json::Value;

pub struct DirectIgdbProvider {
    http: reqwest::Client,
    token_cache: IgdbTokenCache,
    client_id: String,
    client_secret: String,
}

impl DirectIgdbProvider {
    pub fn new(
        http: reqwest::Client,
        token_cache: IgdbTokenCache,
        client_id: String,
        client_secret: String,
    ) -> Self {
        Self {
            http,
            token_cache,
            client_id,
            client_secret,
        }
    }

    async fn get_token(&self) -> AppResult<String> {
        igdb::get_access_token(
            &self.http,
            &self.token_cache,
            &self.client_id,
            &self.client_secret,
        )
        .await
    }
}

const LIST_FIELDS: &str = "fields name, summary, first_release_date, game_type, cover.image_id, \
     screenshots.image_id, total_rating_count, aggregated_rating, hypes, genres.name, platforms.name";

impl MetadataProvider for DirectIgdbProvider {
    fn provider_name(&self) -> &'static str {
        "direct_igdb"
    }

    async fn fetch_feed(&self, feed: &str, offset: i64) -> AppResult<Vec<HubGame>> {
        let token = self.get_token().await?;
        let now = Utc::now().timestamp();
        let ninety_days_ago = now - 90 * 86_400;
        let three_years_ago = now - 3 * 365 * 86_400;

        let norm_feed = feed.to_lowercase().replace('-', "_");

        let query = match norm_feed.as_str() {
            "new_releases" => format!(
                "{LIST_FIELDS};\nwhere game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} & \
                 first_release_date > {ninety_days_ago} & (hypes > 2 | total_rating_count > 10);\n\
                 sort hypes desc;\nlimit 24;\noffset {offset};"
            ),
            "coming_soon" => format!(
                "{LIST_FIELDS};\nwhere game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date > {now} & \
                 hypes > 1;\nsort first_release_date asc;\nlimit 24;\noffset {offset};"
            ),
            "top_rated" => format!(
                "{LIST_FIELDS};\nwhere game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} & \
                 first_release_date > {three_years_ago} & total_rating_count > 75;\nsort total_rating_count desc;\nlimit 24;\noffset {offset};"
            ),
            "recommended" => format!(
                "{LIST_FIELDS};\nwhere game_type = {STANDALONE_GAME_TYPES} & cover != null & first_release_date < {now} & \
                 total_rating_count > 60;\nsort total_rating_count desc;\nlimit 24;\noffset {offset};"
            ),
            _ => return Err(AppError::Invalid(format!("unknown feed: {feed}"))),
        };

        let value = igdb::query(&self.http, &self.client_id, &token, "games", &query).await?;
        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };
        Ok(entries.iter().filter_map(hub::parse_hub_game).collect())
    }

    async fn search_games(
        &self,
        query: &str,
        offset: i64,
        genre_ids: &[i64],
        platform_ids: &[i64],
    ) -> AppResult<Vec<HubGame>> {
        let token = self.get_token().await?;
        let clean_q = query.replace(['"', '\\'], "");

        let query_body = if !genre_ids.is_empty() || !platform_ids.is_empty() {
            let mut conditions = vec![format!("game_type = {STANDALONE_GAME_TYPES}")];
            if !clean_q.is_empty() {
                conditions.push(format!("name ~ *\"{clean_q}\"*"));
            }
            if !genre_ids.is_empty() {
                let list = genre_ids
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                conditions.push(format!("genres = [{list}]"));
            }
            if !platform_ids.is_empty() {
                let list = platform_ids
                    .iter()
                    .map(|id| id.to_string())
                    .collect::<Vec<_>>()
                    .join(",");
                conditions.push(format!("platforms = ({list})"));
            }
            format!(
                "{LIST_FIELDS};\nwhere {};\nsort total_rating_count desc;\nlimit 24;\noffset {offset};",
                conditions.join(" & ")
            )
        } else {
            format!(
                "search \"{clean_q}\";\n{LIST_FIELDS};\nwhere game_type = {STANDALONE_GAME_TYPES};\nlimit 24;\noffset {offset};"
            )
        };

        let value = igdb::query(&self.http, &self.client_id, &token, "games", &query_body).await?;
        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };
        Ok(entries.iter().filter_map(hub::parse_hub_game).collect())
    }

    async fn get_game_details(&self, igdb_id: i64) -> AppResult<Option<HubGameDetails>> {
        let token = self.get_token().await?;
        let query = format!(
            "fields name, summary, first_release_date, game_type, cover.image_id, screenshots.image_id, \
             total_rating_count, aggregated_rating, hypes, genres.name, platforms.name, \
             involved_companies.developer, involved_companies.publisher, involved_companies.company.name, \
             videos.video_id, videos.name;\nwhere id = {igdb_id};"
        );

        let value = igdb::query(&self.http, &self.client_id, &token, "games", &query).await?;
        let Value::Array(entries) = value else {
            return Ok(None);
        };
        let Some(first) = entries.into_iter().next() else {
            return Ok(None);
        };

        let Some(hub_game) = hub::parse_hub_game(&first) else {
            return Ok(None);
        };

        let mut developer = None;
        let mut publisher = None;
        if let Some(companies) = first.get("involved_companies").and_then(Value::as_array) {
            let mut devs = Vec::new();
            let mut pubs = Vec::new();
            for item in companies {
                let name = item.get("company").and_then(|c| c.get("name")).and_then(Value::as_str);
                if let Some(n) = name {
                    if item.get("developer").and_then(Value::as_bool).unwrap_or(false) {
                        devs.push(n);
                    }
                    if item.get("publisher").and_then(Value::as_bool).unwrap_or(false) {
                        pubs.push(n);
                    }
                }
            }
            if !devs.is_empty() {
                developer = Some(devs.join(", "));
            }
            if !pubs.is_empty() {
                publisher = Some(pubs.join(", "));
            }
        }

        let mut videos = Vec::new();
        if let Some(arr) = first.get("videos").and_then(Value::as_array) {
            for v in arr {
                if let Some(video_id) = v.get("video_id").and_then(Value::as_str) {
                    let name = v.get("name").and_then(Value::as_str).map(str::to_string);
                    videos.push(HubVideo {
                        name,
                        video_id: video_id.to_string(),
                    });
                }
            }
        }

        let trailer_url = videos
            .first()
            .map(|v| format!("https://www.youtube.com/watch?v={}", v.video_id));

        let mut screenshot_urls = Vec::new();
        if let Some(screenshots) = first.get("screenshots").and_then(Value::as_array) {
            for sc in screenshots {
                if let Some(img_id) = sc.get("image_id").and_then(Value::as_str) {
                    screenshot_urls.push(format!("https://images.igdb.com/igdb/image/upload/t_1080p/{img_id}.jpg"));
                }
            }
        }

        Ok(Some(HubGameDetails {
            game: hub_game,
            developer,
            publisher,
            trailer_url,
            videos,
            screenshot_urls,
            metacritic_score: None,
            steam_app_id: None,
        }))
    }

    async fn get_similar_games(&self, igdb_id: i64) -> AppResult<Vec<HubGame>> {
        let token = self.get_token().await?;
        let body = format!(
            "fields similar_games.id, similar_games.name, similar_games.summary, \
             similar_games.first_release_date, similar_games.game_type, \
             similar_games.cover.image_id, similar_games.screenshots.image_id, \
             similar_games.total_rating_count, similar_games.aggregated_rating, \
             similar_games.hypes, similar_games.genres.name, similar_games.platforms.name, \
             genres.id;\n\
             where id = {igdb_id};"
        );

        let value = igdb::query(&self.http, &self.client_id, &token, "games", &body).await?;
        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };

        let target_entry = entries.into_iter().next();
        let mut games: Vec<HubGame> = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();
        seen_ids.insert(igdb_id);

        let mut genre_ids = Vec::new();

        if let Some(entry) = target_entry {
            if let Some(genres_arr) = entry.get("genres").and_then(Value::as_array) {
                for g in genres_arr {
                    if let Some(gid) = g.get("id").and_then(Value::as_i64) {
                        genre_ids.push(gid);
                    }
                }
            }

            if let Some(similar) = entry.get("similar_games").and_then(Value::as_array) {
                for sim in similar {
                    if let Some(game) = hub::parse_hub_game(sim) {
                        if seen_ids.insert(game.igdb_id) {
                            let is_standalone = match game.game_type {
                                Some(t) => [0, 4, 8, 9, 10].contains(&t),
                                None => true,
                            };
                            if is_standalone && game.cover_url.is_some() {
                                games.push(game);
                            }
                        }
                    }
                }
            }
        }

        if games.len() < 10 && !genre_ids.is_empty() {
            let genre_clause = genre_ids
                .iter()
                .take(3)
                .map(|id| id.to_string())
                .collect::<Vec<_>>()
                .join(",");
            let fallback_body = format!(
                "{LIST_FIELDS};\n\
                 where game_type = {STANDALONE_GAME_TYPES} & cover != null & genres = ({genre_clause}) & id != {igdb_id};\n\
                 sort total_rating_count desc;\n\
                 limit 16;\n\
                 offset 0;"
            );
            if let Ok(Value::Array(fallback_entries)) =
                igdb::query(&self.http, &self.client_id, &token, "games", &fallback_body).await
            {
                for entry in fallback_entries {
                    if let Some(game) = hub::parse_hub_game(&entry) {
                        if seen_ids.insert(game.igdb_id) {
                            games.push(game);
                            if games.len() >= 16 {
                                break;
                            }
                        }
                    }
                }
            }
        }

        Ok(games)
    }

    async fn list_genres(&self) -> AppResult<Vec<NameIdItem>> {
        let token = self.get_token().await?;
        let value = igdb::query(
            &self.http,
            &self.client_id,
            &token,
            "genres",
            "fields name; sort name asc; limit 50;",
        )
        .await?;

        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };

        let items = entries
            .into_iter()
            .filter_map(|v| {
                let id = v.get("id")?.as_i64()?;
                let name = v.get("name")?.as_str()?.to_string();
                Some(NameIdItem { id, name })
            })
            .collect();
        Ok(items)
    }

    async fn list_platforms(&self) -> AppResult<Vec<NameIdItem>> {
        let token = self.get_token().await?;
        let value = igdb::query(
            &self.http,
            &self.client_id,
            &token,
            "platforms",
            "fields name; sort name asc; limit 50;",
        )
        .await?;

        let Value::Array(entries) = value else {
            return Ok(Vec::new());
        };

        let items = entries
            .into_iter()
            .filter_map(|v| {
                let id = v.get("id")?.as_i64()?;
                let name = v.get("name")?.as_str()?.to_string();
                Some(NameIdItem { id, name })
            })
            .collect();
        Ok(items)
    }
}
