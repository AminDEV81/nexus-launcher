use crate::commands::save_manager::fs_ops::expand_save_path;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedSaveLocation {
    pub path: String,
    pub location_type: String,
    pub confidence: i64,
    pub exists: bool,
}

pub struct SaveDetector;

impl SaveDetector {
    /// Detects potential save locations on the current system using comprehensive heuristics
    /// including Unity LocalLow deep scan, Steam emulator paths, and file presence verification.
    pub fn detect_save_locations(
        game_title: &str,
        steam_app_id: Option<u32>,
        game_exe_path: Option<&Path>,
    ) -> Vec<DetectedSaveLocation> {
        let mut candidates = Vec::new();
        let sanitized_title = game_title
            .chars()
            .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '_' || *c == '-')
            .collect::<String>()
            .trim()
            .to_string();

        let no_spaces_title = sanitized_title.replace(' ', "");
        let title_lower = sanitized_title.to_lowercase();
        let title_no_spaces_lower = no_spaces_title.to_lowercase();

        // If steam_app_id wasn't provided, try auto-detecting it from game directory
        let initial_app_id = steam_app_id.or_else(|| {
            game_exe_path.and_then(Self::detect_steam_app_id_from_exe)
        });

        // 0. Primary Save Database Lookup (PCGamingWiki / Ludusavi Save Manifest - 19,250+ PC Games)
        let manifest_result = crate::commands::save_manager::manifest::ManifestEngine::search_manifest(
            game_title,
            initial_app_id,
            game_exe_path,
        );

        let effective_app_id = initial_app_id.or(manifest_result.steam_id);
        candidates.extend(manifest_result.locations);

        // 1. Steam UserData remote path (if app_id provided or detected)
        if let Some(app_id) = effective_app_id {
            let steam_userdata = PathBuf::from("C:\\Program Files (x86)\\Steam\\userdata");
            if steam_userdata.exists() {
                if let Ok(entries) = fs::read_dir(&steam_userdata) {
                    for entry in entries.flatten() {
                        let remote_path = entry.path().join(app_id.to_string()).join("remote");
                        let exists = remote_path.exists();
                        let has_files = exists && Self::is_actual_save_dir(&remote_path);
                        candidates.push(DetectedSaveLocation {
                            path: remote_path.to_string_lossy().to_string(),
                            location_type: "save".to_string(),
                            confidence: if has_files { 100 } else if exists { 95 } else { 60 },
                            exists,
                        });
                    }
                }
            }

            // Steam Emulator Paths: RUNE, CODEX, Goldberg, FLT
            let emu_candidates = vec![
                format!("C:\\Users\\Public\\Documents\\Steam\\RUNE\\{}\\remote", app_id),
                format!("C:\\Users\\Public\\Documents\\Steam\\RUNE\\{}", app_id),
                format!("C:\\Users\\Public\\Documents\\Steam\\CODEX\\{}", app_id),
                format!("%LOCALAPPDATA%\\Steam\\CODEX\\{}", app_id),
                format!("%APPDATA%\\Goldberg SteamEmu Saves\\{}\\remote", app_id),
                format!("%APPDATA%\\Goldberg SteamEmu Saves\\{}", app_id),
                format!("%APPDATA%\\FLT\\{}", app_id),
            ];

            for raw in emu_candidates {
                let p = expand_save_path(&raw);
                let exists = p.exists();
                let has_files = exists && Self::is_actual_save_dir(&p);

                let confidence = if has_files {
                    100
                } else if exists {
                    75
                } else {
                    55
                };

                candidates.push(DetectedSaveLocation {
                    path: raw,
                    location_type: "save".to_string(),
                    confidence,
                    exists,
                });
            }
        }

