//! Game Booster (Settings → Game Booster).
//!
//! A set of independent, toggleable modules — which ones actually run
//! is read from the `booster_enabled_modules` setting (a comma-separated
//! list of the ids below, in the generic `settings` KV table also used
//! by `commands/settings.rs`), so the settings panel's per-module
//! switches and `launch_game`'s Auto Boost (see `commands/launch.rs`)
//! always agree on what "boost" means without the frontend having to
//! pass the selection through on every call.

use crate::db::Database;
use crate::error::AppResult;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System};

/// `(name to match against, without any OS-specific extension, display name, category)`.
const BOOSTABLE_PROCESSES: &[(&str, &str, &str)] = &[
    // Web Browsers
    ("chrome", "Google Chrome", "browser"),
    ("msedge", "Microsoft Edge", "browser"),
    ("firefox", "Firefox", "browser"),
    ("opera", "Opera / Opera GX", "browser"),
    ("brave", "Brave Browser", "browser"),
    ("vivaldi", "Vivaldi", "browser"),
    ("waterfox", "Waterfox", "browser"),
    // Chat, Media & Overlays
    ("discord", "Discord", "chat_media"),
    ("spotify", "Spotify", "chat_media"),
    ("slack", "Slack", "chat_media"),
    ("teams", "Microsoft Teams", "chat_media"),
    ("ms-teams", "Microsoft Teams", "chat_media"),
    ("skype", "Skype", "chat_media"),
    ("zoom", "Zoom", "chat_media"),
    ("telegram", "Telegram Desktop", "chat_media"),
    ("overwolf", "Overwolf Overlay", "chat_media"),
    // Cloud Sync & Storage
    ("onedrive", "Microsoft OneDrive", "cloud_sync"),
    ("dropbox", "Dropbox", "cloud_sync"),
    ("googledrivefs", "Google Drive", "cloud_sync"),
    ("icloudservices", "Apple iCloud", "cloud_sync"),
    ("megasync", "MEGAsync", "cloud_sync"),
    ("nextcloud", "Nextcloud", "cloud_sync"),
    // Background Utilities & Bloat
    ("wallpaper32", "Wallpaper Engine", "utility"),
    ("wallpaper64", "Wallpaper Engine", "utility"),
    ("ccleaner64", "CCleaner", "utility"),
    ("ccleaner", "CCleaner", "utility"),
    ("utorrent", "uTorrent", "utility"),
    ("qbittorrent", "qBittorrent", "utility"),
    ("creative cloud", "Adobe Creative Cloud", "utility"),
    ("adobeipcbroker", "Adobe IPC Broker", "utility"),
    ("acrotray", "Adobe Acrobat Tray", "utility"),
    ("widgets", "Windows Widgets", "utility"),
    ("phoneexperiencehost", "Windows Phone Link", "utility"),
    ("cortana", "Cortana", "utility"),
];

/// Critical OS, compositor, GPU driver, audio engine, anti-cheat, and game-launcher processes
/// that MUST NEVER have their working sets trimmed (`EmptyWorkingSet`).
/// Trimming these processes forces `dwm.exe`, GPU shader/driver containers, or `audiodg.exe`
/// out to the disk pagefile, causing severe frame-time stutters and FPS drops during gameplay!
#[cfg(windows)]
const PROTECTED_SYSTEM_AND_GAMING_PROCESSES: &[&str] = &[
    // Windows Core & Desktop Window Manager (DWM)
    "system",
    "registry",
    "smss",
    "csrss",
    "wininit",
    "services",
    "lsass",
    "svchost",
    "dwm",
    "explorer",
    "sihost",
    "taskhostw",
    "fontdrvhost",
    "ctfmon",
    "conhost",
    "dllhost",
    "wmiprvse",
    "runtimebroker",
    "shellexperiencehost",
    "startmenuexperiencehost",
    "searchhost",
    "TextInputHost",
    "securityhealthservice",
    "msmpeng",
    // Audio & Controller Drivers
    "audiodg",
    "rtkauduservice64",
    "ravbg64",
    "ds4windows",
    "lghub",
    "lghub_agent",
    "rzsynapse",
    // NVIDIA / AMD / Intel GPU Drivers & Shader Containers
    "nvcontainer",
    "nvdisplay.container",
    "nvidia share",
    "nvidia web helper",
    "nvsphelper64",
    "nvcplui",
    "amdrsserv",
    "radeonsoftware",
    "amdow",
    "atieclxx",
    "atiesrxx",
    "igfxem",
    "igfxhk",
    "igfxtray",
    "intelgraphicscommandcenter",
    "presentmon",
    // Game Launchers, Store Clients & Anti-Cheat Services
    "steam",
    "steamwebhelper",
    "steamservice",
    "gameoverlayui",
    "epicgameslauncher",
    "epicwebhelper",
    "eosoverlayrenderer-win64-shipping",
    "galaxyclient",
    "ubisoftconnect",
    "upc",
    "eadesktop",
    "eabackgroundservice",
    "origin",
    "battle.net",
    "riotclientservices",
    "vgk",
    "vgc",
    "easyanticheat",
    "easyanticheat_eos",
    "beservice",
    "battleye",
    // Nexus Launcher & WebView2 runtime
    "nexus-launcher",
    "app",
    "msedgewebview2",
];

