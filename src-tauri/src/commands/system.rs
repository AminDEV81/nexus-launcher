use crate::db::Database;
use crate::error::AppResult;
use serde::Serialize;
use sysinfo::{Disks, System};
use tauri::State;

#[derive(Serialize)]
pub struct HealthStatus {
    pub database_connected: bool,
    pub applied_migrations: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CpuSpecs {
    pub brand: String,
    pub vendor_id: String,
    pub physical_cores: usize,
    pub logical_cores: usize,
    pub frequency_mhz: u64,
    pub usage_percent: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct GpuSpecs {
    pub name: String,
    pub vendor: String,
    pub driver_version: String,
    pub vram_bytes: Option<u64>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MemorySpecs {
    pub total_bytes: u64,
    pub used_bytes: u64,
    pub free_bytes: u64,
    pub total_swap_bytes: u64,
    pub used_swap_bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DiskSpecs {
    pub name: String,
    pub mount_point: String,
    pub total_bytes: u64,
    pub available_bytes: u64,
    pub file_system: String,
    pub kind: String,
    pub is_removable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MotherboardSpecs {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub bios_version: Option<String>,
    pub bios_date: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct DisplaySpecs {
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SystemSpecs {
    pub os_name: String,
    pub os_version: String,
    pub kernel_version: String,
    pub os_build: Option<String>,
    pub host_name: String,
    pub cpu_arch: String,
    pub uptime_seconds: u64,
    pub boot_time: u64,
    pub cpu: CpuSpecs,
    pub gpus: Vec<GpuSpecs>,
    pub memory: MemorySpecs,
    pub disks: Vec<DiskSpecs>,
    pub motherboard: MotherboardSpecs,
    pub displays: Vec<DisplaySpecs>,
}

#[derive(Debug, Clone, Serialize)]
pub struct LiveSystemMetrics {
    pub memory: MemorySpecs,
    pub cpu_usage_percent: f32,
    pub cpu_frequency_mhz: u64,
}

#[cfg(windows)]
fn query_windows_motherboard() -> MotherboardSpecs {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"HARDWARE\DESCRIPTION\System\BIOS") {
        let manufacturer: Option<String> = key.get_value("BaseBoardManufacturer").ok();
        let product: Option<String> = key.get_value("BaseBoardProduct").ok();
        let bios_version: Option<String> = key.get_value("BIOSVersion").ok();
        let bios_date: Option<String> = key.get_value("BIOSReleaseDate").ok();

        MotherboardSpecs {
            manufacturer,
            product,
            bios_version,
            bios_date,
        }
    } else {
        MotherboardSpecs {
            manufacturer: None,
            product: None,
            bios_version: None,
            bios_date: None,
        }
    }
}

#[cfg(not(windows))]
fn query_windows_motherboard() -> MotherboardSpecs {
    MotherboardSpecs {
        manufacturer: None,
        product: None,
        bios_version: None,
        bios_date: None,
    }
}

#[cfg(windows)]
fn query_windows_gpus() -> Vec<GpuSpecs> {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let mut gpus = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let class_path = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";

    if let Ok(class_key) = hklm.open_subkey(class_path) {
        for subkey_name in class_key.enum_keys().filter_map(|k| k.ok()) {
            if subkey_name.starts_with("Properties") || subkey_name.starts_with("Configuration") {
                continue;
            }

            if let Ok(adapter_key) = class_key.open_subkey(&subkey_name) {
                let name: Option<String> = adapter_key.get_value("DriverDesc").ok();
                if let Some(gpu_name) = name {
                    let lower = gpu_name.to_lowercase();
                    if lower.contains("remote")
                        || lower.contains("rdp")
                        || lower.contains("indirect display")
                    {
                        continue;
                    }

                    let driver_version: String = adapter_key
                        .get_value("DriverVersion")
                        .unwrap_or_else(|_| "Unknown".into());
                    let vendor: String = adapter_key
                        .get_value("ProviderName")
                        .unwrap_or_else(|_| "Unknown".into());

                    let vram: Option<u64> = adapter_key
                        .get_value::<u64, _>("HardwareInformation.qwMemorySize")
                        .ok()
                        .or_else(|| {
                            adapter_key
                                .get_value::<u32, _>("HardwareInformation.MemorySize")
                                .ok()
                                .map(|v| v as u64)
                        })
                        .filter(|&v| v > 0);

                    if !gpus.iter().any(|g: &GpuSpecs| {
                        g.name == gpu_name && g.driver_version == driver_version
                    }) {
                        gpus.push(GpuSpecs {
                            name: gpu_name,
                            vendor,
                            driver_version,
                            vram_bytes: vram,
                            is_primary: false,
                        });
                    }
                }
            }
        }
    }

    if let Some(pos) = gpus
        .iter()
        .position(|g| g.vram_bytes.unwrap_or(0) >= 1024 * 1024 * 1024)
    {
        gpus[pos].is_primary = true;
    } else if let Some(first) = gpus.first_mut() {
        first.is_primary = true;
    }

    gpus
}

#[cfg(not(windows))]
fn query_windows_gpus() -> Vec<GpuSpecs> {
    Vec::new()
}

#[cfg(windows)]
fn query_windows_os_info() -> (Option<String>, Option<String>) {
    use winreg::enums::HKEY_LOCAL_MACHINE;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion") {
        let product_name: Option<String> = key.get_value("ProductName").ok();
        let display_version: Option<String> = key.get_value("DisplayVersion").ok();
        let current_build: Option<String> = key.get_value("CurrentBuild").ok();
        let ubr: Option<u32> = key.get_value("UBR").ok();

        let mut build_str = current_build.unwrap_or_default();
        if let Some(sub) = ubr {
            if !build_str.is_empty() {
                build_str = format!("{}.{}", build_str, sub);
            }
        }

        let mut full_os = product_name;
        if let Ok(build_num) = build_str.split('.').next().unwrap_or("0").parse::<u32>() {
            if build_num >= 22000 {
                if let Some(ref mut name) = full_os {
                    *name = name.replace("Windows 10", "Windows 11");
                }
            }
        }
        if let Some(ver) = display_version {
            if let Some(ref mut name) = full_os {
                *name = format!("{} ({})", name, ver);
            }
        }

        (
            full_os,
            if build_str.is_empty() {
                None
            } else {
                Some(build_str)
            },
        )
    } else {
        (None, None)
    }
}

#[cfg(not(windows))]
fn query_windows_os_info() -> (Option<String>, Option<String>) {
    (None, None)
}

/// Dynamically retrieves comprehensive hardware, OS, and system specifications for any PC.
#[tauri::command]
pub fn get_system_specs(app: tauri::AppHandle) -> AppResult<SystemSpecs> {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpus = sys.cpus();
    let cpu_brand = cpus
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "Unknown CPU".into());
    let cpu_vendor = cpus
        .first()
        .map(|c| c.vendor_id().trim().to_string())
        .unwrap_or_else(|| "Unknown Vendor".into());
    let cpu_freq = cpus.first().map(|c| c.frequency()).unwrap_or(0);
    let logical_cores = cpus.len();
    let physical_cores = sys.physical_core_count().unwrap_or(logical_cores);
    let cpu_usage: f32 = if !cpus.is_empty() {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
    } else {
        0.0
    };

    let cpu = CpuSpecs {
        brand: cpu_brand,
        vendor_id: cpu_vendor,
        physical_cores,
        logical_cores,
        frequency_mhz: cpu_freq,
        usage_percent: (cpu_usage * 10.0).round() / 10.0,
    };

    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let free_memory = total_memory.saturating_sub(used_memory);
    let memory = MemorySpecs {
        total_bytes: total_memory,
        used_bytes: used_memory,
        free_bytes: free_memory,
        total_swap_bytes: sys.total_swap(),
        used_swap_bytes: sys.used_swap(),
    };

    let disks = Disks::new_with_refreshed_list();
    let mut disk_list = Vec::new();
    for disk in &disks {
        let mount_point = disk.mount_point().to_string_lossy().to_string();
        let name = disk.name().to_string_lossy().to_string();
        let fs = disk.file_system().to_string_lossy().to_string();
        let kind = match disk.kind() {
            sysinfo::DiskKind::SSD => "SSD".to_string(),
            sysinfo::DiskKind::HDD => "HDD".to_string(),
            _ => "Unknown".to_string(),
        };
        disk_list.push(DiskSpecs {
            name: if name.is_empty() {
                mount_point.clone()
            } else {
                name
            },
            mount_point,
            total_bytes: disk.total_space(),
            available_bytes: disk.available_space(),
            file_system: fs,
            kind,
            is_removable: disk.is_removable(),
        });
    }

    let gpus = query_windows_gpus();
    let motherboard = query_windows_motherboard();
    let (detailed_os, os_build) = query_windows_os_info();

    let os_name = detailed_os.unwrap_or_else(|| System::name().unwrap_or_else(|| "Unknown OS".into()));
    let os_version = System::os_version().unwrap_or_else(|| "Unknown".into());
    let kernel_version = System::kernel_version().unwrap_or_else(|| "Unknown".into());
    let host_name = System::host_name().unwrap_or_else(|| "Unknown Device".into());
    let cpu_arch = System::cpu_arch().unwrap_or_else(|| std::env::consts::ARCH.to_string());
    let uptime_seconds = System::uptime();
    let boot_time = System::boot_time();

    let mut display_list = Vec::new();
    let primary_monitor = app.primary_monitor().ok().flatten();
    if let Ok(monitors) = app.available_monitors() {
        for monitor in monitors {
            let is_primary = primary_monitor
                .as_ref()
                .map(|p| p.name() == monitor.name() && p.position() == monitor.position())
                .unwrap_or(false);
            display_list.push(DisplaySpecs {
                name: monitor.name().map(|s| s.to_string()),
                width: monitor.size().width,
                height: monitor.size().height,
                scale_factor: monitor.scale_factor(),
                is_primary,
            });
        }
    }

    Ok(SystemSpecs {
        os_name,
        os_version,
        kernel_version,
        os_build,
        host_name,
        cpu_arch,
        uptime_seconds,
        boot_time,
        cpu,
        gpus,
        memory,
        disks: disk_list,
        motherboard,
        displays: display_list,
    })
}

/// Round-trips through SQLite so the frontend can confirm, on startup,
/// that the Rust backend and local database are wired up correctly.
/// Useful during Epic 0 bring-up; later epics' commands follow the same
/// `State<Database>` pattern.
#[tauri::command]
pub fn health_check(db: State<'_, Database>) -> AppResult<HealthStatus> {
    let conn = db.connection.lock().expect("db mutex poisoned");

    let applied_migrations: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;

    Ok(HealthStatus {
        database_connected: true,
        applied_migrations,
    })
}

/// Safely performs a scheduled power action (shutdown / sleep / hibernate) on completion.
#[tauri::command]
pub fn shutdown_system(action: Option<String>) -> AppResult<()> {
    let act = action.as_deref().unwrap_or("shutdown");
    #[cfg(target_os = "windows")]
    {
        match act {
            "sleep" => {
                let _ = std::process::Command::new("rundll32.exe")
                    .args(["powrprof.dll,SetSuspendState", "0,1,0"])
                    .spawn();
            }
            "hibernate" => {
                let _ = std::process::Command::new("shutdown")
                    .args(["/h"])
                    .spawn();
            }
            _ => {
                let _ = std::process::Command::new("shutdown")
                    .args(["/s", "/t", "30", "/c", "Nexus Launcher completed scheduled downloads."])
                    .spawn();
            }
        }
    }
    Ok(())
}

/// Returns lightweight, real-time memory and CPU metrics for live UI updating.
#[tauri::command]
pub fn get_live_metrics() -> AppResult<LiveSystemMetrics> {
    let mut sys = System::new();
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let free_memory = total_memory.saturating_sub(used_memory);
    let memory = MemorySpecs {
        total_bytes: total_memory,
        used_bytes: used_memory,
        free_bytes: free_memory,
        total_swap_bytes: sys.total_swap(),
        used_swap_bytes: sys.used_swap(),
    };

    let cpus = sys.cpus();
    let cpu_freq = cpus.first().map(|c| c.frequency()).unwrap_or(0);
    let cpu_usage: f32 = if !cpus.is_empty() {
        cpus.iter().map(|c| c.cpu_usage()).sum::<f32>() / cpus.len() as f32
    } else {
        0.0
    };

    Ok(LiveSystemMetrics {
        memory,
        cpu_usage_percent: (cpu_usage * 10.0).round() / 10.0,
        cpu_frequency_mhz: cpu_freq,
    })
}


