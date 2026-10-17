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

/// Curated verified save database for flagship modern & classic PC games (2015–2026),
/// including Steam, Epic, GOG, Rockstar, Ubisoft, and common local/portable save paths.
fn curated_verified_save_entries() -> Vec<(&'static str, Option<u32>, Vec<&'static str>)> {
    vec![
        (
            "Elden Ring",
            Some(1245620),
            vec![
                "<winAppData>/EldenRing",
                "<winAppData>/Goldberg SteamEmu Saves/1245620/remote",
            ],
        ),
        (
            "Dark Souls III",
            Some(374320),
            vec!["<winAppData>/DarkSoulsIII"],
        ),
        (
            "Dark Souls II: Scholar of the First Sin",
            Some(335300),
            vec!["<winAppData>/DarkSoulsII"],
        ),
        (
            "Dark Souls: Remastered",
            Some(570940),
            vec!["<winDocuments>/NBGI/DARK SOULS REMASTERED"],
        ),
        (
            "Sekiro: Shadows Die Twice",
            Some(814380),
            vec!["<winAppData>/Sekiro"],
        ),
        (
            "Armored Core VI: Fires of Rubicon",
            Some(1888160),
            vec!["<winAppData>/ArmoredCore6"],
        ),
        (
            "The Witcher 3: Wild Hunt",
            Some(292030),
            vec![
                "<winDocuments>/The Witcher 3/gamesaves",
                "<winSavedGames>/CD Projekt Red/The Witcher 3",
            ],
        ),
        (
            "Cyberpunk 2077",
            Some(1091500),
            vec!["<winSavedGames>/CD Projekt Red/Cyberpunk 2077"],
        ),
        (
            "Baldur's Gate 3",
            Some(1086940),
            vec![
                "<winLocalAppData>/Larian Studios/Baldur's Gate 3/PlayerProfiles/Public/Savegames/Story",
                "<winLocalAppData>/Larian Studios/Baldur's Gate 3/PlayerProfiles",
            ],
        ),
        (
            "Divinity: Original Sin 2",
            Some(435150),
            vec![
                "<winDocuments>/Larian Studios/Divinity Original Sin 2 Definitive Edition/PlayerProfiles",
            ],
        ),
        (
            "Red Dead Redemption 2",
            Some(1174180),
            vec![
                "<winDocuments>/Rockstar Games/Red Dead Redemption 2/Profiles",
                "<winAppData>/Goldberg SocialClub Emu Saves/Red Dead Redemption 2",
                "<winAppData>/.1911/Red Dead Redemption 2/profile",
            ],
        ),
        (
            "Red Dead Redemption",
            Some(2668510),
            vec![
                "<winDocuments>/Rockstar Games/Red Dead Redemption/Profiles",
                "<winAppData>/Goldberg SocialClub Emu Saves/Red Dead Redemption",
            ],
        ),
        (
            "Grand Theft Auto V",
            Some(271590),
            vec![
                "<winDocuments>/Rockstar Games/GTA V/Profiles",
                "<winDocuments>/Rockstar Games/GTAV Enhanced/Profiles",
                "<winAppData>/Goldberg SocialClub Emu Saves/GTA V",
            ],
        ),
        (
            "God of War",
            Some(1593500),
            vec!["<winSavedGames>/God of War"],
        ),
        (
            "God of War Ragnarök",
            Some(2322010),
            vec![
                "<winSavedGames>/God of War Ragnarök",
                "<winSavedGames>/God of War Ragnarok",
            ],
        ),
        (
            "Ghost of Tsushima",
            Some(2215430),
            vec![
                "<winDocuments>/Ghost of Tsushima DIRECTOR'S CUT",
                "<winDocuments>/Ghost of Tsushima",
            ],
        ),
        (
            "Horizon Zero Dawn",
            Some(1151640),
            vec![
                "<winDocuments>/Horizon Zero Dawn/Saved Game",
                "<winDocuments>/Horizon Zero Dawn Remastered",
            ],
        ),
        (
            "Horizon Forbidden West",
            Some(2420110),
            vec!["<winDocuments>/Horizon Forbidden West Complete Edition"],
        ),
        (
            "Marvel's Spider-Man",
            Some(1817070),
            vec!["<winDocuments>/Marvel's Spider-Man Remastered"],
        ),
        (
            "Marvel's Spider-Man: Miles Morales",
            Some(1817190),
            vec!["<winDocuments>/Marvel's Spider-Man Miles Morales"],
        ),
        (
            "Marvel's Spider-Man 2",
            Some(2651280),
            vec!["<winDocuments>/Marvel's Spider-Man 2"],
        ),
        (
            "The Last of Us Part I",
            Some(1888930),
            vec!["<winSavedGames>/The Last of Us Part I"],
        ),
        (
            "The Last of Us Part II",
            Some(2531310),
            vec![
                "<winSavedGames>/The Last of Us Part II",
                "<winDocuments>/The Last of Us Part II Remastered",
            ],
        ),
        (
            "Uncharted: Legacy of Thieves Collection",
            Some(1659420),
            vec!["<winSavedGames>/Uncharted Legacy of Thieves Collection"],
        ),
        (
            "Days Gone",
            Some(1259420),
            vec!["<winLocalAppData>/BendGame/Saved"],
        ),
        (
            "Returnal",
            Some(1649240),
            vec!["<winLocalAppData>/Returnal/Steam/Saved/SaveGames"],
        ),
        (
            "Ratchet & Clank: Rift Apart",
            Some(1895880),
            vec!["<winDocuments>/Ratchet & Clank - Rift Apart"],
        ),
        (
            "Black Myth: Wukong",
            Some(2358720),
            vec![
                "<base>/b1/Saved/SaveGames",
                "<winLocalAppData>/b1/Saved/SaveGames",
            ],
        ),
        (
            "Clair Obscur: Expedition 33",
            Some(1903340),
            vec![
                "<winLocalAppData>/Sandfall/Saved/SaveGames",
                "<winLocalAppData>/Expedition33/Saved/SaveGames",
            ],
        ),
        (
            "Silent Hill 2",
            Some(2124490),
            vec!["<winLocalAppData>/SilentHill2/Saved/SaveGames"],
        ),
        (
            "Alan Wake 2",
            None,
            vec!["<winLocalAppData>/Remedy/AlanWake2"],
        ),
        (
            "Control",
            Some(870780),
            vec![
                "<winLocalAppData>/Remedy/Control",
                "<winSavedGames>/Remedy/Control",
            ],
        ),
        (
            "Hogwarts Legacy",
            Some(990080),
            vec![
                "<winLocalAppData>/Hogwarts Legacy/Saved/SaveGames",
                "<winLocalAppData>/Phoenix/Saved/SaveGames",
            ],
        ),
        (
            "Lies of P",
            Some(1627720),
            vec![
                "<base>/LiesofP/Saved/SaveGames",
                "<winLocalAppData>/LiesofP/Saved/SaveGames",
            ],
        ),
        (
            "Palworld",
            Some(1623730),
            vec!["<winLocalAppData>/Pal/Saved/SaveGames"],
        ),
        (
            "Starfield",
            Some(1716740),
            vec!["<winDocuments>/My Games/Starfield/Saves"],
        ),
        (
            "The Elder Scrolls V: Skyrim",
            Some(489830),
            vec![
                "<winDocuments>/My Games/Skyrim Special Edition/Saves",
                "<winDocuments>/My Games/Skyrim/Saves",
            ],
        ),
        (
            "Fallout 4",
            Some(377160),
            vec!["<winDocuments>/My Games/Fallout4/Saves"],
        ),
        (
            "Hollow Knight",
            Some(367520),
            vec!["<winLocalAppDataLow>/Team Cherry/Hollow Knight"],
        ),
        (
            "Hollow Knight: Silksong",
            Some(1030300),
            vec!["<winLocalAppDataLow>/Team Cherry/Hollow Knight Silksong"],
        ),
        (
            "Hades",
            Some(1145360),
            vec!["<winDocuments>/Saved Games/Hades"],
        ),
        (
            "Hades II",
            Some(1145350),
            vec![
                "<winSavedGames>/Hades II",
                "<winDocuments>/Saved Games/Hades II",
            ],
        ),
        (
            "Kingdom Come: Deliverance II",
            Some(1771300),
            vec!["<winSavedGames>/kingdomcome2/saves"],
        ),
        (
            "Kingdom Come: Deliverance",
            Some(379430),
            vec!["<winSavedGames>/kingdomcome/saves"],
        ),
        (
            "Death Stranding",
            Some(1850570),
            vec![
                "<winLocalAppData>/KojimaProductions/DeathStrandingDC",
                "<winLocalAppData>/KojimaProductions/DeathStranding",
            ],
        ),
        (
            "Detroit: Become Human",
            Some(1222140),
            vec!["<winSavedGames>/Quantic Dream/Detroit Become Human"],
        ),
        (
            "NieR: Automata",
            Some(524220),
            vec!["<winDocuments>/My Games/NieR_Automata"],
        ),
        (
            "Persona 5 Royal",
            Some(1687950),
            vec!["<winAppData>/SEGA/P5R/Steam"],
        ),
        (
            "Persona 3 Reload",
            Some(2161700),
            vec!["<winAppData>/SEGA/P3R/Steam"],
        ),
        (
            "Metaphor: ReFantazio",
            Some(2679460),
            vec!["<winAppData>/SEGA/METAPHOR/Steam"],
        ),
        (
            "Final Fantasy VII Remake",
            Some(1462040),
            vec![
                "<winDocuments>/My Games/FINAL FANTASY VII REMAKE/Steam",
                "<winDocuments>/My Games/FINAL FANTASY VII REMAKE/EOS",
            ],
        ),
        (
            "Final Fantasy VII Rebirth",
            Some(2909400),
            vec![
                "<winDocuments>/My Games/FINAL FANTASY VII REBIRTH/Steam",
                "<winDocuments>/My Games/FINAL FANTASY VII REBIRTH",
            ],
        ),
        (
            "Final Fantasy XVI",
            Some(2515020),
            vec![
                "<winDocuments>/My Games/FINAL FANTASY XVI/Steam",
                "<winDocuments>/My Games/FINAL FANTASY XVI",
            ],
        ),
        (
            "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
            Some(1643320),
            vec![
                "<winLocalAppData>/Stalker2/Saved/SaveGames",
                "<winLocalAppData>/GSC Game World/S.T.A.L.K.E.R. 2 Heart of Chornobyl/Saved/SaveGames",
            ],
        ),
        (
            "Indiana Jones and the Great Circle",
            Some(2677660),
            vec![
                "<winSavedGames>/MachineGames/TheGreatCircle",
                "<winAppData>/Goldberg SteamEmu Saves/2677660/remote",
            ],
        ),
        (
            "DOOM Eternal",
            Some(782330),
            vec!["<winSavedGames>/id Software/DOOMEternal/base/savegame"],
        ),
        (
            "DOOM",
            Some(379720),
            vec!["<winSavedGames>/id Software/DOOM/base/savegame"],
        ),
        (
            "Star Wars Jedi: Survivor",
            Some(1774580),
            vec!["<winSavedGames>/Respawn/JediSurvivor"],
        ),
        (
            "Star Wars Jedi: Fallen Order",
            Some(1172380),
            vec!["<winSavedGames>/Respawn/JediFallenOrder"],
        ),
        (
            "Subnautica",
            Some(264710),
            vec!["<winLocalAppDataLow>/Unknown Worlds/Subnautica/Subnautica/SavedGames"],
        ),
        (
            "Stardew Valley",
            Some(413150),
            vec!["<winAppData>/StardewValley/Saves"],
        ),
        (
            "Terraria",
            Some(105600),
            vec!["<winDocuments>/My Games/Terraria/Players"],
        ),
        (
            "Celeste",
            Some(504230),
            vec!["<base>/Saves"],
        ),
        (
            "Undertale",
            Some(391540),
            vec!["<winLocalAppData>/UNDERTALE"],
        ),
        (
            "Stray",
            Some(1332010),
            vec!["<winLocalAppData>/Hk_project/Saved/SaveGames"],
        ),
        (
            "Outer Wilds",
            Some(753640),
            vec!["<winLocalAppDataLow>/Mobius Digital/Outer Wilds/Saves"],
        ),
        (
            "Disco Elysium",
            Some(632470),
            vec!["<winLocalAppDataLow>/ZAUM Studio/Disco Elysium/SaveGames"],
        ),
    ]
}