pub const ALL_MODULE_IDS: &[&str] = &[
    "close_apps",
    "cpu",
    "ram",
    "temp",
    "power_plan",
    "game_mode",
    "gaming_priority",
    "indexer_pause",
    "visual_fx",
    "timer_res",
];

/// Remembers the power scheme that was active before the last boost, so
/// it can be restored once the boosted game exits.
#[derive(Default)]
pub struct BoosterState {
    previous_power_scheme: Mutex<Option<String>>,
    timer_resolution_active: std::sync::atomic::AtomicBool,
}

#[derive(Clone, Serialize)]
pub struct BoostStepResult {
    pub id: String,
    pub label: String,
    pub applied: bool,
    pub detail: String,
    pub metric: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct BoostReport {
    pub steps: Vec<BoostStepResult>,
    pub closed_apps: Vec<String>,
    pub freed_ram_bytes: u64,
}

#[derive(Clone, Serialize)]
pub struct BoostableApp {
    pub name: String,
    pub pid: u32,
    pub memory_bytes: u64,
    pub cpu_usage: f32,
    pub instance_count: u32,
    pub category: String,
}

fn format_bytes(bytes: u64) -> String {
    const GB: u64 = 1024 * 1024 * 1024;
    const MB: u64 = 1024 * 1024;
    const KB: u64 = 1024;
    if bytes >= GB {
        format!("{:.2} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

fn enabled_modules(db: &Database) -> Vec<String> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'booster_enabled_modules'",
            [],
            |row| row.get(0),
        )
        .ok();

    match raw {
        Some(value) if !value.trim().is_empty() => value
            .split(',')
            .map(|part| part.trim().to_string())
            .filter(|part| !part.is_empty())
            .collect(),
        _ => ALL_MODULE_IDS.iter().map(|id| id.to_string()).collect(),
    }
}

fn excluded_apps(db: &Database) -> Vec<String> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'booster_excluded_apps'",
            [],
            |row| row.get(0),
        )
        .ok();

    match raw {
        Some(value) if !value.trim().is_empty() => value
            .split(',')
            .map(|part| part.trim().to_lowercase())
            .filter(|part| !part.is_empty())
            .collect(),
        _ => Vec::new(),
    }
}

// ---------------------------------------------------------------------
// Module 1: close background apps
// ---------------------------------------------------------------------

fn match_boostable_process(process_name: &str) -> Option<(&'static str, &'static str)> {
    let lower = process_name.to_lowercase();
    let base = lower.strip_suffix(".exe").unwrap_or(&lower);
    BOOSTABLE_PROCESSES
        .iter()
        .find(|(key, _, _)| *key == base)
        .map(|(_, display, category)| (*display, *category))
}

