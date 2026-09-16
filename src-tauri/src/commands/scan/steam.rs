use super::ScannedGame;

/// Steam's library folders and per-app manifests are Valve's own text
/// format (VDF/ACF) spread across `steamapps/libraryfolders.vdf` and
/// `steamapps/appmanifest_*.acf` in every library. `steamlocate` already
/// implements that parsing correctly (multi-library discovery included),
/// so this just walks its API rather than us hand-rolling a VDF parser.
pub fn scan_steam() -> Vec<ScannedGame> {
    let Ok(steam_dir) = steamlocate::SteamDir::locate() else {
        return Vec::new();
    };
    let Ok(libraries) = steam_dir.libraries() else {
        return Vec::new();
    };

    let mut games = Vec::new();
    for library in libraries.into_iter().filter_map(|lib| lib.ok()) {
        for app in library.apps().filter_map(|app| app.ok()) {
            let Some(name) = app.name.clone() else {
                continue;
            };

            let install_path = library
                .path()
                .join("steamapps")
                .join("common")
                .join(&app.install_dir);

            games.push(ScannedGame {
                name,
                source: "steam".into(),
                executable_path: None,
                install_path: Some(install_path.to_string_lossy().to_string()),
                install_size_bytes: None,
                steam_app_id: Some(app.app_id.to_string()),
            });
        }
    }

    games
}
