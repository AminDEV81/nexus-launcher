use super::ScannedGame;
use crate::commands::import::list_executable_candidates;
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Known crack, Steam-emulator, and repack signature files commonly found inside
/// cracked or repack game directories (FitGirl, DODI, RUNE, CODEX, TENOKE, GOLDBERG, etc.).
const CRACK_MARKER_FILES: &[&str] = &[
    "steam_emu.ini",
    "tenoke.ini",
    "flt.ini",
    "codex.ini",
    "codex64.dll",
    "rune.ini",
    "rune64.dll",
    "emp.dll",
    "cpy.ini",
    "3dmgame.ini",
    "ali213.ini",
    "smartsteamemu.ini",
    "onlinefix.ini",
    "onlinefix64.dll",
    "steamclient_loader.exe",
    "steam_api64.cdx",
    "steam_api.cdx",
    "steam_api64.rne",
    "hlm.ini",
    "skidrow.ini",
    "razor1911.ini",
    " fitgirl.md5",
];

/// Directory names that should never be treated as standalone games when scanning
/// root `Games` or `Program Files` directories.
const IGNORED_FOLDER_NAMES: &[&str] = &[
    "steam",
    "steamapps",
    "epic games",
    "gog galaxy",
    "ubisoft",
    "ubisoft game launcher",
    "ea games",
    "ea desktop",
    "origin",
    "origin games",
    "battle.net",
    "xboxgames",
    "windowsapps",
    "common",
    "directx",
    "redist",
    "_commonredist",
    "__installer",
    "support",
    "bonus",
    "soundtrack",
    "ost",
    "wallpapers",
    "mods",
    "saves",
    "profiles",
    "shadercache",
    "crashes",
    "logs",
    "temp",
];

/// Cleans scene/repack release tags from a folder or installer name so IGDB metadata
/// lookup matches the clean canonical game title automatically.
pub fn clean_scanned_game_title(raw: &str) -> String {
    let mut s = raw.trim().to_string();

    // Remove bracketed or parenthesized repack/version suffixes like "[FitGirl Repack]" or "(DODI Repack)"
    while let (Some(start), Some(end)) = (s.find('['), s.find(']')) {
        if end > start {
            s.replace_range(start..=end, " ");
        } else {
            break;
        }
    }

    // Replace dots and underscores with spaces if the folder uses scene naming (e.g. "Cyberpunk.2077.v2.1-RUNE")
    let space_count = s.chars().filter(|&c| c == ' ').count();
    let dot_count = s.chars().filter(|&c| c == '.').count();
    if space_count == 0 && dot_count >= 2 {
        s = s.replace('.', " ").replace('_', " ");
    } else {
        s = s.replace('_', " ");
    }

    // Strip known scene group / repack suffixes
    let scene_suffixes = [
        "-fitgirl repack",
        "fitgirl repack",
        "-dodi repack",
        "dodi repack",
        "-elamigos",
        "elamigos",
        "-rune",
        "-codex",
        "-tenoke",
        "-flt",
        "-empress",
        "-cpy",
        "-skidrow",
        "-razor1911",
        "-gog",
        "-kaos",
        "-xatab",
        "repack",
    ];
    let lower = s.to_lowercase();
    for suffix in scene_suffixes {
        if let Some(idx) = lower.rfind(suffix) {
            if idx >= 3 {
                s.truncate(idx);
                break;
            }
        }
    }

    // Strip trailing version tokens like "v1.04", "v2.12", "Build 12345"
    let tokens: Vec<&str> = s.split_whitespace().collect();
    let mut kept: Vec<&str> = Vec::new();
    for tok in tokens {
        let low = tok.to_lowercase();
        let is_ver = (low.starts_with('v')
            && low.len() > 1
            && low.chars().nth(1).map(|c| c.is_ascii_digit()).unwrap_or(false))
            || low == "build"
            || low == "(64-bit)"
            || low == "x64";
        if is_ver && !kept.is_empty() {
            break;
        }
        kept.push(tok);
    }

    let cleaned = kept.join(" ").trim_matches(|c: char| c == '-' || c == ':' || c.is_whitespace()).to_string();
    if cleaned.is_empty() {
        raw.trim().to_string()
    } else {
        cleaned
    }
}