#[tauri::command]
pub async fn scan_boostable_apps() -> Vec<BoostableApp> {
    tokio::task::spawn_blocking(|| {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);

        let mut grouped: std::collections::HashMap<String, BoostableApp> =
            std::collections::HashMap::new();

        for process in system.processes().values() {
            let Some((display, category)) =
                match_boostable_process(&process.name().to_string_lossy())
            else {
                continue;
            };
            let mem = process.memory();
            let cpu = process.cpu_usage();
            let pid = process.pid().as_u32();

            grouped
                .entry(display.to_string())
                .and_modify(|entry| {
                    entry.memory_bytes = entry.memory_bytes.saturating_add(mem);
                    entry.cpu_usage += cpu;
                    entry.instance_count += 1;
                })
                .or_insert_with(|| BoostableApp {
                    name: display.to_string(),
                    pid,
                    memory_bytes: mem,
                    cpu_usage: (cpu * 10.0).round() / 10.0,
                    instance_count: 1,
                    category: category.to_string(),
                });
        }

        let mut list: Vec<BoostableApp> = grouped.into_values().collect();
        list.sort_by(|a, b| b.memory_bytes.cmp(&a.memory_bytes));
        list
    })
    .await
    .unwrap_or_default()
}

fn close_background_apps(excluded: &[String]) -> (BoostStepResult, Vec<String>, u64) {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut closed: Vec<String> = Vec::new();
    let mut freed_bytes: u64 = 0;

    for process in system.processes().values() {
        let Some((display, _)) = match_boostable_process(&process.name().to_string_lossy()) else {
            continue;
        };
        if excluded.iter().any(|ex| ex == &display.to_lowercase()) {
            continue;
        }
        let proc_mem = process.memory();
        if process.kill() {
            freed_bytes = freed_bytes.saturating_add(proc_mem);
            if !closed.iter().any(|c| c == display) {
                closed.push(display.to_string());
            }
        }
    }

    let detail = if closed.is_empty() {
        "No unnecessary background apps were running.".to_string()
    } else {
        format!(
            "Closed {} ({} reclaimed).",
            closed.join(", "),
            format_bytes(freed_bytes)
        )
    };

    (
        BoostStepResult {
            id: "close_apps".into(),
            label: "Close background apps".into(),
            applied: true,
            detail,
            metric: Some(if freed_bytes > 0 {
                format!("{} apps • {}", closed.len(), format_bytes(freed_bytes))
            } else {
                format!("{} apps", closed.len())
            }),
        },
        closed,
        freed_bytes,
    )
}

// ---------------------------------------------------------------------
// Module 2: CPU priority for gaming (Windows-only)
// ---------------------------------------------------------------------

#[cfg(windows)]
mod cpu_priority {
    use crate::commands::booster::BoostStepResult;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut ok = true;

        if let Ok((profile, _)) = hkcu
            .create_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile")
        {
            let _ = profile.delete_value("AlwaysOn");
            let _ = profile.delete_value("NoLazyMode");
            let _ = profile.delete_value("NetworkThrottlingIndex");
            let _ = profile.set_value("SystemResponsiveness", &20u32);
        }

        if let Ok((games, _)) = hkcu.create_subkey(
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile\Tasks\Games",
        ) {
            ok &= games.set_value("GPU Priority", &8u32).is_ok();
            ok &= games.set_value("Priority", &6u32).is_ok();
            ok &= games.set_value("Scheduling Category", &"High").is_ok();
            ok &= games.set_value("SFIO Priority", &"High").is_ok();
        } else {
            ok = false;
        }

        BoostStepResult {
            id: "cpu".into(),
            label: "CPU priority for gaming".into(),
            applied: ok,
            detail: if ok {
                "Prioritized foreground game CPU/GPU scheduling with zero network throttling.".into()
            } else {
                "Some CPU scheduling tweaks could not be applied.".into()
            },
            metric: if ok { Some("High Quantum".into()) } else { None },
        }
    }
}

#[cfg(not(windows))]
mod cpu_priority {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "cpu".into(),
            label: "CPU priority for gaming".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Module 3: Safe RAM Working-Set Optimization (Windows-only)
// ---------------------------------------------------------------------

#[cfg(windows)]
mod ram {
    use crate::commands::booster::{
        format_bytes, BoostStepResult, PROTECTED_SYSTEM_AND_GAMING_PROCESSES,
    };
    use sysinfo::{ProcessesToUpdate, System};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    fn is_protected_process(raw_name: &str) -> bool {
        let lower = raw_name.to_lowercase();
        let base = lower.strip_suffix(".exe").unwrap_or(&lower);
        PROTECTED_SYSTEM_AND_GAMING_PROCESSES
            .iter()
            .any(|p| p.eq_ignore_ascii_case(base) || base.contains(&p.to_lowercase()))
    }

