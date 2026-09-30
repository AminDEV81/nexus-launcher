use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Steam's storefront endpoint (the same data the public store page
/// shows: genres, description, developers, publishers, release date,
/// Metacritic score, screenshots, system requirements) is open to
/// everyone — no API key, no OAuth. It only covers games that actually
/// have a Steam listing, so this is scoped to games with a `steam_app_id`
/// (set automatically by Epic 5's Steam scan, or whenever a game happens
/// to match one on SteamGridDB/IGDB), but for those games it needs zero
/// configuration — a real alternative to IGDB, not a workaround of it.
const API_BASE: &str = "https://store.steampowered.com/api/appdetails";

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct SystemRequirementDetail {
    pub os: Option<String>,
    pub processor: Option<String>,
    pub memory: Option<String>,
    pub graphics: Option<String>,
    pub storage: Option<String>,
    pub directx: Option<String>,
    pub sound_card: Option<String>,
    pub network: Option<String>,
    pub additional_notes: Option<String>,
    pub raw_html: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
pub struct SystemRequirements {
    pub minimum: Option<SystemRequirementDetail>,
    pub recommended: Option<SystemRequirementDetail>,
}

pub struct SteamAppDetails {
    pub description: Option<String>,
    pub developer: Option<String>,
    pub publisher: Option<String>,
    pub release_date: Option<String>,
    pub genres: Vec<String>,
    pub metacritic_score: Option<i64>,
    /// Full-resolution screenshot URLs, already in display order.
    pub screenshot_urls: Vec<String>,
    pub system_requirements: Option<SystemRequirements>,
}

pub async fn get_app_details(
    client: &reqwest::Client,
    steam_app_id: &str,
) -> AppResult<Option<SteamAppDetails>> {
    let response = client
        .get(API_BASE)
        .query(&[("appids", steam_app_id), ("l", "english")])
        .send()
        .await
        .map_err(|err| AppError::Other(format!("Steam store request failed: {err}")))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let body: Value = response
        .json()
        .await
        .map_err(|err| AppError::Other(format!("unexpected Steam store response: {err}")))?;

    let entry = body.get(steam_app_id);
    let success = entry
        .and_then(|e| e.get("success"))
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !success {
        // Not every appid is a real store listing (some are tools, dedicated
        // servers, or delisted) — that's a normal "nothing here", not an error.
        return Ok(None);
    }

    let Some(data) = entry.and_then(|e| e.get("data")) else {
        return Ok(None);
    };

    Ok(Some(parse_app_details(data)))
}

fn parse_app_details(data: &Value) -> SteamAppDetails {
    let description = data
        .get("short_description")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_string);

    let developer = data
        .get("developers")
        .and_then(Value::as_array)
        .map(|items| join_strings(items))
        .filter(|value| !value.is_empty());

    let publisher = data
        .get("publishers")
        .and_then(Value::as_array)
        .map(|items| join_strings(items))
        .filter(|value| !value.is_empty());

    let genres = data
        .get("genres")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("description").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let release_date = data
        .get("release_date")
        .and_then(|rd| rd.get("date"))
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(parse_steam_date);

    let metacritic_score = data
        .get("metacritic")
        .and_then(|m| m.get("score"))
        .and_then(Value::as_i64);

    let screenshot_urls = data
        .get("screenshots")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| item.get("path_full").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    let (min_req, rec_req) = if let Some(req_obj) = data.get("pc_requirements").and_then(Value::as_object) {
        let min = req_obj
            .get("minimum")
            .and_then(Value::as_str)
            .and_then(parse_requirement_html);
        let rec = req_obj
            .get("recommended")
            .and_then(Value::as_str)
            .and_then(parse_requirement_html);
        (min, rec)
    } else {
        (None, None)
    };

    let system_requirements = if min_req.is_some() || rec_req.is_some() {
        Some(SystemRequirements {
            minimum: min_req,
            recommended: rec_req,
        })
    } else {
        None
    };

    SteamAppDetails {
        description,
        developer,
        publisher,
        release_date,
        genres,
        metacritic_score,
        screenshot_urls,
        system_requirements,
    }
}

pub fn parse_requirement_html(html: &str) -> Option<SystemRequirementDetail> {
    if html.trim().is_empty() {
        return None;
    }

    let preprocessed = html
        .replace("<br>", "\n")
        .replace("<br/>", "\n")
        .replace("<br />", "\n")
        .replace("</li>", "\n")
        .replace("<li>", "\n")
        .replace("</p>", "\n")
        .replace("<p>", "\n")
        .replace("</div>", "\n")
        .replace("<div>", "\n")
        .replace('\r', "\n");

    let clean_text = strip_html_tags(&preprocessed);

    let mut detail = SystemRequirementDetail {
        raw_html: Some(html.to_string()),
        ..Default::default()
    };

    let mut has_any_field = false;

    for line in clean_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let lower = trimmed.to_lowercase();
        if lower == "minimum:" || lower == "recommended:" || lower == "minimum" || lower == "recommended" {
            continue;
        }

        if let Some((raw_label, raw_val)) = trimmed.split_once(':') {
            let clean_label = raw_label
                .trim()
                .trim_matches(|c: char| c == '*' || c == '-' || c == '•' || c == ':')
                .trim()
                .to_lowercase();
            let val = raw_val.trim().to_string();
            if val.is_empty() {
                continue;
            }

            match clean_label.as_str() {
                "os" | "operating system" => {
                    detail.os = Some(val);
                    has_any_field = true;
                }
                "processor" | "cpu" => {
                    detail.processor = Some(val);
                    has_any_field = true;
                }
                "memory" | "ram" => {
                    detail.memory = Some(val);
                    has_any_field = true;
                }
                "graphics" | "gpu" | "video card" => {
                    detail.graphics = Some(val);
                    has_any_field = true;
                }
                "directx" | "directx version" => {
                    detail.directx = Some(val);
                    has_any_field = true;
                }
                "storage" | "hard drive" | "hard disk space" | "disk space" | "available space" => {
                    detail.storage = Some(val);
                    has_any_field = true;
                }
                "sound card" | "sound" => {
                    detail.sound_card = Some(val);
                    has_any_field = true;
                }
                "network" | "broadband" => {
                    detail.network = Some(val);
                    has_any_field = true;
                }
                "additional notes" | "notes" => {
                    detail.additional_notes = match detail.additional_notes {
                        Some(existing) => Some(format!("{existing}. {val}")),
                        None => Some(val),
                    };
                    has_any_field = true;
                }
                _ => {
                    if lower.starts_with("additional notes") || lower.starts_with("notes") {
                        detail.additional_notes = match detail.additional_notes {
                            Some(existing) => Some(format!("{existing}. {val}")),
                            None => Some(val),
                        };
                        has_any_field = true;
                    }
                }
            }
        } else if lower.contains("64-bit") || lower.contains("processor and operating system") {
            detail.additional_notes = match detail.additional_notes {
                Some(existing) => {
                    if !existing.contains(trimmed) {
                        Some(format!("{trimmed}. {existing}"))
                    } else {
                        Some(existing)
                    }
                }
                None => Some(trimmed.to_string()),
            };
            has_any_field = true;
        }
    }

    if has_any_field {
        Some(detail)
    } else {
        None
    }
}

