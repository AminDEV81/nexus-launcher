use super::models::UnifiedArtwork;
use super::traits::ArtworkProvider;
use crate::error::AppResult;
use crate::services::scores::normalize_game_title;
use serde_json::Value;

pub struct SteamArtworkProvider {
    http: reqwest::Client,
}

/// Extracts sequel numbers and distinct spin-off identifiers so e.g.
/// "Grand Theft Auto VI" (`["6"]`), "Grand Theft Auto V" (`["5"]`), and
/// "Grand Theft Auto: Vice City" (`["vice", "city"]`) can never collide.
pub fn extract_sequel_or_spinoff_signature(norm_title: &str) -> Vec<String> {
    let mut sig = Vec::new();
    for tok in norm_title.split_whitespace() {
        let mapped = match tok {
            "i" | "1" => Some("1"),
            "ii" | "2" => Some("2"),
            "iii" | "3" => Some("3"),
            "iv" | "4" => Some("4"),
            "v" | "5" => Some("5"),
            "vi" | "6" => Some("6"),
            "vii" | "7" => Some("7"),
            "viii" | "8" => Some("8"),
            "ix" | "9" => Some("9"),
            "x" | "10" => Some("10"),
            "xi" | "11" => Some("11"),
            "xii" | "12" => Some("12"),
            "xiii" | "13" => Some("13"),
            "xiv" | "14" => Some("14"),
            "xv" | "15" => Some("15"),
            "xvi" | "16" => Some("16"),
            "vice" | "san" | "andreas" | "liberty" | "stories" | "chinatown" | "ballad"
            | "ragnarok" | "rebirth" | "remake" | "village" | "biohazard" | "revelations"
            | "brotherhood" | "odyssey" | "valhalla" | "mirage" | "origins" | "shadows"
            | "syndicate" | "unity" | "rogue" | "black" | "flag" | "miles" | "morales"
            | "nightreign" | "silksong" | "yotei" | "eternal" | "dark" | "ages" | "alyx"
            | "new" | "vegas" | "bloodlines" | "infinite" | "reach" | "odst" => Some(tok),
            _ => {
                if tok.chars().all(|c| c.is_ascii_digit()) {
                    Some(tok)
                } else {
                    None
                }
            }
        };
        if let Some(m) = mapped {
            let s = m.to_string();
            if !sig.contains(&s) {
                sig.push(s);
            }
        }
    }
    sig
}

/// Checks whether `longer` starts with all words of `shorter` on strict word boundaries
/// AND both titles share the exact same sequel/spin-off signature.
pub fn titles_match_on_word_boundaries(a_norm: &str, b_norm: &str) -> bool {
    if a_norm.is_empty() || b_norm.is_empty() {
        return false;
    }
    if a_norm == b_norm {
        return true;
    }
    if extract_sequel_or_spinoff_signature(a_norm) != extract_sequel_or_spinoff_signature(b_norm) {
        return false;
    }
    let a_words: Vec<&str> = a_norm.split_whitespace().collect();
    let b_words: Vec<&str> = b_norm.split_whitespace().collect();
    if a_words.is_empty() || b_words.is_empty() {
        return false;
    }
    let (shorter, longer) = if a_words.len() <= b_words.len() {
        (&a_words, &b_words)
    } else {
        (&b_words, &a_words)
    };
    if shorter.len() < 2 && shorter[0].len() < 5 {
        return false;
    }
    longer.starts_with(shorter.as_slice())
}

impl SteamArtworkProvider {
    pub fn new(http: reqwest::Client) -> Self {
        Self { http }
    }