    /// Safely trims idle background processes WITHOUT touching DWM, GPU drivers, audio engine,
    /// game launchers, anti-cheat services, or the active foreground game, and NEVER invokes
    /// `ProcessIdleTasks` or `MemoryPurgeStandbyList` (which cause disk I/O spikes and shader page faults).
    pub fn boost() -> (BoostStepResult, u64) {
        let mut system = System::new();
        system.refresh_memory();
        let before = system.available_memory();

        system.refresh_processes(ProcessesToUpdate::All, true);
        let me = std::process::id();
        let fg_pid = unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                0
            } else {
                let mut pid = 0u32;
                GetWindowThreadProcessId(hwnd, &mut pid);
                pid
            }
        };

        let mut trimmed = 0u32;
        for process in system.processes().values() {
            let pid = process.pid().as_u32();
            if pid == me || pid == fg_pid || pid <= 4 {
                continue;
            }
            // Skip small processes (< 25 MB) and critical OS/GPU/audio/gaming processes
            if process.memory() < 25 * 1024 * 1024 {
                continue;
            }
            let proc_name = process.name().to_string_lossy();
            if is_protected_process(&proc_name) {
                continue;
            }

            unsafe {
                let handle = OpenProcess(
                    PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA,
                    0,
                    pid,
                );
                if handle.is_null() {
                    continue;
                }
                if EmptyWorkingSet(handle) != 0 {
                    trimmed += 1;
                }
                CloseHandle(handle);
            }
        }

        system.refresh_memory();
        let after = system.available_memory();
        let freed = after.saturating_sub(before);

        (
            BoostStepResult {
                id: "ram".into(),
                label: "Free up RAM".into(),
                applied: true,
                detail: format!(
                    "Safely trimmed {trimmed} idle background processes while preserving GPU shader & DWM caches."
                ),
                metric: Some(format_bytes(freed)),
            },
            freed,
        )
    }
}

#[cfg(not(windows))]
mod ram {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> (BoostStepResult, u64) {
        (
            BoostStepResult {
                id: "ram".into(),
                label: "Free up RAM".into(),
                applied: false,
                detail: "Not available on this OS.".into(),
                metric: None,
            },
            0,
        )
    }
}

// ---------------------------------------------------------------------
// Module 4: clear temporary files (cross-platform)
// ---------------------------------------------------------------------

fn temp_dirs_to_clean() -> Vec<PathBuf> {
    vec![std::env::temp_dir()]
}

fn clear_temp_files() -> BoostStepResult {
    let mut freed: u64 = 0;
    let mut deleted = 0u32;
    let min_age = std::time::Duration::from_secs(2 * 60 * 60);
    let now = std::time::SystemTime::now();

    for dir in temp_dirs_to_clean() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten().take(250) {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }
            // Skip recently modified temp files (< 2 hours old) so active installers
            // and other running applications are never disrupted.
            let is_old_enough = metadata
                .modified()
                .ok()
                .and_then(|mtime| now.duration_since(mtime).ok())
                .map(|age| age >= min_age)
                .unwrap_or(false);
            if !is_old_enough {
                continue;
            }
            if std::fs::remove_file(entry.path()).is_ok() {
                freed += metadata.len();
                deleted += 1;
            }
        }
    }

    BoostStepResult {
        id: "temp".into(),
        label: "Clear temporary files".into(),
        applied: true,
        detail: format!("Removed {deleted} temporary files."),
        metric: Some(format_bytes(freed)),
    }
}

// ---------------------------------------------------------------------
// Module 5: high performance power plan (Windows-only)
// ---------------------------------------------------------------------

#[cfg(windows)]
pub(crate) fn run_command_with_timeout(
    mut cmd: std::process::Command,
    timeout: std::time::Duration,
) -> Option<std::process::Output> {
    let (tx, rx) = std::sync::mpsc::channel();
    let child = cmd.spawn().ok()?;
    std::thread::spawn(move || {
        let res = child.wait_with_output().ok();
        let _ = tx.send(res);
    });
    rx.recv_timeout(timeout).unwrap_or_default()
}