/// Checks if a directory contains crack/emulator markers or looks like a standalone PC game folder.
fn inspect_candidate_game_folder(folder: &Path) -> Option<ScannedGame> {
    let folder_name = folder.file_name()?.to_string_lossy().to_string();
    let folder_low = folder_name.trim().to_lowercase();
    if folder_low.is_empty() || folder_low.starts_with('.') {
        return None;
    }
    if IGNORED_FOLDER_NAMES.iter().any(|&ig| ig == folder_low) {
        return None;
    }

    let candidates = list_executable_candidates(folder);
    let primary_exe = candidates.first()?;

    // Require at least a 1.5 MB executable or a known crack/engine marker so tiny utility folders are skipped
    let has_crack_or_engine_marker = check_folder_has_game_or_crack_markers(folder);
    if primary_exe.size_bytes < 1_500_000 && !has_crack_or_engine_marker {
        return None;
    }

    let clean_name = clean_scanned_game_title(&folder_name);
    if clean_name.len() < 2 {
        return None;
    }

    Some(ScannedGame {
        name: clean_name,
        source: "cracked".into(),
        executable_path: Some(primary_exe.path.clone()),
        install_path: Some(folder.to_string_lossy().to_string()),
        install_size_bytes: Some(primary_exe.size_bytes as i64),
        steam_app_id: None,
    })
}

fn check_folder_has_game_or_crack_markers(root: &Path) -> bool {
    let walker = walkdir::WalkDir::new(root).max_depth(3).into_iter();
    for entry in walker.filter_map(|e| e.ok()) {
        let fname = entry.file_name().to_string_lossy().to_lowercase();
        if CRACK_MARKER_FILES.iter().any(|&m| fname == m) {
            return true;
        }
        if fname == "steam_api64.dll"
            || fname == "steam_api.dll"
            || fname == "unityplayer.dll"
            || fname == "emp.dll"
            || fname == "goldberg_steam_appid.txt"
            || fname == "steam_appid.txt"
            || fname.ends_with("-win64-shipping.exe")
        {
            return true;
        }
    }
    false
}

/// Collects common root directories where users install cracked, repack, or standalone games
/// across all mounted drive letters (`C:\`..`Z:\`) and user profile directories.
fn candidate_game_root_dirs() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();
    let mut seen = HashSet::new();

    let mut push_if_dir = |p: PathBuf| {
        if p.is_dir() {
            let key = p.to_string_lossy().to_lowercase().replace('/', "\\");
            if seen.insert(key) {
                roots.push(p);
            }
        }
    };

    let root_folder_names = [
        "Games",
        "My Games",
        "PC Games",
        "Cracked Games",
        "Repacks",
        "FitGirl Repacks",
        "DODI-Repacks",
        "ElAmigos",
        "NexusGames",
        "Installed Games",
        r"Program Files\Games",
        r"Program Files (x86)\Games",
        r"Program Files (x86)\DODI-Repacks",
        r"Program Files (x86)\FitGirl Repacks",
        r"Program Files (x86)\R.G. Mechanics",
    ];

    #[cfg(windows)]
    {
        for drive_letter in b'C'..=b'Z' {
            let drive = format!("{}:\\", drive_letter as char);
            let drive_path = Path::new(&drive);
            if !drive_path.exists() {
                continue;
            }
            for sub in root_folder_names {
                push_if_dir(drive_path.join(sub));
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        for sub in ["Games", "My Games", "NexusGames", "Cracked Games", "Repacks"] {
            push_if_dir(home.join(sub));
        }
    }
    if let Some(desktop) = dirs::desktop_dir() {
        for sub in ["Games", "Cracked Games"] {
            push_if_dir(desktop.join(sub));
        }
    }

    roots
}

#[cfg(windows)]
fn scan_inno_and_repack_uninstall_registry(seen_paths: &mut HashSet<String>) -> Vec<ScannedGame> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut found = Vec::new();
    let hives = [
        RegKey::predef(HKEY_LOCAL_MACHINE),
        RegKey::predef(HKEY_CURRENT_USER),
    ];
    let subkeys = [
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    ];

    let non_game_Filter = [
        "microsoft",
        "windows",
        "nvidia",
        "amd ",
        "intel",
        "realtek",
        "google",
        "mozilla",
        "brave",
        "discord",
        "spotify",
        "vlc",
        "7-zip",
        "winrar",
        "obs ",
        "steam",
        "epic games",
        "ubisoft connect",
        "ea app",
        "gog galaxy",
        "riot ",
        "overwolf",
        "visual studio",
        "redistributable",
        "driver",
        "runtime",
        "sdk",
    ];

    for hive in hives {
        for base in subkeys {
            let Ok(uninst) = hive.open_subkey(base) else {
                continue;
            };
            for key_name in uninst.enum_keys().filter_map(|k| k.ok()) {
                let Ok(entry) = uninst.open_subkey(&key_name) else {
                    continue;
                };

                let display_name: String = entry.get_value("DisplayName").unwrap_or_default();
                if display_name.trim().is_empty() {
                    continue;
                }
                let disp_low = display_name.to_lowercase();
                if non_game_Filter.iter().any(|&w| disp_low.contains(w)) {
                    continue;
                }

                let install_loc: Option<String> = entry
                    .get_value::<String, _>("InstallLocation")
                    .ok()
                    .or_else(|| entry.get_value::<String, _>("Inno Setup: App Path").ok())
                    .map(|s| s.trim().trim_matches('"').to_string())
                    .filter(|s| !s.is_empty());

                let Some(loc) = install_loc else {
                    continue;
                };
                let loc_low = loc.to_lowercase().replace('/', "\\");

                // Skip official launcher store paths (handled by their own scanners)
                if loc_low.contains("\\steamapps\\")
                    || loc_low.contains("\\epic games\\")
                    || loc_low.contains("\\ubisoft game launcher\\")
                    || loc_low.contains("\\origin games\\")
                    || loc_low.contains("\\windowsapps\\")
                {
                    continue;
                }

                let is_inno = key_name.to_lowercase().ends_with("_is1");
                let in_games_folder = loc_low.contains("\\games\\")
                    || loc_low.contains("\\repacks\\")
                    || loc_low.contains("fitgirl")
                    || loc_low.contains("dodi");

                if !is_inno && !in_games_folder {
                    continue;
                }

                let folder_path = Path::new(&loc);
                if !folder_path.is_dir() {
                    continue;
                }

                let norm_path = loc_low.trim_end_matches('\\').to_string();
                if seen_paths.contains(&norm_path) {
                    continue;
                }

                if !in_games_folder && !check_folder_has_game_or_crack_markers(folder_path) {
                    continue;
                }

                if let Some(mut game) = inspect_candidate_game_folder(folder_path) {
                    game.name = clean_scanned_game_title(&display_name);
                    seen_paths.insert(norm_path);
                    found.push(game);
                }
            }
        }
    }

    found
}

