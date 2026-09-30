use sysinfo::System;

pub struct MemoryMetrics {
    pub used_bytes: u64,
    pub total_bytes: u64,
    pub available_bytes: u64,
}

pub struct MemoryTelemetryProvider;

impl MemoryTelemetryProvider {
    pub fn new() -> Self {
        Self
    }

    pub fn poll(&mut self, sys: &System) -> MemoryMetrics {
        let total = sys.total_memory();
        let used = sys.used_memory();
        let available = sys.available_memory();

        MemoryMetrics {
            used_bytes: used,
            total_bytes: total,
            available_bytes: available,
        }
    }
}

impl Default for MemoryTelemetryProvider {
    fn default() -> Self {
        Self::new()
    }
}