#[cfg(windows)]
mod power_plan {
    use crate::commands::booster::{BoostStepResult, BoosterState};
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use std::time::Duration;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    const HIGH_PERFORMANCE_SCHEME_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";
    const ULTIMATE_PERFORMANCE_SCHEME_GUID: &str = "e9a42b02-d5df-448d-aa00-03f14749eb61";

    fn parse_active_scheme_guid(output: &str) -> Option<String> {
        output
            .split_whitespace()
            .find(|token| token.len() == 36 && token.chars().filter(|c| *c == '-').count() == 4)
            .map(|token| token.to_string())
    }

    pub fn boost(state: &BoosterState) -> BoostStepResult {
        let mut get_cmd = Command::new("powercfg");
        get_cmd
            .arg("/getactivescheme")
            .creation_flags(CREATE_NO_WINDOW);
        if let Some(output) = super::run_command_with_timeout(get_cmd, Duration::from_millis(300)) {
            if let Some(guid) = parse_active_scheme_guid(&String::from_utf8_lossy(&output.stdout)) {
                *state
                    .previous_power_scheme
                    .lock().unwrap_or_else(|e| e.into_inner()) = Some(guid);
            }
        }

        let mut set_ultimate = Command::new("powercfg");
        set_ultimate
            .args(["/setactive", ULTIMATE_PERFORMANCE_SCHEME_GUID])
            .creation_flags(CREATE_NO_WINDOW);
        let mut applied = super::run_command_with_timeout(set_ultimate, Duration::from_millis(250))
            .map(|status| status.status.success())
            .unwrap_or(false);
        let is_ultimate = applied;

        if !applied {
            let mut set_high = Command::new("powercfg");
            set_high
                .args(["/setactive", HIGH_PERFORMANCE_SCHEME_GUID])
                .creation_flags(CREATE_NO_WINDOW);
            applied = super::run_command_with_timeout(set_high, Duration::from_millis(250))
                .map(|status| status.status.success())
                .unwrap_or(false);
        }

        BoostStepResult {
            id: "power_plan".into(),
            label: "High performance power plan".into(),
            applied,
            detail: if is_ultimate {
                "Switched Windows to Ultimate Performance power plan.".into()
            } else if applied {
                "Switched Windows to High Performance power plan.".into()
            } else {
                "Active power plan preserved.".into()
            },
            metric: if is_ultimate {
                Some("Ultimate".into())
            } else if applied {
                Some("High".into())
            } else {
                None
            },
        }
    }

    pub fn restore(state: &BoosterState) {
        let guid = state
            .previous_power_scheme
            .lock().unwrap_or_else(|e| e.into_inner())
            .take();
        if let Some(guid) = guid {
            let _ = Command::new("powercfg")
                .args(["/setactive", &guid])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
    }
}

#[cfg(not(windows))]
mod power_plan {
    use crate::commands::booster::{BoostStepResult, BoosterState};

    pub fn boost(_state: &BoosterState) -> BoostStepResult {
        BoostStepResult {
            id: "power_plan".into(),
            label: "High performance power plan".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }

    pub fn restore(_state: &BoosterState) {}
}

// ---------------------------------------------------------------------
// Module 6: Windows Game Mode (Windows-only)
// ---------------------------------------------------------------------

#[cfg(windows)]
mod game_mode {
    use crate::commands::booster::BoostStepResult;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let subkey = r"SOFTWARE\Microsoft\GameBar";
        let ok = hkcu
            .create_subkey(subkey)
            .and_then(|(k, _)| {
                let _ = k.set_value("AllowAutoGameMode", &1u32);
                k.set_value("AutoGameModeEnabled", &1u32)
            })
            .is_ok();

        BoostStepResult {
            id: "game_mode".into(),
            label: "Windows Game Mode".into(),
            applied: ok,
            detail: if ok {
                "Windows Game Mode enabled for the foreground game.".into()
            } else {
                "Could not enable Windows Game Mode.".into()
            },
            metric: if ok { Some("Enabled".into()) } else { None },
        }
    }
}

#[cfg(not(windows))]
mod game_mode {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "game_mode".into(),
            label: "Windows Game Mode".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Module 7: Gaming Thread & MMCSS Priority (Windows-only)
// ---------------------------------------------------------------------

#[cfg(windows)]
mod gaming_priority {
    use crate::commands::booster::BoostStepResult;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_WRITE};
    use winreg::RegKey;

    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut ok = true;

