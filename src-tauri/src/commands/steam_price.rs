//! Steam Store pricing and regional price tracking (SteamDB-style)
//!
//! Fetches real-time price overviews and discounts directly from Steam Store API,
//! queries multiple regional storefronts in parallel, and converts local currencies
//! to USD using live/cached open exchange rates to provide savings comparisons.

use crate::commands::metadata::HttpClient;
use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

const STEAM_APPDETAILS_URL: &str = "https://store.steampowered.com/api/appdetails";
const EXCHANGE_RATES_URL: &str = "https://open.er-api.com/v6/latest/USD";

/// Regional storefront benchmark configurations
#[derive(Debug, Clone)]
pub struct RegionConfig {
    pub code: &'static str,
    pub name: &'static str,
    pub flag: &'static str,
    pub default_currency: &'static str,
}

pub const BENCHMARK_REGIONS: &[RegionConfig] = &[
    RegionConfig {
        code: "us",
        name: "United States",
        flag: "🇺🇸",
        default_currency: "USD",
    },
    RegionConfig {
        code: "ua",
        name: "Ukraine",
        flag: "🇺🇦",
        default_currency: "UAH",
    },
    RegionConfig {
        code: "kz",
        name: "Kazakhstan",
        flag: "🇰🇿",
        default_currency: "KZT",
    },
    RegionConfig {
        code: "tr",
        name: "Turkey (MENA)",
        flag: "🇹🇷",
        default_currency: "USD",
    },
    RegionConfig {
        code: "ar",
        name: "Argentina (LATAM)",
        flag: "🇦🇷",
        default_currency: "USD",
    },
    RegionConfig {
        code: "in",
        name: "India",
        flag: "🇮🇳",
        default_currency: "INR",
    },
    RegionConfig {
        code: "br",
        name: "Brazil",
        flag: "🇧🇷",
        default_currency: "BRL",
    },
    RegionConfig {
        code: "cn",
        name: "China",
        flag: "🇨🇳",
        default_currency: "CNY",
    },
    RegionConfig {
        code: "jp",
        name: "Japan",
        flag: "🇯🇵",
        default_currency: "JPY",
    },
    RegionConfig {
        code: "de",
        name: "Eurozone",
        flag: "🇪🇺",
        default_currency: "EUR",
    },
    RegionConfig {
        code: "gb",
        name: "United Kingdom",
        flag: "🇬🇧",
        default_currency: "GBP",
    },
    RegionConfig {
        code: "ca",
        name: "Canada",
        flag: "🇨🇦",
        default_currency: "CAD",
    },
    RegionConfig {
        code: "au",
        name: "Australia",
        flag: "🇦🇺",
        default_currency: "AUD",
    },
    RegionConfig {
        code: "pl",
        name: "Poland",
        flag: "🇵🇱",
        default_currency: "PLN",
    },
];

/// Price for a single region
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamRegionalPrice {
    pub country_code: String,
    pub country_name: String,
    pub flag_emoji: String,
    pub currency: String,
    pub raw_initial: i64,
    pub raw_final: i64,
    pub initial_formatted: String,
    pub final_formatted: String,
    pub discount_percent: i64,
    pub converted_usd: f64,
    pub difference_percent: i64,
    pub is_free: bool,
}

/// Comprehensive pricing overview for a game
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SteamPriceOverview {
    pub steam_app_id: String,
    pub is_free: bool,
    pub base_usd_price: f64,
    pub active_price: Option<SteamRegionalPrice>,
    pub regions: Vec<SteamRegionalPrice>,
}

/// Fetches open exchange rates against USD with fallback default rates
async fn get_exchange_rates(client: &reqwest::Client) -> HashMap<String, f64> {
    let mut fallback_rates: HashMap<String, f64> = HashMap::new();
    fallback_rates.insert("USD".into(), 1.0);
    fallback_rates.insert("EUR".into(), 0.86);
    fallback_rates.insert("GBP".into(), 0.74);
    fallback_rates.insert("UAH".into(), 44.5);
    fallback_rates.insert("KZT".into(), 450.0);
    fallback_rates.insert("CNY".into(), 6.72);
    fallback_rates.insert("INR".into(), 95.6);
    fallback_rates.insert("BRL".into(), 5.12);
    fallback_rates.insert("TRY".into(), 48.6);
    fallback_rates.insert("ARS".into(), 1510.0);
    fallback_rates.insert("JPY".into(), 153.6);
    fallback_rates.insert("CAD".into(), 1.39);
    fallback_rates.insert("AUD".into(), 1.40);
    fallback_rates.insert("PLN".into(), 3.70);

    if let Ok(resp) = client.get(EXCHANGE_RATES_URL).send().await {
        if resp.status().is_success() {
            if let Ok(body) = resp.json::<Value>().await {
                if let Some(rates_obj) = body.get("rates").and_then(Value::as_object) {
                    for (k, v) in rates_obj {
                        if let Some(num) = v.as_f64() {
                            fallback_rates.insert(k.clone(), num);
                        }
                    }
                }
            }
        }
    }

    fallback_rates
}

