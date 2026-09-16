use super::ScannedGame;
use crate::commands::import::find_best_executable;
use std::path::PathBuf;

/// Best-effort only: PC Xbox/Microsoft Store games are UWP packages
/// properly enumerated through Windows' package manager APIs, which is
/// a much larger integration than this pass covers. Instead, this
/// checks the default per-drive `XboxGames` folder Microsoft has used
/// since the "Xbox app install location" redesign — it catches the
/// common case (default location) but will miss games moved to a
/// custom folder or still installed under `WindowsApps`.
pub fn scan_xbox() -> Vec<ScannedGame> {
    let mut games = Vec::new();

    for drive in ['C', 'D', 'E', 'F'] {
        let root = PathBuf::from(format!("{drive}:\\XboxGames"));
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };

        for entry in entries.filter_map(|entry| entry.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            let content_dir = path.join("Content");
            let search_root = if content_dir.is_dir() {
                &content_dir
            } else {
                &path
            };
            let executable_path = find_best_executable(search_root);

            games.push(ScannedGame {
                name,
                source: "xbox".into(),
                executable_path,
                install_path: Some(path.to_string_lossy().to_string()),
                install_size_bytes: None,
                steam_app_id: None,
            });
        }
    }

    games
}