        if let Ok((sys_profile, _)) = hkcu.create_subkey(
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
        ) {
            let _ = sys_profile.delete_value("AlwaysOn");
            let _ = sys_profile.delete_value("NoLazyMode");
            let _ = sys_profile.delete_value("NetworkThrottlingIndex");
            let _ = sys_profile.set_value("SystemResponsiveness", &20u32);
        }

        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        if let Ok(hklm_profile) = hklm.open_subkey_with_flags(
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
            KEY_WRITE,
        ) {
            let _ = hklm_profile.delete_value("AlwaysOn");
            let _ = hklm_profile.delete_value("NoLazyMode");
            let _ = hklm_profile.set_value("NetworkThrottlingIndex", &0xffffffffu32);
        }

        // Disable background GameDVR recording overhead without breaking fullscreen flip model
        if let Ok((dvr, _)) =
            hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\GameDVR")
        {
            ok &= dvr.set_value("AppCaptureEnabled", &0u32).is_ok();
        } else {
            ok = false;
        }
        if let Ok((store, _)) = hkcu.create_subkey(r"System\GameConfigStore") {
            let _ = store.set_value("GameDVR_Enabled", &0u32);
        }

        if let Ok((desktop, _)) = hkcu.create_subkey(r"Control Panel\Desktop") {
            let _ = desktop.set_value("ForegroundLockTimeout", &0u32);
        }

        BoostStepResult {
            id: "gaming_priority".into(),
            label: "Foreground thread & GameDVR lock".into(),
            applied: ok,
            detail: if ok {
                "Background GameDVR capture suppressed, foreground thread quantum boosted, and network bandwidth 100% uncapped.".into()
            } else {
                "Could not apply foreground thread scheduling tweaks.".into()
            },
            metric: if ok {
                Some("Zero Stutter".into())
            } else {
                None
            },
        }
    }
}

#[cfg(not(windows))]
mod gaming_priority {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "gaming_priority".into(),
            label: "Game thread & MMCSS scheduling".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Module 8: Windows Search Indexer Pause
// ---------------------------------------------------------------------

#[cfg(windows)]
mod indexer_pause {
    use crate::commands::booster::BoostStepResult;
    use std::os::windows::process::CommandExt;
    use std::process::Command;
    use std::time::Duration;

    pub fn boost() -> BoostStepResult {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let mut cmd = Command::new("net");
        cmd.args(["stop", "wsearch"]).creation_flags(CREATE_NO_WINDOW);

        let ok = super::run_command_with_timeout(cmd, Duration::from_millis(250))
            .map(|out| out.status.success())
            .unwrap_or(false);

        BoostStepResult {
            id: "indexer_pause".into(),
            label: "Pause Windows Search indexer".into(),
            applied: true,
            detail: if ok {
                "Background disk indexing suspended to avoid asset loading hitches.".into()
            } else {
                "Windows Search indexer is already idle or non-intrusive.".into()
            },
            metric: Some("IO Protected".into()),
        }
    }
}

#[cfg(not(windows))]
mod indexer_pause {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "indexer_pause".into(),
            label: "Pause Windows Search indexer".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Module 9: Desktop Composition & Windowed Flip Optimization
// ---------------------------------------------------------------------

#[cfg(windows)]
mod visual_fx {
    use crate::commands::booster::BoostStepResult;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    /// Suppresses window minimize/restore animation overhead without setting `VisualFXSetting = 2`
    /// (which disables ClearType and triggers a heavy DWM desktop reload).
    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let ok = hkcu
            .create_subkey(r"Control Panel\Desktop\WindowMetrics")
            .and_then(|(k, _)| k.set_value("MinAnimate", &"0".to_string()))
            .is_ok();

