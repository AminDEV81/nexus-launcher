use crate::db::models::Tag;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use tauri::State;
use uuid::Uuid;

/// Default swatch for new tags — matches the `tags.color` column default
/// in migration 2 and the first swatch of the frontend palette.
const DEFAULT_TAG_COLOR: &str = "#7c5cff";

#[tauri::command]
pub fn list_tags(db: State<'_, Database>) -> AppResult<Vec<Tag>> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let mut stmt =
        conn.prepare("SELECT id, name, color FROM tags ORDER BY name COLLATE NOCASE ASC")?;
    let tags = stmt
        .query_map([], Tag::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(tags)
}

#[derive(Debug, Deserialize)]
pub struct TagInput {
    pub name: String,
    /// `None` uses the default swatch (`create_tag` only).
    pub color: Option<String>,
}

fn validate_name(name: &str) -> AppResult<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Invalid("tag name cannot be empty".into()));
    }
    if trimmed.len() > 32 {
        return Err(AppError::Invalid(
            "tag name must be 32 characters or fewer".into(),
        ));
    }
    Ok(trimmed.to_string())
}

/// Normalizes to lowercase `#rrggbb` or rejects — anything else would
/// either fail to render as a CSS color in the webview or smuggle
/// styling into chips that render the value inline.
fn validate_color(color: &str) -> AppResult<String> {
    let normalized = color.trim().to_ascii_lowercase();
    let valid = normalized.len() == 7
        && normalized.starts_with('#')
        && normalized.as_bytes()[1..]
            .iter()
            .all(|byte| byte.is_ascii_hexdigit());
    if valid {
        Ok(normalized)
    } else {
        Err(AppError::Invalid("tag color must look like #RRGGBB".into()))
    }
}

/// The `tags.name` UNIQUE constraint surfaces as a raw constraint error;
/// translate it so the user hears "pick another name", not SQLite-ese.
fn map_constraint_error(err: rusqlite::Error) -> AppError {
    match err {
        rusqlite::Error::SqliteFailure(failure, _)
            if failure.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            AppError::Invalid("a tag with that name already exists".into())
        }
        other => AppError::Database(other),
    }
}

#[tauri::command]
pub fn create_tag(db: State<'_, Database>, input: TagInput) -> AppResult<Tag> {
    let name = validate_name(&input.name)?;
    let color = match input.color.as_deref() {
        Some(color) => validate_color(color)?,
        None => DEFAULT_TAG_COLOR.to_string(),
    };

    let conn = db.connection.lock().expect("db mutex poisoned");
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
        rusqlite::params![&id, &name, &color],
    )
    .map_err(map_constraint_error)?;

    conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        [&id],
        Tag::from_row,
    )
    .map_err(AppError::from)
}

/// Renames and/or recolors in one shot — the edit form saves both
/// together, so there's no need for two separate commands.
#[tauri::command]
pub fn update_tag(db: State<'_, Database>, id: String, input: TagInput) -> AppResult<Tag> {
    let name = validate_name(&input.name)?;
    let color = validate_color(input.color.as_deref().unwrap_or(DEFAULT_TAG_COLOR))?;

    let conn = db.connection.lock().expect("db mutex poisoned");
    let changed = conn
        .execute(
            "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
            rusqlite::params![&name, &color, &id],
        )
        .map_err(map_constraint_error)?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no tag with id {id}")));
    }

    conn.query_row(
        "SELECT id, name, color FROM tags WHERE id = ?1",
        [&id],
        Tag::from_row,
    )
    .map_err(AppError::from)
}

/// Deletes the tag only. `game_tags` rows go with it via the migration's
/// `ON DELETE CASCADE` — no game data is touched.
#[tauri::command]
pub fn delete_tag(db: State<'_, Database>, id: String) -> AppResult<()> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let changed = conn.execute("DELETE FROM tags WHERE id = ?1", [&id])?;
    if changed == 0 {
        return Err(AppError::NotFound(format!("no tag with id {id}")));
    }

    Ok(())
}

/// Replaces the game's whole tag set in one transaction — the buffered
/// "Save" in the tag editor diffs nothing server-side; it just sends the
/// final selection. Duplicate ids in the payload are ignored; unknown
/// ones fail the foreign key and surface as a friendly error.
#[tauri::command]
pub fn set_game_tags(
    db: State<'_, Database>,
    game_id: String,
    tag_ids: Vec<String>,
) -> AppResult<()> {
    let mut conn = db.connection.lock().expect("db mutex poisoned");

    let game_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM games WHERE id = ?1)",
        [&game_id],
        |row| row.get(0),
    )?;
    if !game_exists {
        return Err(AppError::NotFound(format!("no game with id {game_id}")));
    }

    let tx = conn.transaction()?;
    tx.execute("DELETE FROM game_tags WHERE game_id = ?1", [&game_id])?;
    for tag_id in &tag_ids {
        if let Err(err) = tx.execute(
            "INSERT OR IGNORE INTO game_tags (game_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![&game_id, &tag_id],
        ) {
            let foreign_key_violation = matches!(
                &err,
                rusqlite::Error::SqliteFailure(failure, _)
                    if failure.code == rusqlite::ErrorCode::ConstraintViolation
            );
            return Err(if foreign_key_violation {
                AppError::Invalid(format!("unknown tag id {tag_id}"))
            } else {
                err.into()
            });
        }
    }
    tx.commit()?;

    Ok(())
}
