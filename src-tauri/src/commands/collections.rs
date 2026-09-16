use crate::db::models::Collection;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn list_collections(db: State<'_, Database>) -> AppResult<Vec<Collection>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM collections ORDER BY name COLLATE NOCASE ASC")?;
    let collections = stmt
        .query_map([], Collection::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(collections)
}

#[derive(Debug, Deserialize)]
pub struct CreateCollectionInput {
    pub name: String,
}

#[tauri::command]
pub fn create_collection(
    db: State<'_, Database>,
    input: CreateCollectionInput,
) -> AppResult<Collection> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    if input.name.trim().is_empty() {
        return Err(AppError::Invalid("collection name cannot be empty".into()));
    }

    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO collections (id, name) VALUES (?1, ?2)",
        rusqlite::params![&id, &input.name],
    )?;

    let collection = conn.query_row(
        "SELECT id, name, created_at FROM collections WHERE id = ?1",
        [&id],
        Collection::from_row,
    )?;
    Ok(collection)
}

#[tauri::command]
pub fn delete_collection(db: State<'_, Database>, id: String) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let changed = conn.execute("DELETE FROM collections WHERE id = ?1", [&id])?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no collection with id {id}")));
    }

    Ok(())
}

#[tauri::command]
pub fn add_game_to_collection(
    db: State<'_, Database>,
    collection_id: String,
    game_id: String,
) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let is_installed: bool = conn
        .query_row(
            "SELECT is_installed FROM games WHERE id = ?1",
            [&game_id],
            |row| row.get(0),
        )
        .map_err(|_| AppError::NotFound(format!("no game with id {game_id}")))?;
    if !is_installed {
        return Err(AppError::Invalid(
            "Only installed games can be added to a collection.".into(),
        ));
    }

    conn.execute(
        "INSERT OR IGNORE INTO collection_games (collection_id, game_id) VALUES (?1, ?2)",
        rusqlite::params![&collection_id, &game_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn remove_game_from_collection(
    db: State<'_, Database>,
    collection_id: String,
    game_id: String,
) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    conn.execute(
        "DELETE FROM collection_games WHERE collection_id = ?1 AND game_id = ?2",
        rusqlite::params![&collection_id, &game_id],
    )?;

    Ok(())
}

#[tauri::command]
pub fn list_games_in_collection(
    db: State<'_, Database>,
    collection_id: String,
    profile_id: Option<String>,
) -> AppResult<Vec<crate::db::models::Game>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let target_profile = profile_id.unwrap_or_else(|| {
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'active_profile_id'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "default".to_string())
    });

    let sql = format!(
        "SELECT {}
         FROM games
         JOIN collection_games ON collection_games.game_id = games.id
         WHERE collection_games.collection_id = ?2
         ORDER BY games.name COLLATE NOCASE ASC",
        crate::db::models::Game::select_columns_with_profile()
    );
    let mut stmt = conn.prepare(&sql)?;
    let games = stmt
        .query_map(rusqlite::params![&target_profile, &collection_id], crate::db::models::Game::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(games)
}

/// A collection plus just enough to render its card on `/collections`
/// without the grid having to fetch every collection's full game list
/// (which is all `list_games_in_collection` gives you) just to build a
/// 4-cover mosaic and a count.
#[derive(Serialize)]
pub struct CollectionSummary {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub game_count: i64,
    /// Up to 4 cover paths, alphabetical by game name — same ordering
    /// `list_games_in_collection` uses, so the mosaic's top-left game is
    /// always the same one the detail page shows first.
    pub preview_covers: Vec<String>,
}

#[tauri::command]
pub fn list_collections_with_previews(
    db: State<'_, Database>,
) -> AppResult<Vec<CollectionSummary>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let mut stmt = conn
        .prepare("SELECT id, name, created_at FROM collections ORDER BY name COLLATE NOCASE ASC")?;
    let collections = stmt
        .query_map([], Collection::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut summaries = Vec::with_capacity(collections.len());
    for collection in collections {
        let game_count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM collection_games WHERE collection_id = ?1",
            [&collection.id],
            |row| row.get(0),
        )?;

        let mut cover_stmt = conn.prepare(
            "SELECT games.cover_path FROM games
             JOIN collection_games ON collection_games.game_id = games.id
             WHERE collection_games.collection_id = ?1 AND games.cover_path IS NOT NULL
             ORDER BY games.name COLLATE NOCASE ASC LIMIT 4",
        )?;
        let preview_covers = cover_stmt
            .query_map([&collection.id], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?;

        summaries.push(CollectionSummary {
            id: collection.id,
            name: collection.name,
            created_at: collection.created_at,
            game_count,
            preview_covers,
        });
    }

    Ok(summaries)
}

/// IDs of every collection a game currently belongs to — powers the
/// checkbox states in the "Add to Collection" picker so it can show
/// what's already checked rather than starting blank every time.
#[tauri::command]
pub fn list_collection_ids_for_game(
    db: State<'_, Database>,
    game_id: String,
) -> AppResult<Vec<String>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let mut stmt = conn.prepare("SELECT collection_id FROM collection_games WHERE game_id = ?1")?;
    let ids = stmt
        .query_map([&game_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(ids)
}