/// Fetches price data for a single region directly from Steam
async fn fetch_single_region_price(
    client: &reqwest::Client,
    steam_app_id: &str,
    region: &RegionConfig,
) -> Option<(RegionConfig, Value, bool)> {
    let url = format!(
        "{}?appids={}&cc={}&filters=price_overview,basic",
        STEAM_APPDETAILS_URL, steam_app_id, region.code
    );

    let res = client.get(&url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }

    let json: Value = res.json().await.ok()?;
    let entry = json.get(steam_app_id)?;
    let success = entry.get("success").and_then(Value::as_bool).unwrap_or(false);
    if !success {
        return None;
    }

    let data = entry.get("data")?;
    let is_free = data.get("is_free").and_then(Value::as_bool).unwrap_or(false);
    let price_overview = data.get("price_overview").cloned().unwrap_or(Value::Null);

    Some((region.clone(), price_overview, is_free))
}

/// Parse Steam `price_overview` into a structured `SteamRegionalPrice`
fn parse_steam_price(
    region: &RegionConfig,
    price_val: &Value,
    is_free: bool,
    rates: &HashMap<String, f64>,
    base_usd: Option<f64>,
) -> Option<SteamRegionalPrice> {
    if is_free {
        return Some(SteamRegionalPrice {
            country_code: region.code.to_string(),
            country_name: region.name.to_string(),
            flag_emoji: region.flag.to_string(),
            currency: region.default_currency.to_string(),
            raw_initial: 0,
            raw_final: 0,
            initial_formatted: String::new(),
            final_formatted: "Free to Play".to_string(),
            discount_percent: 0,
            converted_usd: 0.0,
            difference_percent: 0,
            is_free: true,
        });
    }

    if price_val.is_null() {
        return None;
    }

    let currency = price_val
        .get("currency")
        .and_then(Value::as_str)
        .unwrap_or(region.default_currency)
        .to_string();

    let raw_initial = price_val.get("initial").and_then(Value::as_i64).unwrap_or(0);
    let raw_final = price_val.get("final").and_then(Value::as_i64).unwrap_or(0);
    let discount_percent = price_val
        .get("discount_percent")
        .and_then(Value::as_i64)
        .unwrap_or(0);

    let initial_formatted = price_val
        .get("initial_formatted")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    let final_formatted = price_val
        .get("final_formatted")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();

    // In Steam API, all final amounts are in cents / 100x units
    let numeric_local = raw_final as f64 / 100.0;
    let converted_usd = if currency == "USD" {
        numeric_local
    } else {
        let rate = rates.get(&currency).copied().unwrap_or(1.0);
        if rate > 0.0 {
            (numeric_local / rate * 100.0).round() / 100.0
        } else {
            numeric_local
        }
    };

    let difference_percent = match base_usd {
        Some(base) if base > 0.0 => {
            (((converted_usd - base) / base) * 100.0).round() as i64
        }
        _ => 0,
    };

    Some(SteamRegionalPrice {
        country_code: region.code.to_string(),
        country_name: region.name.to_string(),
        flag_emoji: region.flag.to_string(),
        currency,
        raw_initial,
        raw_final,
        initial_formatted,
        final_formatted,
        discount_percent,
        converted_usd,
        difference_percent,
        is_free: false,
    })
}

/// Retrieves single-region price for a game on Steam
#[tauri::command]
pub async fn get_steam_game_price(
    http: State<'_, HttpClient>,
    steam_app_id: String,
    country_code: Option<String>,
) -> AppResult<Option<SteamRegionalPrice>> {
    let clean_code = country_code
        .as_deref()
        .map(|c| c.trim().to_lowercase())
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| "us".to_string());

    let region = BENCHMARK_REGIONS
        .iter()
        .find(|r| r.code == clean_code)
        .cloned()
        .unwrap_or(RegionConfig {
            code: "us",
            name: "United States",
            flag: "🇺🇸",
            default_currency: "USD",
        });

    let client = &http.0;
    let rates = get_exchange_rates(client).await;

    let Some((_, price_val, is_free)) =
        fetch_single_region_price(client, &steam_app_id, &region).await
    else {
        return Ok(None);
    };

    Ok(parse_steam_price(&region, &price_val, is_free, &rates, None))
}

