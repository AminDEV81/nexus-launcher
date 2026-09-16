use super::ScannedGame;
use crate::commands::import::find_best_executable;
use std::path::Path;

/// Amazon Games (the Prime Gaming launcher) tracks installed titles in
/// its own local SQLite database rather than the registry. We open it
/// read-only and treat any failure (missing file, unexpected schema on
/// a future launcher version) as "nothing found" rather than an error —
/// this is the one scanner reading another app's private database file
/// directly, so it's the most likely of the bunch to need updating if
/// Amazon changes their schema.
pub fn scan_amazon() -> Vec<ScannedGame> {
    let Some(local_app_data) = dirs::data_local_dir() else {
        return Vec::new();
    };

    let db_path = local_app_data
        .join("Amazon Games")
        .join("Data")
        .join("Games")
        .join("Sql")
        .join("GameInstallInfo.sqlite");

    if !db_path.exists() {
        return Vec::new();
    }

    scan_amazon_db(&db_path).unwrap_or_default()
}

fn scan_amazon_db(db_path: &Path) -> rusqlite::Result<Vec<ScannedGame>> {
    let conn =
        rusqlite::Connection::open_with_flags(db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)?;

    let mut stmt = conn.prepare("SELECT ProductTitle, InstallDirectory FROM DbSet")?;
    let games = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let install_dir: String = row.get(1)?;
            Ok((name, install_dir))
        })?
        .filter_map(|row| row.ok())
        .filter(|(_, install_dir)| !install_dir.trim().is_empty())
        .map(|(name, install_dir)| ScannedGame {
            name,
            source: "amazon".into(),
            executable_path: find_best_executable(Path::new(&install_dir)),
            install_path: Some(install_dir),
            install_size_bytes: None,
            steam_app_id: None,
        })
        .collect();

    Ok(games)
}