    pub async fn resolve_app_id(&self, name: &str) -> Option<String> {
        let clean_q = normalize_game_title(name);
        if clean_q.is_empty() {
            return None;
        }

        // Unreleased / console-first titles that do not have a Steam AppID yet:
        // never query Steam Store Search for them so they don't match older sequels/spin-offs (e.g. Vice City for GTA VI).
        if matches!(
            clean_q.as_str(),
            "grand theft auto vi"
                | "grand theft auto 6"
                | "gta vi"
                | "gta 6"
                | "ghost of yotei"
                | "death stranding 2 on the beach"
                | "death stranding 2"
        ) {
            return None;
        }

        let url = "https://store.steampowered.com/api/storesearch";
        let res = self
            .http
            .get(url)
            .query(&[("term", name), ("l", "english"), ("cc", "US")])
            .header("Cache-Control", "no-cache")
            .send()
            .await
            .ok()?;

        let json: Value = res.json().await.ok()?;
        let items = json.get("items").and_then(Value::as_array)?;

        // Pass 1: exact normalized title match (after stripping edition/remaster noise)
        for item in items {
            if let Some(cand_name) = item.get("name").and_then(Value::as_str) {
                let clean_cand = normalize_game_title(cand_name);
                if clean_cand == clean_q {
                    return item.get("id").and_then(|id| id.as_i64()).map(|id| id.to_string());
                }
            }
        }

        // Pass 2: strict word-boundary prefix match with identical sequel/spin-off signature
        for item in items.iter().take(5) {
            if let Some(cand_name) = item.get("name").and_then(Value::as_str) {
                let clean_cand = normalize_game_title(cand_name);
                if titles_match_on_word_boundaries(&clean_cand, &clean_q) {
                    return item.get("id").and_then(|id| id.as_i64()).map(|id| id.to_string());
                }
            }
        }

        None
    }
}

impl ArtworkProvider for SteamArtworkProvider {
    fn provider_name(&self) -> &'static str {
        "steam"
    }

    async fn get_artwork_options(
        &self,
        kind: &str,
        steam_app_id: Option<&str>,
        name: &str,
    ) -> AppResult<Vec<UnifiedArtwork>> {
        let app_id_owned = match steam_app_id {
            Some(id) if !id.trim().is_empty() => Some(id.trim().to_string()),
            _ => self.resolve_app_id(name).await,
        };

        let Some(app_id) = app_id_owned else {
            return Ok(Vec::new());
        };

        let cdn_base = "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps";
        let mut results = Vec::new();

        match kind {
            "cover" => {
                // 1. Vertical 600x900 2x HD Box Art (1200x1800)
                let cover_2x_url = format!("{cdn_base}/{app_id}/library_600x900_2x.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-cover-600x900-2x"),
                    url: cover_2x_url.clone(),
                    thumbnail_url: format!("{cdn_base}/{app_id}/library_600x900.jpg"),
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 600,
                    height: 900,
                    provider: "steam".into(),
                    artwork_type: "cover".into(),
                });

                // 2. Main Store Capsule 616x353
                let capsule_url = format!("{cdn_base}/{app_id}/capsule_616x353.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-capsule-616x353"),
                    url: capsule_url.clone(),
                    thumbnail_url: capsule_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 616,
                    height: 353,
                    provider: "steam".into(),
                    artwork_type: "cover".into(),
                });

                // 3. Horizontal Header Capsule
                let header_url = format!("{cdn_base}/{app_id}/header.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-header"),
                    url: header_url.clone(),
                    thumbnail_url: header_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 460,
                    height: 215,
                    provider: "steam".into(),
                    artwork_type: "cover".into(),
                });
            }
            "hero" => {
                // Library Hero banner (1920x620)
                let hero_url = format!("{cdn_base}/{app_id}/library_hero.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-hero"),
                    url: hero_url.clone(),
                    thumbnail_url: hero_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 1920,
                    height: 620,
                    provider: "steam".into(),
                    artwork_type: "hero".into(),
                });

                let page_bg_url = format!("{cdn_base}/{app_id}/page_bg_raw.jpg");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-page-bg"),
                    url: page_bg_url.clone(),
                    thumbnail_url: page_bg_url,
                    mime: "image/jpeg".into(),
                    is_animated: false,
                    width: 1920,
                    height: 1080,
                    provider: "steam".into(),
                    artwork_type: "hero".into(),
                });
            }
            "logo" => {
                // Transparent PNG logo
                let logo_url = format!("{cdn_base}/{app_id}/logo.png");
                results.push(UnifiedArtwork {
                    id: format!("steam-{app_id}-logo"),
                    url: logo_url.clone(),
                    thumbnail_url: logo_url,
                    mime: "image/png".into(),
                    is_animated: false,
                    width: 640,
                    height: 360,
                    provider: "steam".into(),
                    artwork_type: "logo".into(),
                });
            }
            _ => {}
        }

        Ok(results)
    }
}