/// Retrieves comprehensive regional prices across all benchmark regions (SteamDB-style)
#[tauri::command]
pub async fn get_steam_regional_prices(
    http: State<'_, HttpClient>,
    steam_app_id: String,
    active_country: Option<String>,
) -> AppResult<Option<SteamPriceOverview>> {
    let client = &http.0;

    // 1. Fetch exchange rates
    let rates = get_exchange_rates(client).await;

    // 2. Fetch all benchmark regions in parallel using Tokio JoinSet
    let mut set = tokio::task::JoinSet::new();
    for reg in BENCHMARK_REGIONS {
        let client_clone = client.clone();
        let app_id_clone = steam_app_id.clone();
        let reg_clone = reg.clone();
        set.spawn(async move {
            fetch_single_region_price(&client_clone, &app_id_clone, &reg_clone).await
        });
    }

    // Check if the game is free to play or found
    let mut any_found = false;
    let mut is_game_free = false;
    let mut raw_region_prices = Vec::new();

    while let Some(join_res) = set.join_next().await {
        if let Ok(Some(res)) = join_res {
            any_found = true;
            if res.2 {
                is_game_free = true;
            }
            raw_region_prices.push(res);
        }
    }

    if !any_found {
        return Ok(None);
    }

    if is_game_free {
        let regions: Vec<SteamRegionalPrice> = BENCHMARK_REGIONS
            .iter()
            .map(|r| SteamRegionalPrice {
                country_code: r.code.to_string(),
                country_name: r.name.to_string(),
                flag_emoji: r.flag.to_string(),
                currency: r.default_currency.to_string(),
                raw_initial: 0,
                raw_final: 0,
                initial_formatted: String::new(),
                final_formatted: "Free to Play".to_string(),
                discount_percent: 0,
                converted_usd: 0.0,
                difference_percent: 0,
                is_free: true,
            })
            .collect();

        let active_code = active_country
            .as_deref()
            .unwrap_or("us")
            .trim()
            .to_lowercase();
        let active_price = regions
            .iter()
            .find(|r| r.country_code == active_code)
            .cloned()
            .or_else(|| regions.first().cloned());

        return Ok(Some(SteamPriceOverview {
            steam_app_id,
            is_free: true,
            base_usd_price: 0.0,
            active_price,
            regions,
        }));
    }

    // 3. First determine base US price in USD
    let us_raw = raw_region_prices.iter().find(|(r, _, _)| r.code == "us");
    let base_usd_price = us_raw
        .and_then(|(_, price_val, _)| {
            price_val
                .get("final")
                .and_then(Value::as_i64)
                .map(|cents| cents as f64 / 100.0)
        })
        .unwrap_or(0.0);

    // 4. Parse all regional prices and calculate differences
    let mut regional_prices: Vec<SteamRegionalPrice> = raw_region_prices
        .iter()
        .filter_map(|(reg, price_val, is_free)| {
            parse_steam_price(reg, price_val, *is_free, &rates, Some(base_usd_price))
        })
        .collect();

    // Sort cheapest converted USD price first
    regional_prices.sort_by(|a, b| {
        a.converted_usd
            .partial_cmp(&b.converted_usd)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let active_code = active_country
        .as_deref()
        .unwrap_or("us")
        .trim()
        .to_lowercase();

    let active_price = regional_prices
        .iter()
        .find(|r| r.country_code == active_code)
        .cloned()
        .or_else(|| regional_prices.iter().find(|r| r.country_code == "us").cloned());

    Ok(Some(SteamPriceOverview {
        steam_app_id,
        is_free: false,
        base_usd_price,
        active_price,
        regions: regional_prices,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_steam_price_calculates_usd_difference() {
        let mut rates = HashMap::new();
        rates.insert("USD".to_string(), 1.0);
        rates.insert("UAH".to_string(), 44.5);

        let region = RegionConfig {
            code: "ua",
            name: "Ukraine",
            flag: "🇺🇦",
            default_currency: "UAH",
        };

        let price_json = serde_json::json!({
            "currency": "UAH",
            "initial": 139900,
            "final": 62900,
            "discount_percent": 30,
            "initial_formatted": "1 399₴",
            "final_formatted": "629₴"
        });

        let parsed = parse_steam_price(&region, &price_json, false, &rates, Some(41.99)).unwrap();

        assert_eq!(parsed.country_code, "ua");
        assert_eq!(parsed.discount_percent, 30);
        assert_eq!(parsed.final_formatted, "629₴");
        assert!(parsed.converted_usd > 13.0 && parsed.converted_usd < 15.0);
        // $14.13 vs $41.99 base is around -66%
        assert!(parsed.difference_percent < -60);
    }

    #[test]
    fn parse_steam_price_free_to_play() {
        let rates = HashMap::new();
        let region = RegionConfig {
            code: "us",
            name: "United States",
            flag: "🇺🇸",
            default_currency: "USD",
        };

        let parsed =
            parse_steam_price(&region, &serde_json::Value::Null, true, &rates, Some(0.0)).unwrap();

        assert!(parsed.is_free);
        assert_eq!(parsed.final_formatted, "Free to Play");
        assert_eq!(parsed.converted_usd, 0.0);
        assert_eq!(parsed.difference_percent, 0);
    }
}
