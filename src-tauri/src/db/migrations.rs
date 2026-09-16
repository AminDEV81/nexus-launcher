use crate::error::AppResult;
use rusqlite::Connection;

/// Ordered list of migrations. Each entry is applied at most once, tracked
/// by version number in the `schema_migrations` table below.
///
/// Epic 0 only ships the migration *runner* plus a bootstrap migration.
/// The real application schema (games, collections, tags, playtime_sessions,
/// artwork_cache, settings) is added in Epic 3 as migration `2`, `3`, ...
/// so that changes to the schema over time stay auditable and reversible
/// on upgrade, rather than being defined ad-hoc.
const MIGRATIONS: &[(i64, &str)] = &[
    (
        1,
        "-- bootstrap: nothing to create yet, this just proves migrations run.
         SELECT 1;",
    ),
    (2, include_str!("./sql/0002_core_schema.sql")),
    (3, include_str!("./sql/0003_metadata_fields.sql")),
    (4, include_str!("./sql/0004_cover_is_animated.sql")),
    (5, include_str!("./sql/0005_launch_hooks.sql")),
    (6, include_str!("./sql/0006_game_hub.sql")),
    (7, include_str!("./sql/0007_wishlist.sql")),
    (8, include_str!("./sql/0008_download_manager.sql")),
    (9, include_str!("./sql/0009_download_resume_state.sql")),
    (10, include_str!("./sql/0010_multi_profile_saves.sql")),
    (11, include_str!("./sql/0011_fix_constraints.sql")),
    (12, include_str!("./sql/0012_per_profile_stats.sql")),
    (13, include_str!("./sql/0013_user_rating.sql")),
    (14, include_str!("./sql/0014_fix_metacritic_score.sql")),
    (15, include_str!("./sql/0015_clean_unverified_metacritic_scores.sql")),
    (16, include_str!("./sql/0016_soundtracks.sql")),
    (17, include_str!("./sql/0017_metadata_cache.sql")),
    (18, include_str!("./sql/0018_clear_old_metadata_cache.sql")),
];

pub fn run(conn: &mut Connection) -> AppResult<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version     INTEGER PRIMARY KEY,
            applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )",
        [],
    )?;

    let already_applied: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;

    let tx = conn.transaction()?;
    for (version, sql) in MIGRATIONS {
        if *version <= already_applied {
            continue;
        }
        tx.execute_batch(sql)?;
        tx.execute(
            "INSERT INTO schema_migrations (version) VALUES (?1)",
            [version],
        )?;
        log::info!("applied migration {version}");
    }
    tx.commit()?;

    Ok(())
}
