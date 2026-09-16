use rusqlite::Row;
use serde::{Deserialize, Serialize};

/// Mirrors the `games` table. Field order matches the `SELECT *` column
/// order used throughout `commands::games`, which keeps `from_row` easy
/// to eyeball against the migration in `db/sql/0002_core_schema.sql`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Game {
    pub id: String,
    pub name: String,

    pub executable_path: Option<String>,
    pub install_path: Option<String>,
    pub install_size_bytes: Option<i64>,
    pub version: Option<String>,
    pub launch_arguments: Option<String>,
    pub is_installed: bool,

    /// Epic 11: optional shell commands run right before launch / right
    /// after the process exits.
    pub pre_launch_command: Option<String>,
    pub post_launch_command: Option<String>,

    pub source: String,
    pub steam_app_id: Option<String>,
    /// Game Hub: the IGDB entry this game was added from, when known —
    /// used to keep the same store page from being added twice.
    pub igdb_id: Option<i64>,
    /// Game Hub wishlist: hub games tracked for later. Cleared when the
    /// game is promoted to the library or gains a local install.
    pub is_wishlist: bool,

    pub is_favorite: bool,
    pub is_hidden: bool,

    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    /// Stored as a JSON array in SQLite (see migration notes); decoded
    /// here so the frontend always receives a real `string[]`.
    pub genres: Vec<String>,
    pub platforms: Vec<String>,
    pub age_rating: Option<String>,
    pub metacritic_score: Option<i64>,
    pub opencritic_score: Option<i64>,
    pub trailer_url: Option<String>,

    pub cover_path: Option<String>,
    pub cover_is_animated: bool,
    pub banner_path: Option<String>,
    pub logo_path: Option<String>,
    pub background_path: Option<String>,
    pub animated_cover_enabled: bool,

    pub total_playtime_seconds: i64,
    pub last_played_at: Option<String>,

    pub added_at: String,
    pub user_rating: Option<i64>,

    /// The ids of the user's tags on this game, joined from `game_tags`
    /// via a correlated subquery (see `SELECT_COLUMNS`) so the grid can
    /// render tag chips and filter by tag without a second query per
    /// game. Ids, not names — renaming a tag must not rewrite these.
    pub tag_ids: Vec<String>,
}

impl Game {
    pub const SELECT_COLUMNS: &'static str = "
        id, name, executable_path, install_path, install_size_bytes, version,
        launch_arguments, is_installed, pre_launch_command, post_launch_command,
        source, steam_app_id, igdb_id, is_wishlist, is_favorite,
        is_hidden, description, developer, publisher, release_date, genres,
        platforms, age_rating, metacritic_score, opencritic_score, trailer_url,
        cover_path, cover_is_animated, banner_path, logo_path, background_path, animated_cover_enabled,
        COALESCE((
            SELECT SUM(ps.duration_seconds)
            FROM playtime_sessions ps
            WHERE ps.game_id = games.id
              AND ps.profile_id = COALESCE((SELECT value FROM settings WHERE key = 'active_profile_id'), 'default')
        ), 0) AS total_playtime_seconds,
        (
            SELECT MAX(ps.ended_at)
            FROM playtime_sessions ps
            WHERE ps.game_id = games.id
              AND ps.profile_id = COALESCE((SELECT value FROM settings WHERE key = 'active_profile_id'), 'default')
        ) AS last_played_at,
        added_at, user_rating,
        (SELECT COALESCE(json_group_array(gt.tag_id), '[]')
         FROM game_tags AS gt WHERE gt.game_id = games.id) AS tag_ids
    ";

    pub fn select_columns_with_profile() -> &'static str {
        "id, name, executable_path, install_path, install_size_bytes, version,
        launch_arguments, is_installed, pre_launch_command, post_launch_command,
        source, steam_app_id, igdb_id, is_wishlist, is_favorite,
        is_hidden, description, developer, publisher, release_date, genres,
        platforms, age_rating, metacritic_score, opencritic_score, trailer_url,
        cover_path, cover_is_animated, banner_path, logo_path, background_path, animated_cover_enabled,
        COALESCE((
            SELECT SUM(ps.duration_seconds)
            FROM playtime_sessions ps
            WHERE ps.game_id = games.id
              AND ps.profile_id = ?1
        ), 0) AS total_playtime_seconds,
        (
            SELECT MAX(ps.ended_at)
            FROM playtime_sessions ps
            WHERE ps.game_id = games.id
              AND ps.profile_id = ?1
        ) AS last_played_at,
        added_at, user_rating,
        (SELECT COALESCE(json_group_array(gt.tag_id), '[]')
         FROM game_tags AS gt WHERE gt.game_id = games.id) AS tag_ids"
    }

    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        let genres_json: String = row.get("genres")?;
        let genres = serde_json::from_str(&genres_json).unwrap_or_default();

        let platforms_json: String = row.get("platforms")?;
        let platforms = serde_json::from_str(&platforms_json).unwrap_or_default();

        let tag_ids_json: String = row.get("tag_ids")?;
        let tag_ids = serde_json::from_str(&tag_ids_json).unwrap_or_default();

        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            executable_path: row.get("executable_path")?,
            install_path: row.get("install_path")?,
            install_size_bytes: row.get("install_size_bytes")?,
            version: row.get("version")?,
            launch_arguments: row.get("launch_arguments")?,
            is_installed: row.get("is_installed")?,
            pre_launch_command: row.get("pre_launch_command")?,
            post_launch_command: row.get("post_launch_command")?,
            source: row.get("source")?,
            steam_app_id: row.get("steam_app_id")?,
            igdb_id: row.get("igdb_id")?,
            is_wishlist: row.get("is_wishlist")?,
            is_favorite: row.get("is_favorite")?,
            is_hidden: row.get("is_hidden")?,
            description: row.get("description")?,
            developer: row.get("developer")?,
            publisher: row.get("publisher")?,
            release_date: row.get("release_date")?,
            genres,
            platforms,
            age_rating: row.get("age_rating")?,
            metacritic_score: row.get("metacritic_score")?,
            opencritic_score: row.get("opencritic_score")?,
            trailer_url: row.get("trailer_url")?,
            cover_path: row.get("cover_path")?,
            cover_is_animated: row.get("cover_is_animated")?,
            banner_path: row.get("banner_path")?,
            logo_path: row.get("logo_path")?,
            background_path: row.get("background_path")?,
            animated_cover_enabled: row.get("animated_cover_enabled")?,
            total_playtime_seconds: row.get("total_playtime_seconds")?,
            last_played_at: row.get("last_played_at")?,
            added_at: row.get("added_at")?,
            user_rating: row.get("user_rating").ok().flatten(),
            tag_ids,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

/// Mirrors the `tags` table (migration 2): user-created, colored labels
/// attached to games through `game_tags`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    /// `#RRGGBB`, enforced by `commands::tags` before any write.
    pub color: String,
}

impl Tag {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            color: row.get("color")?,
        })
    }
}

impl Collection {
    pub fn from_row(row: &Row) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            created_at: row.get("created_at")?,
        })
    }
}
