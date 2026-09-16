use super::ScannedGame;

#[cfg(windows)]
mod windows_impl {
    use super::ScannedGame;
    use crate::commands::import::find_best_executable;
    use std::path::Path;
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    /// GOG Galaxy writes one subkey per installed game under this path
    /// (checking both the 32-bit-on-64-bit view and the plain view,
    /// since which one it lands in has varied across Galaxy versions).
    /// Unlike EA/Ubisoft below, GOG conveniently stores the exe path
    /// directly, so no folder-guessing is needed here.
    pub fn scan_gog() -> Vec<ScannedGame> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut games = Vec::new();

        for base in [
            r"SOFTWARE\WOW6432Node\GOG.com\Games",
            r"SOFTWARE\GOG.com\Games",
        ] {
            let Ok(games_key) = hklm.open_subkey(base) else {
                continue;
            };

            for game_id in games_key.enum_keys().filter_map(|key| key.ok()) {
                let Ok(game_key) = games_key.open_subkey(&game_id) else {
                    continue;
                };

                let name: Option<String> = game_key.get_value("gameName").ok();
                let install_path: Option<String> = game_key.get_value("path").ok();
                let exe: Option<String> = game_key.get_value("exe").ok();

                let (Some(name), Some(install_path)) = (name, install_path) else {
                    continue;
                };

                let executable_path = exe.map(|exe_value| {
                    let exe_path = Path::new(&exe_value);
                    if exe_path.is_absolute() {
                        exe_value
                    } else {
                        Path::new(&install_path)
                            .join(&exe_value)
                            .to_string_lossy()
                            .to_string()
                    }
                });

                games.push(ScannedGame {
                    name,
                    source: "gog".into(),
                    executable_path,
                    install_path: Some(install_path),
                    install_size_bytes: None,
                    steam_app_id: None,
                });
            }
        }

        games
    }

    /// Classic Origin/EA App titles register an "Install Dir" under one
    /// subkey per offer ID here. EA App does not store the exe path in
    /// this key, so we fall back to guessing the largest exe in the
    /// install folder (same heuristic as Epic 4's folder-add).
    ///
    /// Caveat: this reliably covers Origin-era installs; some newer EA
    /// App-only titles may use a different registry layout that isn't
    /// covered yet.
    pub fn scan_ea() -> Vec<ScannedGame> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut games = Vec::new();

        let Ok(origin_games) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Origin Games") else {
            return games;
        };

        for offer_id in origin_games.enum_keys().filter_map(|key| key.ok()) {
            let Ok(game_key) = origin_games.open_subkey(&offer_id) else {
                continue;
            };
            let Ok(install_dir) = game_key.get_value::<String, _>("Install Dir") else {
                continue;
            };
            if install_dir.trim().is_empty() {
                continue;
            }

            let name = Path::new(&install_dir)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or(offer_id);

            let executable_path = find_best_executable(Path::new(&install_dir));

            games.push(ScannedGame {
                name,
                source: "ea".into(),
                executable_path,
                install_path: Some(install_dir),
                install_size_bytes: None,
                steam_app_id: None,
            });
        }

        games
    }

    /// Ubisoft Connect registers one subkey per installed game here,
    /// each with an `InstallDir` value but, like EA, no exe path — same
    /// largest-exe fallback as above.
    pub fn scan_ubisoft() -> Vec<ScannedGame> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut games = Vec::new();

        let Ok(installs) = hklm.open_subkey(r"SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs")
        else {
            return games;
        };

        for game_id in installs.enum_keys().filter_map(|key| key.ok()) {
            let Ok(game_key) = installs.open_subkey(&game_id) else {
                continue;
            };
            let Ok(install_dir) = game_key.get_value::<String, _>("InstallDir") else {
                continue;
            };
            if install_dir.trim().is_empty() {
                continue;
            }

            let name = Path::new(&install_dir)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| format!("Ubisoft game {game_id}"));

            let executable_path = find_best_executable(Path::new(&install_dir));

            games.push(ScannedGame {
                name,
                source: "ubisoft".into(),
                executable_path,
                install_path: Some(install_dir),
                install_size_bytes: None,
                steam_app_id: None,
            });
        }

        games
    }

    /// Battle.net has no single documented "list installed games" registry
    /// key the way the others do. As a best-effort fallback, this reads
    /// the standard Windows "installed programs" registry (the same data
    /// Control Panel's "Uninstall a program" list is built from) and
    /// keeps only entries published by Blizzard. `DisplayIcon` on these
    /// entries is very often the actual game exe (with an
    /// ",<icon-index>" suffix from the icon resource, stripped below).
    pub fn scan_battlenet() -> Vec<ScannedGame> {
        scan_uninstall_registry_by_publisher(&["blizzard"], "battlenet")
    }

    fn scan_uninstall_registry_by_publisher(
        publisher_needles: &[&str],
        source: &str,
    ) -> Vec<ScannedGame> {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let mut games = Vec::new();

        for base in [
            r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
            r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        ] {
            let Ok(uninstall_key) = hklm.open_subkey(base) else {
                continue;
            };

            for entry_name in uninstall_key.enum_keys().filter_map(|key| key.ok()) {
                let Ok(entry) = uninstall_key.open_subkey(&entry_name) else {
                    continue;
                };

                let publisher: String = entry.get_value("Publisher").unwrap_or_default();
                let publisher_lower = publisher.to_lowercase();
                if !publisher_needles
                    .iter()
                    .any(|needle| publisher_lower.contains(needle))
                {
                    continue;
                }

                let Ok(name) = entry.get_value::<String, _>("DisplayName") else {
                    continue;
                };

                let install_path: Option<String> = entry
                    .get_value("InstallLocation")
                    .ok()
                    .filter(|value: &String| !value.trim().is_empty());

                let executable_path: Option<String> = entry
                    .get_value::<String, _>("DisplayIcon")
                    .ok()
                    .and_then(|icon| {
                        let exe_path = icon.split(',').next().unwrap_or("").trim().to_string();
                        (!exe_path.is_empty() && exe_path.to_lowercase().ends_with(".exe"))
                            .then_some(exe_path)
                    });

                games.push(ScannedGame {
                    name,
                    source: source.into(),
                    executable_path,
                    install_path,
                    install_size_bytes: None,
                    steam_app_id: None,
                });
            }
        }

        games
    }
}

#[cfg(not(windows))]
mod windows_impl {
    use super::ScannedGame;

    pub fn scan_gog() -> Vec<ScannedGame> {
        Vec::new()
    }
    pub fn scan_ea() -> Vec<ScannedGame> {
        Vec::new()
    }
    pub fn scan_ubisoft() -> Vec<ScannedGame> {
        Vec::new()
    }
    pub fn scan_battlenet() -> Vec<ScannedGame> {
        Vec::new()
    }
}

pub use windows_impl::{scan_battlenet, scan_ea, scan_gog, scan_ubisoft};
