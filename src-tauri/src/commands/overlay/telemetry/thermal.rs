//! ACPI thermal-zone temperature through the `Thermal Zone Information`
//! performance counters. Needs no driver, but many desktop boards expose
//! only a static placeholder zone — the provider therefore only trusts a
//! zone once its reading has actually changed.

use super::pdh::{PdhCounter, PdhQuery};
use std::collections::VecDeque;

const HISTORY: usize = 24;

pub struct ThermalZoneReader {
    query: Option<PdhQuery>,
    counter: Option<PdhCounter>,
    primed: bool,
    /// Recent readings of the hottest zone.
    history: VecDeque<f32>,
}

impl ThermalZoneReader {
    pub fn new() -> Self {
        let query = PdhQuery::new();
        let counter = query
            .as_ref()
            .and_then(|q| q.add(r"\Thermal Zone Information(*)\High Precision Temperature"));
        Self {
            query,
            counter,
            primed: false,
            history: VecDeque::new(),
        }
    }

    /// Hottest plausible thermal zone in °C, or `None` when unavailable or
    /// when the zone looks static (placeholder value).
    pub fn poll(&mut self) -> Option<f32> {
        let (query, counter) = (self.query.as_ref()?, self.counter.as_ref()?);
        if !query.collect() {
            return None;
        }
        self.primed = true;

        // Value is in tenths of a Kelvin.
        let hottest = counter
            .values()
            .into_iter()
            .map(|(_, tenth_kelvin)| (tenth_kelvin / 10.0 - 273.15) as f32)
            .filter(|c| (20.0..=110.0).contains(c))
            .fold(None, |acc: Option<f32>, c| Some(acc.map_or(c, |m| m.max(c))))?;

        if self.history.len() >= HISTORY {
            self.history.pop_front();
        }
        self.history.push_back(hottest);

        let min = self.history.iter().cloned().fold(f32::MAX, f32::min);
        let max = self.history.iter().cloned().fold(f32::MIN, f32::max);
        (max - min >= 1.0).then_some((hottest * 10.0).round() / 10.0)
    }
}

impl Default for ThermalZoneReader {
    fn default() -> Self {
        Self::new()
    }
}
