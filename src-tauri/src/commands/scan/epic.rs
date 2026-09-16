use super::ScannedGame;
use serde::Deserialize;
use std::path::Path;

/// Epic Games Launcher writes one `.item` file per installed game — a
/// plain JSON manifest — into a fixed, well-documented location. No
/// registry involved, which makes this the most reliable scanner here.
const MANIFESTS_DIR: &str = r"C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests";

#[derive(Debug, Deserialize)]
struct EpicManifest {
    #[serde(rename = "DisplayName")]
    display_name: Option<String>,
    #[serde(rename = "InstallLocation")]
    install_location: Option<String>,
    #[serde(rename = "LaunchExecutable")]
    launch_executable: Option<String>,
    #[serde(rename = "InstallSize")]
    install_size: Option<u64>,
}

pub fn scan_epic() -> Vec<ScannedGame> {
    let Ok(entries) = std::fs::read_dir(MANIFESTS_DIR) else {
        return Vec::new();
    };

    let mut games = Vec::new();
    for entry in entries.filter_map(|entry| entry.ok()) {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("item") {
            continue;
        }

        let Ok(contents) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(manifest) = serde_json::from_str::<EpicManifest>(&contents) else {
            continue;
        };
        let (Some(name), Some(install_location)) =
            (manifest.display_name, manifest.install_location)
        else {
            continue;
        };

        // `LaunchExecutable` is relative to `InstallLocation`. Epic's own
        // launcher only ever writes plain relative filenames here, and the
        // manifests folder is machine-writable — an absolute value or one
        // with `..` components would make `join` escape the install dir
        // entirely, so those manifests are skipped rather than trusted.
        let executable_path = manifest.launch_executable.and_then(|exe| {
            let relative = Path::new(&exe);
            let is_confined = !relative.is_absolute()
                && !relative
                    .components()
                    .any(|component| matches!(component, std::path::Component::ParentDir));
            is_confined.then(|| {
                Path::new(&install_location)
                    .join(exe)
                    .to_string_lossy()
                    .to_string()
            })
        });

        games.push(ScannedGame {
            name,
            source: "epic".into(),
            executable_path,
            install_path: Some(install_location),
            install_size_bytes: manifest.install_size.map(|size| size as i64),
            steam_app_id: None,
        });
    }

    games
}