fn strip_html_tags(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut in_tag = false;
    for ch in input.chars() {
        if ch == '<' {
            in_tag = true;
        } else if ch == '>' {
            in_tag = false;
        } else if !in_tag {
            out.push(ch);
        }
    }
    out.replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&trade;", "™")
        .replace("&reg;", "®")
        .replace("&nbsp;", " ")
}

fn join_strings(items: &[Value]) -> String {
    items
        .iter()
        .filter_map(Value::as_str)
        .collect::<Vec<_>>()
        .join(", ")
}

/// Steam's store date is a human-readable, locale-formatted string (e.g.
/// "21 Nov, 2019"), unlike IGDB's clean `YYYY-MM-DD` — parsed into the
/// same format so both sources sort/display consistently. Falls back to
/// the original string if the format doesn't match what Steam usually
/// sends (still better than dropping the date entirely).
fn parse_steam_date(raw: &str) -> String {
    chrono::NaiveDate::parse_from_str(raw, "%e %b, %Y")
        .map(|date| date.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| raw.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_cyberpunk_requirements() {
        let html = "<strong>Minimum:</strong><br><ul class=\"bb_ul\"><li>Requires a 64-bit processor and operating system<br></li><li><strong>OS:</strong> 64-bit Windows 10<br></li><li><strong>Processor:</strong> Core i7-6700 or Ryzen 5 1600<br></li><li><strong>Memory:</strong> 12 GB RAM<br></li><li><strong>Graphics:</strong> GeForce GTX 1060 6GB or Radeon RX 580 8GB or Arc A380<br></li><li><strong>DirectX:</strong> Version 12<br></li><li><strong>Storage:</strong> 70 GB available space<br></li><li><strong>Additional Notes:</strong> SSD required.</li></ul>";
        let parsed = parse_requirement_html(html).expect("should parse");
        assert_eq!(parsed.os.as_deref(), Some("64-bit Windows 10"));
        assert_eq!(parsed.processor.as_deref(), Some("Core i7-6700 or Ryzen 5 1600"));
        assert_eq!(parsed.memory.as_deref(), Some("12 GB RAM"));
        assert_eq!(parsed.graphics.as_deref(), Some("GeForce GTX 1060 6GB or Radeon RX 580 8GB or Arc A380"));
        assert_eq!(parsed.directx.as_deref(), Some("Version 12"));
        assert_eq!(parsed.storage.as_deref(), Some("70 GB available space"));
        assert!(parsed.additional_notes.unwrap_or_default().contains("SSD required"));
    }

    #[test]
    fn test_parse_witcher_requirements_with_asterisk() {
        let html = "<strong>Minimum:</strong><br><ul class=\"bb_ul\"><li><strong>OS *:</strong> 64-bit Windows 7, 64-bit Windows 8 (8.1)<br></li><li><strong>Processor:</strong> Intel CPU Core i5-2500K 3.3GHz / AMD A10-5800K APU (3.8GHz)<br></li><li><strong>Memory:</strong> 6 GB RAM<br></li><li><strong>Graphics:</strong> Nvidia GPU GeForce GTX 660 / AMD GPU Radeon HD 7870<br></li><li><strong>DirectX:</strong> Version 11<br></li><li><strong>Storage:</strong> 50 GB available space<br></li><li><strong>Additional Notes:</strong> *System requirements will change.</li></ul>";
        let parsed = parse_requirement_html(html).expect("should parse");
        assert_eq!(parsed.os.as_deref(), Some("64-bit Windows 7, 64-bit Windows 8 (8.1)"));
        assert_eq!(parsed.processor.as_deref(), Some("Intel CPU Core i5-2500K 3.3GHz / AMD A10-5800K APU (3.8GHz)"));
        assert_eq!(parsed.memory.as_deref(), Some("6 GB RAM"));
        assert_eq!(parsed.graphics.as_deref(), Some("Nvidia GPU GeForce GTX 660 / AMD GPU Radeon HD 7870"));
        assert_eq!(parsed.directx.as_deref(), Some("Version 11"));
        assert_eq!(parsed.storage.as_deref(), Some("50 GB available space"));
    }
}
