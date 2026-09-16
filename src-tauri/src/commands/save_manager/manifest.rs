use crate::commands::save_manager::detector::{DetectedSaveLocation, SaveDetector};
use crate::commands::save_manager::fs_ops::expand_save_path;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestGameEntry {
    #[serde(default)]
    pub paths: Vec<String>,
    #[serde(rename = "steamId", default)]
    pub steam_id: Option<u32>,
}

pub type ManifestDatabase = HashMap<String, ManifestGameEntry>;

static MANIFEST_DB: OnceLock<ManifestDatabase> = OnceLock::new();

#[derive(Debug, Clone, Default)]
pub struct ManifestSearchResult {
    #[allow(dead_code)]
    pub matched_title: Option<String>,
    pub steam_id: Option<u32>,
    pub locations: Vec<DetectedSaveLocation>,
}

pub struct ManifestEngine;

impl ManifestEngine {
    /// Returns a reference to the loaded game save database (19,000+ PC games).
    pub fn get_database() -> &'static ManifestDatabase {
        MANIFEST_DB.get_or_init(|| {
            // 1. Check AppData for user-updated manifest
            if let Some(appdata) = dirs::config_dir() {
                let user_manifest = appdata.join("com.nexus.launcher").join("save_manifest.json");
                if user_manifest.is_file() {
                    if let Ok(content) = fs::read_to_string(&user_manifest) {
                        if let Ok(parsed) = serde_json::from_str::<ManifestDatabase>(&content) {
                            log::info!("Loaded {} games from AppData save_manifest.json", parsed.len());
                            return parsed;
                        }
                    }
                }
            }

            // 2. Embedded bundled manifest (19,250 games)
            const EMBEDDED: &str = include_str!("../../../resources/save_manifest.json");
            match serde_json::from_str::<ManifestDatabase>(EMBEDDED) {
                Ok(parsed) => {
                    log::info!("Loaded {} games from bundled save_manifest.json", parsed.len());
                    parsed
                }
                Err(e) => {
                    log::error!("Failed to parse embedded save_manifest.json: {}", e);
                    HashMap::new()
                }
            }
        })
    }

    /// Searches the manifest for a single best-matching game entry and returns its candidates and steam_id.
    pub fn search_manifest(
        game_title: &str,
        steam_app_id: Option<u32>,
        game_exe_path: Option<&Path>,
    ) -> ManifestSearchResult {
        let db = Self::get_database();

        let mut matched_title: Option<String> = None;
        let mut matched_entry: Option<&ManifestGameEntry> = None;

        // 1. Exact Steam App ID match
        if let Some(app_id) = steam_app_id {
            for (title, entry) in db {
                if entry.steam_id == Some(app_id) {
                    matched_title = Some(title.clone());
                    matched_entry = Some(entry);
                    break;
                }
            }
        }

        let norm_input = normalize_title(game_title);

        // 2. Exact Title Match
        if matched_entry.is_none() && !norm_input.is_empty() {
            for (title, entry) in db {
                let norm_db = normalize_title(title);
                if norm_db == norm_input {
                    matched_title = Some(title.clone());
                    matched_entry = Some(entry);
                    break;
                }
            }
        }

        // 3. Exact Match with Roman Numerals / Numbers normalized (e.g. "ii" <-> "2")
        if matched_entry.is_none() && !norm_input.is_empty() {
            let alt_input = normalize_roman_numerals(&norm_input);
            for (title, entry) in db {
                let norm_db = normalize_title(title);
                let alt_db = normalize_roman_numerals(&norm_db);
                if alt_db == alt_input || norm_db == alt_input || alt_db == norm_input {
                    matched_title = Some(title.clone());
                    matched_entry = Some(entry);
                    break;
                }
            }
        }

        // 4. Token Overlap Matching (picks the SINGLE best match above 0.70 threshold)
        if matched_entry.is_none() && !norm_input.is_empty() {
            let input_words: Vec<&str> = norm_input.split_whitespace().collect();
            let mut best_score = 0.0f32;
            let mut best_candidate: Option<(&String, &ManifestGameEntry)> = None;

            for (title, entry) in db {
                let norm_db = normalize_title(title);
                let db_words: Vec<&str> = norm_db.split_whitespace().collect();
                if db_words.is_empty() || input_words.is_empty() {
                    continue;
                }

                let common_count = input_words
                    .iter()
                    .filter(|w| db_words.contains(w))
                    .count();

                let max_len = input_words.len().max(db_words.len());
                let score = common_count as f32 / max_len as f32;

                if score >= 0.70 && score > best_score {
                    best_score = score;
                    best_candidate = Some((title, entry));
                }
            }

            if let Some((title, entry)) = best_candidate {
                matched_title = Some(title.clone());
                matched_entry = Some(entry);
            }
        }

        let entry = match matched_entry {
            Some(e) => e,
            None => return ManifestSearchResult::default(),
        };

        let mut candidates = Vec::new();
        let mut seen_paths = HashSet::new();

        for raw_tmpl in &entry.paths {
            let expanded_candidates = Self::expand_manifest_path(raw_tmpl, game_exe_path);
            for cand in expanded_candidates {
                let clean_cand = clean_manifest_path(&cand);
                if clean_cand.is_empty() {
                    continue;
                }

                let norm_cand = expand_save_path(&clean_cand)
                    .to_string_lossy()
                    .trim()
                    .trim_end_matches(['/', '\\'])
                    .replace('/', "\\")
                    .to_lowercase();

                if norm_cand.is_empty() || !seen_paths.insert(norm_cand) {
                    continue;
                }

                let p = expand_save_path(&clean_cand);
                let exists = p.exists();
                let has_files = exists && (p.is_file() || SaveDetector::dir_has_files(&p));

                // Prefer actual save directories over configuration files
                let is_config = clean_cand.to_lowercase().contains("config")
                    || clean_cand.ends_with(".ini")
                    || clean_cand.ends_with(".cfg")
                    || clean_cand.ends_with(".lua");

                let confidence = if has_files && !is_config {
                    100
                } else if exists && !is_config {
                    95
                } else if !is_config {
                    90
                } else if has_files {
                    60
                } else if exists {
                    45
                } else {
                    30
                };

                candidates.push(DetectedSaveLocation {
                    path: clean_cand,
                    location_type: if is_config { "config".to_string() } else { "save".to_string() },
                    confidence,
                    exists,
                });
            }
        }

        // Sort candidates so real save locations with files come first, config comes last
        candidates.sort_by(|a, b| {
            let a_is_config = a.location_type == "config";
            let b_is_config = b.location_type == "config";

            a_is_config
                .cmp(&b_is_config)
                .then_with(|| {
                    let a_p = expand_save_path(&a.path);
                    let b_p = expand_save_path(&b.path);
                    let a_has = a.exists && (a_p.is_file() || SaveDetector::is_actual_save_dir(&a_p));
                    let b_has = b.exists && (b_p.is_file() || SaveDetector::is_actual_save_dir(&b_p));

                    let a_p_lower = a.path.to_lowercase();
                    let b_p_lower = b.path.to_lowercase();
                    let a_is_save_named = a_p_lower.contains("saved games") || a_p_lower.contains("savegames") || a_p_lower.contains("\\saves") || a_p_lower.contains("\\save");
                    let b_is_save_named = b_p_lower.contains("saved games") || b_p_lower.contains("savegames") || b_p_lower.contains("\\saves") || b_p_lower.contains("\\save");

                    b_has
                        .cmp(&a_has)
                        .then_with(|| b_is_save_named.cmp(&a_is_save_named))
                        .then_with(|| b.exists.cmp(&a.exists))
                        .then_with(|| b.confidence.cmp(&a.confidence))
                })
        });

        ManifestSearchResult {
            matched_title,
            steam_id: entry.steam_id,
            locations: candidates,
        }
    }

    /// Queries the manifest database for known save paths for a game.
    #[allow(dead_code)]
    pub fn find_save_locations(
        game_title: &str,
        steam_app_id: Option<u32>,
        game_exe_path: Option<&Path>,
    ) -> Vec<DetectedSaveLocation> {
        Self::search_manifest(game_title, steam_app_id, game_exe_path).locations
    }

    /// Expands template tokens like <base>, <winDocuments>, <winAppData>, <winLocalAppData>, <winSavedGames>, <home>, <winPublic>, and <storeUserId>.
    fn expand_manifest_path(tmpl: &str, game_exe_path: Option<&Path>) -> Vec<String> {
        let mut base_expanded = tmpl.to_string();

        // Replace standard Windows folder placeholders
        base_expanded = base_expanded.replace("<winDocuments>", "%DOCUMENTS%");
        base_expanded = base_expanded.replace("<winAppData>", "%APPDATA%");
        base_expanded = base_expanded.replace("<winLocalAppData>", "%LOCALAPPDATA%");
        base_expanded = base_expanded.replace("<winSavedGames>", "%USERPROFILE%\\Saved Games");
        base_expanded = base_expanded.replace("<winPublic>", "%PUBLIC%");
        base_expanded = base_expanded.replace("<winProgramData>", "%PROGRAMDATA%");
        base_expanded = base_expanded.replace("<winDir>", "%WINDIR%");
        base_expanded = base_expanded.replace("<home>", "%USERPROFILE%");
        base_expanded = base_expanded.replace("<root>", "%USERPROFILE%");
        base_expanded = base_expanded.replace("<xdgConfig>", "%APPDATA%");
        base_expanded = base_expanded.replace("<xdgData>", "%LOCALAPPDATA%");

        let username = std::env::var("USERNAME").unwrap_or_else(|_| "user".into());
        base_expanded = base_expanded.replace("<osUserName>", &username);

        // Replace <base> with game executable directory
        if base_expanded.contains("<base>") {
            if let Some(exe) = game_exe_path {
                if let Some(game_dir) = exe.parent() {
                    base_expanded = base_expanded.replace("<base>", &game_dir.to_string_lossy());
                } else {
                    return Vec::new();
                }
            } else {
                return Vec::new();
            }
        }

        // Normalize forward slashes to backslashes
        base_expanded = base_expanded.replace('/', "\\");

        // Handle <storeUserId>
        if base_expanded.contains("<storeUserId>") {
            let mut results = Vec::new();
            if let Some((prefix, suffix)) = base_expanded.split_once("<storeUserId>") {
                let clean_prefix = clean_manifest_path(prefix);
                let clean_suffix = clean_manifest_path(suffix);
                let prefix_path = expand_save_path(&clean_prefix);

                // Add the parent folder as primary candidate
                results.push(clean_prefix.clone());

                // Only expand subfolders if there is a non-empty suffix (e.g. <storeUserId>/save_data)
                // If suffix is empty, clean_prefix already tracks the entire saves folder.
                if !clean_suffix.is_empty() && prefix_path.is_dir() {
                    if let Ok(entries) = fs::read_dir(&prefix_path) {
                        for entry in entries.flatten() {
                            if entry.path().is_dir() {
                                let sub_name = entry.file_name().to_string_lossy().to_string();
                                let full = format!(
                                    "{}\\{}\\{}",
                                    clean_prefix,
                                    sub_name,
                                    clean_suffix.trim_start_matches('\\')
                                );
                                results.push(clean_manifest_path(&full));
                            }
                        }
                    }
                }
            }
            results
        } else {
            vec![clean_manifest_path(&base_expanded)]
        }
    }
}

/// Strips trailing file wildcards (e.g. \*.sav, \*.*, \*.cfg) so save directories are tracked directly.
pub fn clean_manifest_path(path: &str) -> String {
    let mut p = path.replace('/', "\\");
    if let Some((dir, _)) = p.rsplit_once("\\*") {
        p = dir.to_string();
    }
    p.trim_end_matches('\\').to_string()
}

/// Normalizes a game title by removing special characters, punctuation, and casing for fuzzy matching.
pub fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Helper to normalize roman numerals (e.g. "ii" to "2") for title equivalence.
fn normalize_roman_numerals(s: &str) -> String {
    s.replace(" iii", " 3")
        .replace(" ii", " 2")
        .replace(" iv", " 4")
        .replace(" vi", " 6")
        .replace(" v", " 5")
        .replace(" 3", " iii")
        .replace(" 2", " ii")
}