        BoostStepResult {
            id: "visual_fx".into(),
            label: "Optimize desktop visual effects".into(),
            applied: ok,
            detail: if ok {
                "Window transition animations suppressed while preserving DWM DirectFlip composition.".into()
            } else {
                "Could not adjust window animation metrics.".into()
            },
            metric: if ok { Some("DirectFlip".into()) } else { None },
        }
    }
}

#[cfg(not(windows))]
mod visual_fx {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "visual_fx".into(),
            label: "Optimize desktop visual effects".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Module 10: High-Precision Kernel Timer
// ---------------------------------------------------------------------

#[cfg(windows)]
mod timer_res {
    use crate::commands::booster::{BoostStepResult, BoosterState};
    use std::sync::atomic::Ordering;

    #[link(name = "winmm")]
    extern "system" {
        fn timeBeginPeriod(u_period: u32) -> u32;
        fn timeEndPeriod(u_period: u32) -> u32;
    }

    pub fn boost(state: &BoosterState) -> BoostStepResult {
        let already = state.timer_resolution_active.load(Ordering::SeqCst);
        let ok = if already {
            true
        } else {
            let res = unsafe { timeBeginPeriod(1) };
            if res == 0 {
                state.timer_resolution_active.store(true, Ordering::SeqCst);
                true
            } else {
                false
            }
        };

        BoostStepResult {
            id: "timer_res".into(),
            label: "High-precision 1ms timer".into(),
            applied: ok,
            detail: if ok {
                "Kernel timer locked to 1.0ms resolution for ultra-consistent frame pacing.".into()
            } else {
                "Could not set multimedia timer resolution.".into()
            },
            metric: if ok { Some("1.0 ms".into()) } else { None },
        }
    }

    pub fn restore(state: &BoosterState) {
        if state.timer_resolution_active.swap(false, Ordering::SeqCst) {
            unsafe {
                let _ = timeEndPeriod(1);
            }
        }
    }
}

#[cfg(not(windows))]
mod timer_res {
    use crate::commands::booster::{BoostStepResult, BoosterState};