        // 2. Unity LocalLow Deep Scan (%USERPROFILE%\AppData\LocalLow\<Company>\<Title>\...)
        if let Some(home) = dirs::home_dir() {
            let local_low = home.join("AppData").join("LocalLow");
            if local_low.is_dir() {
                if let Ok(companies) = fs::read_dir(&local_low) {
                    for company_entry in companies.flatten() {
                        let company_path = company_entry.path();
                        if !company_path.is_dir() {
                            continue;
                        }
                        let company_name = company_entry.file_name().to_string_lossy().to_string();

                        if let Ok(products) = fs::read_dir(&company_path) {
                            for prod_entry in products.flatten() {
                                let prod_path = prod_entry.path();
                                if !prod_path.is_dir() {
                                    continue;
                                }

                                let prod_name = prod_entry.file_name().to_string_lossy().to_string();
                                let prod_lower = prod_name.to_lowercase();

                                let matches = prod_lower == title_lower
                                    || prod_lower == title_no_spaces_lower
                                    || (title_lower.len() >= 3 && prod_lower.contains(&title_lower))
                                    || (!title_no_spaces_lower.is_empty() && prod_lower.contains(&title_no_spaces_lower));

                                if matches {
                                    // Check for nested saves folder
                                    let mut found_nested_save = false;
                                    for sub in &["saves", "Save", "save", "SaveGames", "Saved"] {
                                        let sub_path = prod_path.join(sub);
                                        if sub_path.is_dir() {
                                            found_nested_save = true;
                                            let raw_path = format!(
                                                "%USERPROFILE%\\AppData\\LocalLow\\{}\\{}\\{}",
                                                company_name, prod_name, sub
                                            );
                                            let has_files = Self::dir_has_files(&sub_path);
                                            candidates.push(DetectedSaveLocation {
                                                path: raw_path,
                                                location_type: "save".to_string(),
                                                confidence: if has_files { 99 } else { 90 },
                                                exists: true,
                                            });
                                        }
                                    }

                                    if !found_nested_save {
                                        let raw_parent = format!(
                                            "%USERPROFILE%\\AppData\\LocalLow\\{}\\{}",
                                            company_name, prod_name
                                        );
                                        let has_files = Self::is_actual_save_dir(&prod_path);
                                        candidates.push(DetectedSaveLocation {
                                            path: raw_parent,
                                            location_type: "save".to_string(),
                                            confidence: if has_files { 95 } else { 80 },
                                            exists: true,
                                        });
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // 3. Windows Standard: %USERPROFILE%\Saved Games\<title>
        let saved_games_raw = format!("%USERPROFILE%\\Saved Games\\{}", sanitized_title);
        let saved_games_path = expand_save_path(&saved_games_raw);
        let exists = saved_games_path.exists();
        let has_files = exists && Self::dir_has_files(&saved_games_path);
        candidates.push(DetectedSaveLocation {
            path: saved_games_raw,
            location_type: "save".to_string(),
            confidence: if has_files { 95 } else if exists { 80 } else { 50 },
            exists,
        });

        // 4. Documents: %DOCUMENTS%\My Games\<title>
        let my_games_raw = format!("%DOCUMENTS%\\My Games\\{}", sanitized_title);
        let my_games_path = expand_save_path(&my_games_raw);
        let exists = my_games_path.exists();
        let has_files = exists && Self::dir_has_files(&my_games_path);
        candidates.push(DetectedSaveLocation {
            path: my_games_raw,
            location_type: "save".to_string(),
            confidence: if has_files { 95 } else if exists { 80 } else { 50 },
            exists,
        });

        // 5. Unreal Engine Standard: %LOCALAPPDATA%\<title>\Saved\SaveGames
        let ue_raw = format!("%LOCALAPPDATA%\\{}\\Saved\\SaveGames", no_spaces_title);
        let ue_path = expand_save_path(&ue_raw);
        let exists = ue_path.exists();
        let has_files = exists && Self::dir_has_files(&ue_path);
        candidates.push(DetectedSaveLocation {
            path: ue_raw,
            location_type: "save".to_string(),
            confidence: if has_files { 95 } else if exists { 80 } else { 45 },
            exists,
        });

        // 6. Direct LocalLow: %USERPROFILE%\AppData\LocalLow\<title>
        let unity_raw = format!("%USERPROFILE%\\AppData\\LocalLow\\{}", sanitized_title);
        let unity_path = expand_save_path(&unity_raw);
        let exists = unity_path.exists();
        let has_files = exists && Self::dir_has_files(&unity_path);
        candidates.push(DetectedSaveLocation {
            path: unity_raw,
            location_type: "save".to_string(),
            confidence: if has_files { 90 } else if exists { 70 } else { 40 },
            exists,
        });

        // 7. Roaming AppData: %APPDATA%\<title>
        let roaming_raw = format!("%APPDATA%\\{}", sanitized_title);
        let roaming_path = expand_save_path(&roaming_raw);
        let exists = roaming_path.exists();
        let has_files = exists && Self::dir_has_files(&roaming_path);
        candidates.push(DetectedSaveLocation {
            path: roaming_raw,
            location_type: "save".to_string(),
            confidence: if has_files { 90 } else if exists { 70 } else { 35 },
            exists,
        });

        // 8. In-Game Directory Saves (Portable / DRM-free saves, Call of Duty, etc.)
        if let Some(exe) = game_exe_path {
            if let Some(game_dir) = exe.parent() {
                for sub in &[
                    "saves",
                    "save",
                    "SaveGames",
                    "Profile",
                    "players",
                    "players2",
                    "profiles",
                    "profile",
                ] {
                    let sub_p = game_dir.join(sub);
                    if sub_p.is_dir() {
                        let has_f = Self::is_actual_save_dir(&sub_p);
                        candidates.push(DetectedSaveLocation {
                            path: sub_p.to_string_lossy().to_string(),
                            location_type: "save".to_string(),
                            confidence: if has_f { 100 } else { 80 },
                            exists: true,
                        });
                    }
                }
            }
        }

        // Deduplicate candidates by normalized canonical path
        let mut seen = HashSet::new();
        let mut deduped: Vec<DetectedSaveLocation> = Vec::new();

        for c in candidates {
            let norm_key = expand_save_path(&c.path)
                .to_string_lossy()
                .trim()
                .trim_end_matches(['/', '\\'])
                .replace('/', "\\")
                .to_lowercase();

            if norm_key.is_empty() {
                continue;
            }

            if seen.insert(norm_key) {
                deduped.push(c);
            }
        }

        // Subpath elimination:
        // If a candidate B is an internal subdirectory of candidate A (e.g. A\save inside A),
        // and A is not a generic root, candidate B is redundant and should be omitted.
        let mut final_candidates: Vec<DetectedSaveLocation> = Vec::new();
        for (i, a) in deduped.iter().enumerate() {
            let a_norm = expand_save_path(&a.path)
                .to_string_lossy()
                .trim()
                .trim_end_matches(['/', '\\'])
                .replace('/', "\\")
                .to_lowercase();

            let is_subpath_of_other = deduped.iter().enumerate().any(|(j, other)| {
                if i == j {
                    return false;
                }
                let other_norm = expand_save_path(&other.path)
                    .to_string_lossy()
                    .trim()
                    .trim_end_matches(['/', '\\'])
                    .replace('/', "\\")
                    .to_lowercase();

                if Self::is_generic_root_path(&other_norm) {
                    return false;
                }

                a_norm.starts_with(&format!("{other_norm}\\"))
            });

            if !is_subpath_of_other {
                final_candidates.push(a.clone());
            }
        }

        // Sort candidates:
        // 1. Existing paths with actual save files on disk
        // 2. Existing empty directories
        // 3. Theoretical candidate paths by confidence descending
        final_candidates.sort_by(|a, b| {
            let a_is_config = a.location_type == "config" || a.path.to_lowercase().contains("config");
            let b_is_config = b.location_type == "config" || b.path.to_lowercase().contains("config");

            a_is_config
                .cmp(&b_is_config)
                .then_with(|| {
                    let a_expanded = expand_save_path(&a.path);
                    let b_expanded = expand_save_path(&b.path);
                    let a_has_saves = a.exists && Self::is_actual_save_dir(&a_expanded);
                    let b_has_saves = b.exists && Self::is_actual_save_dir(&b_expanded);

                    b_has_saves
                        .cmp(&a_has_saves)
                        .then_with(|| b.exists.cmp(&a.exists))
                        .then_with(|| b.confidence.cmp(&a.confidence))
                })
        });

        final_candidates
    }

    pub fn is_generic_root_path(norm: &str) -> bool {
        let p = norm.trim_end_matches('\\');
        p.ends_with(':')
            || p.ends_with("\\saved games")
            || p.ends_with("\\documents")
            || p.ends_with("\\my games")
            || p.ends_with("\\appdata\\local")
            || p.ends_with("\\appdata\\locallow")
            || p.ends_with("\\appdata\\roaming")
            || p.ends_with("\\steam\\userdata")
    }

    /// Checks if a directory contains real save files (ignoring logs, dumps, configs, and pure emulator metadata)
    pub fn is_actual_save_dir(path: &Path) -> bool {
        let p_lower = path.to_string_lossy().to_lowercase();
        if p_lower.contains("\\config\\")
            || p_lower.ends_with("\\config")
            || p_lower.contains("\\crashes\\")
            || p_lower.ends_with("\\crashes")
            || p_lower.contains("\\logs\\")
            || p_lower.ends_with("\\logs")
        {
            return false;
        }
        Self::has_actual_save_files_recursive(path, 0)
    }

    fn is_ignored_save_file(name: &str) -> bool {
        name.ends_with(".log")
            || name.ends_with(".tmp")
            || name.ends_with(".bak")
            || name.ends_with(".dmp")
            || name.ends_with(".crash")
            || name.ends_with(".exe")
            || name.ends_with(".dll")
            || name.ends_with(".runtime-xml")
            || name.ends_with(".ushaderprecache")
            || name.ends_with(".upipelinecache")
            || name.ends_with(".cache")
            || name.ends_with(".pipelinecache")
            || name == "achievements.ini"
            || name == "leaderboards.ini"
            || name == "stats.ini"
            || name == "filemappings.ini"
            || name == "steam_autocloud.vdf"
            || name == "gameusersettings.ini"
            || name == "engine.ini"
            || name == "scalability.ini"
            || name == "input.ini"
            || name == "compat.ini"
            || name == "manifest.ini"
            || name == "crashreportclient.ini"
            || name == "dxvk.conf"
            || name == "graphics.ini"
            || name == "settings.ini"
            || name == "system.ini"
            || name == "usersettings.json"
            || name == "crashinfo.json"
    }

    fn has_actual_save_files_recursive(path: &Path, depth: u32) -> bool {
        if depth > 4 || !path.exists() {
            return false;
        }
        let p_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_lowercase();
        if p_name == "config"
            || p_name == "crashes"
            || p_name == "logs"
            || p_name == "crashreportclient"
            || p_name == "windows" && depth > 0
        {
            return false;
        }
        if path.is_file() {
            let name = p_name;
            return !Self::is_ignored_save_file(&name)
                && fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false);
        }
        if let Ok(entries) = fs::read_dir(path) {
            for entry in entries.flatten() {
                let p = entry.path();
                let name = entry.file_name().to_string_lossy().to_lowercase();
                if p.is_dir() {
                    if Self::has_actual_save_files_recursive(&p, depth + 1) {
                        return true;
                    }
                } else if !Self::is_ignored_save_file(&name)
                    && fs::metadata(&p).map(|m| m.len() > 0).unwrap_or(false)
                {
                    return true;
                }
            }
        }
        false
    }

    /// Checks if a directory exists and contains at least one non-empty file or subdirectory.
    pub fn dir_has_files(path: &Path) -> bool {
        if !path.exists() {
            return false;
        }
        if path.is_file() {
            return fs::metadata(path).map(|m| m.len() > 0).unwrap_or(false);
        }
        if let Ok(mut entries) = fs::read_dir(path) {
            entries.next().is_some()
        } else {
            false
        }
    }

    /// Tries to auto-detect Steam AppId from files near the game executable.
    pub fn detect_steam_app_id_from_exe(exe_path: &Path) -> Option<u32> {
        let game_dir = exe_path.parent()?;

        // Direct files in game dir
        let direct_appid = game_dir.join("steam_appid.txt");
        if let Some(id) = Self::read_appid_from_file(&direct_appid) {
            return Some(id);
        }

        let settings_appid = game_dir.join("steam_settings").join("steam_appid.txt");
        if let Some(id) = Self::read_appid_from_file(&settings_appid) {
            return Some(id);
        }

        let direct_ini = game_dir.join("steam_emu.ini");
        if let Some(id) = Self::read_appid_from_ini(&direct_ini) {
            return Some(id);
        }

        // Scan subdirectories 2 levels deep for steam_emu.ini or steam_api.ini
        if let Ok(entries) = fs::read_dir(game_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    // Check direct children
                    let sub_ini = p.join("steam_emu.ini");
                    if let Some(id) = Self::read_appid_from_ini(&sub_ini) {
                        return Some(id);
                    }
                    let sub_appid = p.join("steam_appid.txt");
                    if let Some(id) = Self::read_appid_from_file(&sub_appid) {
                        return Some(id);
                    }

                    // Check second level (e.g. Replaced_Data/Plugins/x86_64/steam_emu.ini)
                    if let Ok(sub_entries) = fs::read_dir(&p) {
                        for sub_entry in sub_entries.flatten() {
                            let sp = sub_entry.path();
                            if sp.is_dir() {
                                let nested_ini = sp.join("steam_emu.ini");
                                if let Some(id) = Self::read_appid_from_ini(&nested_ini) {
                                    return Some(id);
                                }
                                let nested_api = sp.join("steam_api.ini");
                                if let Some(id) = Self::read_appid_from_ini(&nested_api) {
                                    return Some(id);
                                }

                                // Third level
                                if let Ok(third_entries) = fs::read_dir(&sp) {
                                    for third_entry in third_entries.flatten() {
                                        let tp = third_entry.path();
                                        if tp.is_dir() {
                                            let deep_ini = tp.join("steam_emu.ini");
                                            if let Some(id) = Self::read_appid_from_ini(&deep_ini) {
                                                return Some(id);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        None
    }

    fn read_appid_from_file(path: &Path) -> Option<u32> {
        if path.is_file() {
            if let Ok(content) = fs::read_to_string(path) {
                if let Ok(val) = content.trim().parse::<u32>() {
                    return Some(val);
                }
            }
        }
        None
    }

    fn read_appid_from_ini(path: &Path) -> Option<u32> {
        if path.is_file() {
            if let Ok(content) = fs::read_to_string(path) {
                for line in content.lines() {
                    let trimmed = line.trim();
                    if trimmed.starts_with(';') || trimmed.starts_with('#') {
                        continue;
                    }
                    let lower = trimmed.to_lowercase();
                    if lower.starts_with("appid") || lower.starts_with("steamappid") {
                        if let Some((_, val_str)) = trimmed.split_once('=') {
                            if let Ok(val) = val_str.trim().parse::<u32>() {
                                return Some(val);
                            }
                        }
                    }
                }
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;

    #[test]
    fn test_detect_save_locations_basic() {
        let candidates = SaveDetector::detect_save_locations("Test Game", None, None);
        assert!(!candidates.is_empty());
        assert!(candidates.iter().any(|c| c.path.contains("Saved Games")));
        assert!(candidates.iter().any(|c| c.path.contains("My Games")));
    }

    #[test]
    fn test_detect_steam_appid_from_ini() {
        let temp_dir = std::env::temp_dir().join(format!("nexus_test_emu_{}", uuid::Uuid::new_v4()));
        let sub_dir = temp_dir.join("Data").join("Plugins");
        fs::create_dir_all(&sub_dir).unwrap();

        let ini_path = sub_dir.join("steam_emu.ini");
        let mut f = File::create(&ini_path).unwrap();
        writeln!(f, "# Config file").unwrap();
        writeln!(f, "AppId = 1663850").unwrap();

        let fake_exe = temp_dir.join("game.exe");
        let detected = SaveDetector::detect_steam_app_id_from_exe(&fake_exe);
        assert_eq!(detected, Some(1663850));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_detect_replaced_unity() {
        let exe = Path::new(r"D:\Games\Replaced\Replaced.exe");
        let candidates = SaveDetector::detect_save_locations("Replaced", None, Some(exe));
        let home = dirs::home_dir().unwrap();
        let target = home.join("AppData").join("LocalLow").join("SadCatStudios").join("Replaced").join("saves");
        if target.exists() {
            assert!(candidates.iter().any(|c| c.path.contains("SadCatStudios") && c.path.contains("saves")));
            let first = &candidates[0];
            assert!(first.path.contains("SadCatStudios"));
            assert!(first.confidence >= 90);
            assert!(first.exists);
        }
    }

    #[test]
    fn test_detect_call_of_duty() {
        let exe = Path::new(r"D:\Games\Call of Duty- Modern Warfare 2\MW2CR\h2-mod.exe");
        let candidates = SaveDetector::detect_save_locations("Call of Duty: Modern Warfare 2", None, Some(exe));
        assert!(!candidates.is_empty());
        assert!(candidates.iter().any(|c| c.path.contains("players")));
        let top = &candidates[0];
        assert_eq!(top.confidence, 100);
        assert!(top.exists);
    }

    #[test]
    fn test_detect_pes_2018() {
        let candidates = SaveDetector::detect_save_locations("Pro Evolution Soccer 2018", None, None);
        assert!(!candidates.is_empty());
        assert!(candidates.iter().any(|c| c.path.contains("KONAMI")));
        let top = &candidates[0];
        assert_eq!(top.confidence, 100);
        assert!(top.exists);
    }
}