#[cfg(not(windows))]
fn scan_inno_and_repack_uninstall_registry(_seen_paths: &mut HashSet<String>) -> Vec<ScannedGame> {
    Vec::new()
}

/// Scans common game directories across all drives AND Inno Setup / Repack registry entries
/// to discover cracked, repack (FitGirl, DODI, RUNE, CODEX, TENOKE, etc.), and standalone games.
pub fn scan_cracked_and_standalone() -> Vec<ScannedGame> {
    let mut discovered: Vec<ScannedGame> = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();

    // 1. Scan common local game root folders across all drives
    for root in candidate_game_root_dirs() {
        let Ok(entries) = std::fs::read_dir(&root) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let norm = path
                .to_string_lossy()
                .to_lowercase()
                .replace('/', "\\")
                .trim_end_matches('\\')
                .to_string();
            if seen_paths.contains(&norm) {
                continue;
            }

            if let Some(game) = inspect_candidate_game_folder(&path) {
                seen_paths.insert(norm);
                discovered.push(game);
            } else {
                // Also check 1 level deeper for publisher/repack group subfolders (e.g. D:\Games\FitGirl Repacks\GameName)
                if let Ok(sub_entries) = std::fs::read_dir(&path) {
                    for sub in sub_entries.filter_map(|e| e.ok()).take(24) {
                        let sub_path = sub.path();
                        if !sub_path.is_dir() {
                            continue;
                        }
                        let sub_norm = sub_path
                            .to_string_lossy()
                            .to_lowercase()
                            .replace('/', "\\")
                            .trim_end_matches('\\')
                            .to_string();
                        if seen_paths.contains(&sub_norm) {
                            continue;
                        }
                        if let Some(game) = inspect_candidate_game_folder(&sub_path) {
                            seen_paths.insert(sub_norm);
                            discovered.push(game);
                        }
                    }
                }
            }
        }
    }

    // 2. Scan Windows Registry Uninstall keys for Inno Setup / Repack / Cracked games installed in custom folders
    let reg_games = scan_inno_and_repack_uninstall_registry(&mut seen_paths);
    discovered.extend(reg_games);

    discovered
}