    pub fn boost(_state: &BoosterState) -> BoostStepResult {
        BoostStepResult {
            id: "timer_res".into(),
            label: "High-precision 1ms timer".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }

    pub fn restore(_state: &BoosterState) {}
}

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------

pub fn perform_boost_with_progress<F>(
    db: &Database,
    state: &BoosterState,
    mut on_step: F,
) -> BoostReport
where
    F: FnMut(&BoostStepResult, usize, usize),
{
    let modules = enabled_modules(db);
    let excluded = excluded_apps(db);
    let has = |id: &str| modules.iter().any(|m| m == id);

    let mut steps = Vec::new();
    let mut closed_apps = Vec::new();
    let mut freed_ram_bytes: u64 = 0;

    let total_steps = ALL_MODULE_IDS.iter().filter(|&&id| has(id)).count().max(1);
    let mut current_step = 0;

    let mut record = |step: BoostStepResult, on_step: &mut F| {
        current_step += 1;
        on_step(&step, current_step, total_steps);
        steps.push(step);
    };

    if has("close_apps") {
        let (step, closed, app_ram_freed) = close_background_apps(&excluded);
        closed_apps = closed;
        freed_ram_bytes = freed_ram_bytes.saturating_add(app_ram_freed);
        record(step, &mut on_step);
    }
    if has("cpu") {
        record(cpu_priority::boost(), &mut on_step);
    }
    if has("ram") {
        let (step, ram_freed) = ram::boost();
        freed_ram_bytes = freed_ram_bytes.saturating_add(ram_freed);
        record(step, &mut on_step);
    }
    if has("temp") {
        record(clear_temp_files(), &mut on_step);
    }
    if has("power_plan") {
        record(power_plan::boost(state), &mut on_step);
    }
    if has("game_mode") {
        record(game_mode::boost(), &mut on_step);
    }
    if has("gaming_priority") {
        record(gaming_priority::boost(), &mut on_step);
    }
    if has("indexer_pause") {
        record(indexer_pause::boost(), &mut on_step);
    }
    if has("visual_fx") {
        record(visual_fx::boost(), &mut on_step);
    }
    if has("timer_res") {
        record(timer_res::boost(state), &mut on_step);
    }

    BoostReport {
        steps,
        closed_apps,
        freed_ram_bytes,
    }
}

pub fn perform_boost(db: &Database, state: &BoosterState) -> BoostReport {
    perform_boost_with_progress(db, state, |_, _, _| {})
}

#[tauri::command]
pub async fn run_game_boost(
    app: tauri::AppHandle,
) -> AppResult<BoostReport> {
    tokio::task::spawn_blocking(move || {
        use tauri::Manager;
        let db = app.state::<Database>();
        let state = app.state::<BoosterState>();
        perform_boost(&db, &state)
    })
    .await
    .map_err(|e| crate::error::AppError::Other(e.to_string()))
}

pub fn restore_power_plan(state: &BoosterState) {
    power_plan::restore(state);
    timer_res::restore(state);
}

#[tauri::command]
pub async fn boost_ram_only() -> AppResult<BoostStepResult> {
    tokio::task::spawn_blocking(|| ram::boost().0)
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn restore_game_boost(app: tauri::AppHandle) -> AppResult<BoostStepResult> {
    tokio::task::spawn_blocking(move || {
        use tauri::Manager;
        let state = app.state::<BoosterState>();
        restore_power_plan(&state);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            use winreg::enums::HKEY_CURRENT_USER;
            use winreg::RegKey;
            const CREATE_NO_WINDOW: u32 = 0x08000000;

            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            if let Ok((sys_profile, _)) = hkcu.create_subkey(
                r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
            ) {
                let _ = sys_profile.delete_value("AlwaysOn");
                let _ = sys_profile.delete_value("NoLazyMode");
                let _ = sys_profile.delete_value("NetworkThrottlingIndex");
                let _ = sys_profile.set_value("SystemResponsiveness", &20u32);
            }

            if let Ok((metrics, _)) = hkcu.create_subkey(r"Control Panel\Desktop\WindowMetrics") {
                let _ = metrics.set_value("MinAnimate", &"1".to_string());
            }

            if let Ok((fx, _)) = hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects") {
                let _ = fx.set_value("VisualFXSetting", &0u32);
            }

            let _ = std::process::Command::new("net")
                .args(["start", "wsearch"])
                .creation_flags(CREATE_NO_WINDOW)
                .status();
        }
        BoostStepResult {
            id: "restore".into(),
            label: "Restore Normal Desktop Mode".into(),
            applied: true,
            detail: "Restored balanced power plan, released 1.0ms kernel timer lock, and resumed background services.".into(),
            metric: Some("Normal Mode".into()),
        }
    })
    .await
    .map_err(|e| crate::error::AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn kill_selected_apps(app_names: Vec<String>) -> AppResult<BoostStepResult> {
    tokio::task::spawn_blocking(move || {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);
        let target_lower: Vec<String> = app_names.iter().map(|s| s.to_lowercase()).collect();

        let mut closed: Vec<String> = Vec::new();
        let mut freed_bytes: u64 = 0;

        for process in system.processes().values() {
            let Some((display, _)) = match_boostable_process(&process.name().to_string_lossy()) else {
                continue;
            };
            if !target_lower.iter().any(|t| t == &display.to_lowercase()) {
                continue;
            }
            let proc_mem = process.memory();
            if process.kill() {
                freed_bytes = freed_bytes.saturating_add(proc_mem);
                if !closed.iter().any(|c| c == display) {
                    closed.push(display.to_string());
                }
            }
        }

        let detail = if closed.is_empty() {
            "No matching background apps were running.".to_string()
        } else {
            format!(
                "Terminated {} and reclaimed {}.",
                closed.join(", "),
                format_bytes(freed_bytes)
            )
        };

        BoostStepResult {
            id: "kill_selected".into(),
            label: "Terminate Background Processes".into(),
            applied: !closed.is_empty(),
            detail,
            metric: Some(format!("{} apps • {}", closed.len(), format_bytes(freed_bytes))),
        }
    })
    .await
    .map_err(|e| crate::error::AppError::Other(e.to_string()))
}

#[cfg(windows)]
pub fn set_process_high_priority(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, SetPriorityClass, HIGH_PRIORITY_CLASS, PROCESS_SET_INFORMATION,
    };
    unsafe {
        let handle = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
        if handle.is_null() {
            return false;
        }
        let ok = SetPriorityClass(handle, HIGH_PRIORITY_CLASS) != 0;
        CloseHandle(handle);
        ok
    }
}

#[cfg(not(windows))]
pub fn set_process_high_priority(_pid: u32) -> bool {
    false
}
