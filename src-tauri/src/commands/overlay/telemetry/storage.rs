pub struct StorageMetrics {
    pub read_bps: Option<f32>,
    pub write_bps: Option<f32>,
}

/// Disk throughput across all physical disks.
///
/// On Windows this reads the `PhysicalDisk(_Total)` performance counters
/// (the same numbers Task Manager shows). Other platforms report nothing.
pub struct StorageTelemetryProvider {
    #[cfg(target_os = "windows")]
    query: Option<super::pdh::PdhQuery>,
    #[cfg(target_os = "windows")]
    read: Option<super::pdh::PdhCounter>,
    #[cfg(target_os = "windows")]
    write: Option<super::pdh::PdhCounter>,
}

impl StorageTelemetryProvider {
    #[cfg(target_os = "windows")]
    pub fn new() -> Self {
        let query = super::pdh::PdhQuery::new();
        let read = query
            .as_ref()
            .and_then(|q| q.add(r"\PhysicalDisk(_Total)\Disk Read Bytes/sec"));
        let write = query
            .as_ref()
            .and_then(|q| q.add(r"\PhysicalDisk(_Total)\Disk Write Bytes/sec"));
        // Rate counters need a baseline sample.
        if let Some(q) = query.as_ref() {
            q.collect();
        }
        Self { query, read, write }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn new() -> Self {
        Self {}
    }

    #[cfg(target_os = "windows")]
    pub fn poll(&mut self) -> StorageMetrics {
        let ok = self.query.as_ref().map(|q| q.collect()).unwrap_or(false);
        if !ok {
            return StorageMetrics {
                read_bps: None,
                write_bps: None,
            };
        }
        StorageMetrics {
            read_bps: self.read.as_ref().and_then(|c| c.value()).map(|v| v as f32),
            write_bps: self.write.as_ref().and_then(|c| c.value()).map(|v| v as f32),
        }
    }

    #[cfg(not(target_os = "windows"))]
    pub fn poll(&mut self) -> StorageMetrics {
        StorageMetrics {
            read_bps: None,
            write_bps: None,
        }
    }
}

impl Default for StorageTelemetryProvider {
    fn default() -> Self {
        Self::new()
    }
}