fn merge_curated_entries(db: &mut ManifestDatabase) {
    for (title, steam_id, raw_paths) in curated_verified_save_entries() {
        let entry = db.entry(title.to_string()).or_insert_with(|| ManifestGameEntry {
            paths: Vec::new(),
            steam_id,
        });
        if entry.steam_id.is_none() && steam_id.is_some() {
            entry.steam_id = steam_id;
        }
        // Prepend curated paths so they have top priority
        let mut combined: Vec<String> = raw_paths.into_iter().map(str::to_string).collect();
        for existing in &entry.paths {
            if !combined.iter().any(|p| p.eq_ignore_ascii_case(existing)) {
                combined.push(existing.clone());
            }
        }
        entry.paths = combined;
    }
}

pub struct ManifestEngine;

impl ManifestEngine {
    /// Returns a reference to the loaded game save database (19,300+ PC games + curated overrides).
    pub fn get_database() -> &'static ManifestDatabase {
        MANIFEST_DB.get_or_init(|| {
            // 1. Check AppData for user-updated manifest
            if let Some(appdata) = dirs::config_dir() {
                let user_manifest = appdata.join("com.nexus.launcher").join("save_manifest.json");
                if user_manifest.is_file() {
                    if let Ok(content) = fs::read_to_string(&user_manifest) {
                        if let Ok(mut parsed) = serde_json::from_str::<ManifestDatabase>(&content) {
                            merge_curated_entries(&mut parsed);
                            log::info!("Loaded {} games from AppData save_manifest.json", parsed.len());
                            return parsed;
                        }
                    }
                }
            }

            // 2. Embedded bundled manifest (19,250+ games) + curated verified overrides
            const EMBEDDED: &str = include_str!("../../../resources/save_manifest.json");
            let mut parsed = match serde_json::from_str::<ManifestDatabase>(EMBEDDED) {
                Ok(map) => map,
                Err(e) => {
                    log::error!("Failed to parse embedded save_manifest.json: {}", e);
                    HashMap::new()
                }
            };
            merge_curated_entries(&mut parsed);
            log::info!("Loaded {} games from bundled save_manifest.json", parsed.len());
            parsed
        })
    }

    /// Searches the manifest for the best-matching game entry and returns its candidates and steam_id.
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
        let core_input = strip_edition_words(&norm_input);

        // 2. Exact Title Match (raw normalized or edition-stripped core title)
        if matched_entry.is_none() && !norm_input.is_empty() {
            for (title, entry) in db {
                let norm_db = normalize_title(title);
                if norm_db == norm_input || (!core_input.is_empty() && norm_db == core_input) {
                    matched_title = Some(title.clone());
                    matched_entry = Some(entry);
                    break;
                }
            }
        }

        // 3. Exact Match with Roman Numerals normalized to Arabic digits (e.g. "iii" -> "3", "ii" -> "2")
        if matched_entry.is_none() && !norm_input.is_empty() {
            let num_input = roman_to_arabic_tokens(&norm_input);
            let num_core = roman_to_arabic_tokens(&core_input);
            for (title, entry) in db {
                let norm_db = normalize_title(title);
                let core_db = strip_edition_words(&norm_db);
                let num_db = roman_to_arabic_tokens(&norm_db);
                let num_core_db = roman_to_arabic_tokens(&core_db);
                if num_db == num_input
                    || (!num_core.is_empty() && (num_db == num_core || num_core_db == num_core))
                {
                    matched_title = Some(title.clone());
                    matched_entry = Some(entry);
                    break;
                }
            }
        }

        // 4. Token Overlap Matching (comparing both raw normalized and edition-stripped core tokens)
        if matched_entry.is_none() && !core_input.is_empty() {
            let num_core = roman_to_arabic_tokens(&core_input);
            let input_words: Vec<&str> = num_core.split_whitespace().collect();
            let mut best_score = 0.0f32;
            let mut best_candidate: Option<(&String, &ManifestGameEntry)> = None;

            for (title, entry) in db {
                let norm_db = roman_to_arabic_tokens(&strip_edition_words(&normalize_title(title)));
                let db_words: Vec<&str> = norm_db.split_whitespace().collect();
                if db_words.is_empty() || input_words.is_empty() {
                    continue;
                }

                // Sequel number guard: if input has a number or db has a number, they must match!
                let input_nums: Vec<&&str> = input_words
                    .iter()
                    .filter(|w| w.chars().all(|c| c.is_ascii_digit()))
                    .collect();
                let db_nums: Vec<&&str> = db_words
                    .iter()
                    .filter(|w| w.chars().all(|c| c.is_ascii_digit()))
                    .collect();
                if input_nums != db_nums {
                    continue;
                }

                let common_count = input_words
                    .iter()
                    .filter(|w| db_words.contains(w))
                    .count();

                let max_len = input_words.len().max(db_words.len());
                let score = common_count as f32 / max_len as f32;

                if score >= 0.72 && score > best_score {
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

                let is_config = clean_cand.to_lowercase().contains("config")
                    || clean_cand.ends_with(".ini")
                    || clean_cand.ends_with(".cfg")
                    || clean_cand.ends_with(".lua");

                let confidence = if has_files && !is_config {
                    100
                } else if exists && !is_config {
                    96
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
                    let a_is_save_named = a_p_lower.contains("saved games")
                        || a_p_lower.contains("savegames")
                        || a_p_lower.contains("\\saves")
                        || a_p_lower.contains("\\save");
                    let b_is_save_named = b_p_lower.contains("saved games")
                        || b_p_lower.contains("savegames")
                        || b_p_lower.contains("\\saves")
                        || b_p_lower.contains("\\save");

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

    #[allow(dead_code)]
    pub fn find_save_locations(
        game_title: &str,
        steam_app_id: Option<u32>,
        game_exe_path: Option<&Path>,
    ) -> Vec<DetectedSaveLocation> {
        Self::search_manifest(game_title, steam_app_id, game_exe_path).locations
    }

    fn expand_manifest_path(tmpl: &str, game_exe_path: Option<&Path>) -> Vec<String> {
        let mut base_expanded = tmpl.to_string();

        base_expanded = base_expanded.replace("<winDocuments>", "%DOCUMENTS%");
        base_expanded = base_expanded.replace("<winAppData>", "%APPDATA%");
        base_expanded = base_expanded.replace("<winLocalAppDataLow>", "%USERPROFILE%\\AppData\\LocalLow");
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

        if base_expanded.contains("<base>") {
            if let Some(exe) = game_exe_path {
                if let Some(game_dir) = Self::resolve_game_root_from_exe(exe) {
                    base_expanded = base_expanded.replace("<base>", &game_dir.to_string_lossy());
                } else {
                    return Vec::new();
                }
            } else {
                return Vec::new();
            }
        }

        base_expanded = base_expanded.replace('/', "\\");

        if base_expanded.contains("<storeUserId>") {
            let mut results = Vec::new();
            if let Some((prefix, suffix)) = base_expanded.split_once("<storeUserId>") {
                let clean_prefix = clean_manifest_path(prefix);
                let clean_suffix = clean_manifest_path(suffix);
                let prefix_path = expand_save_path(&clean_prefix);

                results.push(clean_prefix.clone());

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

    /// Walks up from `Binaries/Win64/Game.exe` or `bin/x64/game.exe` to find the actual root game directory.
    pub fn resolve_game_root_from_exe(exe_path: &Path) -> Option<&Path> {
        let parent = exe_path.parent()?;
        let p_name = parent.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
        if matches!(p_name.as_str(), "win64" | "win32" | "x64" | "x86" | "bin" | "binaries" | "shipping") {
            if let Some(gp) = parent.parent() {
                let gp_name = gp.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                if matches!(gp_name.as_str(), "binaries" | "bin" | "engine") {
                    if let Some(ggp) = gp.parent() {
                        return Some(ggp);
                    }
                }
                return Some(gp);
            }
        }
        Some(parent)
    }
}

pub fn clean_manifest_path(path: &str) -> String {
    let mut p = path.replace('/', "\\");
    if let Some((dir, _)) = p.rsplit_once("\\*") {
        p = dir.to_string();
    }
    p.trim_end_matches('\\').to_string()
}

fn fold_diacritics_char(c: char) -> char {
    match c {
        'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' | 'À' | 'Á' | 'Â' | 'Ã' | 'Ä' | 'Å' => 'a',
        'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => 'e',
        'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => 'i',
        'ò' | 'ó' | 'ô' | 'õ' | 'ö' | 'ø' | 'Ò' | 'Ó' | 'Ô' | 'Õ' | 'Ö' | 'Ø' => 'o',
        'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => 'u',
        'ñ' | 'Ñ' => 'n',
        'ç' | 'Ç' => 'c',
        'ý' | 'ÿ' | 'Ý' => 'y',
        'ł' | 'Ł' => 'l',
        _ => c,
    }
}

/// Normalizes a game title by folding diacritics, removing punctuation, and collapsing whitespace.
pub fn normalize_title(title: &str) -> String {
    title
        .chars()
        .map(fold_diacritics_char)
        .collect::<String>()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ')
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Strips packaging/edition words so "Cyberpunk 2077: Ultimate Edition" matches "Cyberpunk 2077".
pub fn strip_edition_words(norm: &str) -> String {
    const EDITION_STOP: &[&str] = &[
        "edition",
        "deluxe",
        "ultimate",
        "complete",
        "definitive",
        "goty",
        "directors",
        "director",
        "cut",
        "remastered",
        "remaster",
        "anniversary",
        "enhanced",
        "special",
        "digital",
        "repack",
        "fitgirl",
        "dodi",
        "elamigos",
    ];
    let words: Vec<&str> = norm.split_whitespace().collect();
    if words.len() <= 1 {
        return norm.to_string();
    }
    let filtered: Vec<&str> = words
        .iter()
        .enumerate()
        .filter(|&(i, w)| i == 0 || !EDITION_STOP.contains(w))
        .map(|(_, &w)| w)
        .collect();
    filtered.join(" ")
}

/// Normalizes standalone Roman numeral tokens (ii..xvi) to Arabic digits (2..16).
fn roman_to_arabic_tokens(s: &str) -> String {
    s.split_whitespace()
        .map(|tok| match tok {
            "ii" => "2",
            "iii" => "3",
            "iv" => "4",
            "v" => "5",
            "vi" => "6",
            "vii" => "7",
            "viii" => "8",
            "ix" => "9",
            "x" => "10",
            "xi" => "11",
            "xii" => "12",
            "xiii" => "13",
            "xiv" => "14",
            "xv" => "15",
            "xvi" => "16",
            other => other,
        })
        .collect::<Vec<_>>()
        .join(" ")
}
