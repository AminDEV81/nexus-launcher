//! ACPI thermal-zone temperature through the `Thermal Zone Information`
//! performance counters (`High Precision Temperature` and `Temperature`).

use super::pdh::{PdhCounter, PdhQuery};

pub struct ThermalZoneReader {
    query: Option<PdhQuery>,
    high_prec_counter: Option<PdhCounter>,
    kelvin_counter: Option<PdhCounter>,
}

impl ThermalZoneReader {
    pub fn new() -> Self {
        let query = PdhQuery::new();
        let high_prec_counter = query
            .as_ref()
            .and_then(|q| q.add(r"\Thermal Zone Information(*)\High Precision Temperature"));
        let kelvin_counter = query
            .as_ref()
            .and_then(|q| q.add(r"\Thermal Zone Information(*)\Temperature"));
        Self {
            query,
            high_prec_counter,
            kelvin_counter,
        }
    }

    /// Hottest plausible thermal zone in °C.
    /// Filters out exact static ACPI placeholder zones (such as 301.0 K = 27.85 °C when another zone exists).
    pub fn poll(&mut self) -> Option<f32> {
        let query = self.query.as_ref()?;
        if !query.collect() {
            return None;
        }

        let mut candidates: Vec<f32> = Vec::new();

        if let Some(ref hp) = self.high_prec_counter {
            for (_, raw) in hp.values() {
                // Value is in tenths of a Kelvin (e.g. 3300 = 56.85 °C), or occasionally Kelvin if < 500
                let celsius = if raw > 1000.0 {
                    (raw / 10.0 - 273.15) as f32
                } else {
                    (raw - 273.15) as f32
                };
                if (18.0..=115.0).contains(&celsius) {
                    candidates.push(celsius);
                }
            }
        }

        if let Some(ref kc) = self.kelvin_counter {
            for (_, raw) in kc.values() {
                let celsius = if raw > 1000.0 {
                    (raw / 10.0 - 273.15) as f32
                } else {
                    (raw - 273.15) as f32
                };
                if (18.0..=115.0).contains(&celsius) {
                    candidates.push(celsius);
                }
            }
        }

        if candidates.is_empty() {
            return None;
        }

        // Prefer non-dummy readings (301.0 K = 27.85°C and 298.0 K = 24.85°C are common static BIOS placeholders)
        let non_placeholder: Vec<f32> = candidates
            .iter()
            .copied()
            .filter(|&c| (c - 27.85).abs() > 0.25 && (c - 24.85).abs() > 0.25)
            .collect();

        let pool = if !non_placeholder.is_empty() {
            non_placeholder
        } else {
            candidates
        };

        let hottest = pool.into_iter().fold(f32::MIN, f32::max);
        Some((hottest * 10.0).round() / 10.0)
    }
}

impl Default for ThermalZoneReader {
    fn default() -> Self {
        Self::new()
    }
}
