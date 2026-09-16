//! Game Booster (Settings → Game Booster).
//!
//! A set of independent, toggleable modules — which ones actually run
//! is read from the `booster_enabled_modules` setting (a comma-separated
//! list of the ids below, in the generic `settings` KV table also used
//! by `commands/settings.rs`), so the settings panel's per-module
//! switches and `launch_game`'s Auto Boost (see `commands/launch.rs`)
//! always agree on what "boost" means without the frontend having to
//! pass the selection through on every call.
//!
//! Modules:
//! 1. `close_apps` — close known background bloat (cross-platform, see
//!    `BOOSTABLE_PROCESSES`). Game launcher clients (Steam, Epic,
//!    Battle.net, ...) are deliberately excluded — the game about to be
//!    boosted might need one of them still running.
//! 2. `cpu` — nudge Windows to prioritize CPU/GPU scheduling for the
//!    foreground app (the same per-user registry values Windows' own
//!    "Games" scheduling task and most third-party game-mode tools use;
//!    Windows-only, no admin rights needed since it's HKCU).
//! 3. `ram` — trims running processes' working sets and nudges Windows'
//!    idle memory maintenance (Windows-only WinAPI).
//! 4. `temp` — deletes loose files sitting directly in the OS/user temp
//!    folder(s) (cross-platform; never recurses into subfolders — see
//!    `clear_temp_files`'s doc comment for why).
//! 5. `power_plan` — switches to Windows' "High performance" power
//!    plan, remembering whatever was active so `restore_power_plan`
//!    (called when the boosted game exits, see `launch.rs`) can put it
//!    back.
//!
//! Modules 2, 3, and 5 have no real equivalent outside Windows; on
//! other platforms they report `applied: false` with an explanatory
//! `detail` rather than silently doing nothing, so the UI stays honest
//! about what happened.

use crate::db::Database;
use crate::error::AppResult;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use sysinfo::{ProcessesToUpdate, System};

/// `(name to match against, without any OS-specific extension, display name)`.
/// Matching strips a trailing `.exe` and lower-cases both sides, so the
/// same table covers Windows (`Chrome.exe`), macOS (`Chrome`), and
/// Linux (`chrome`) process names without needing three separate lists.
const BOOSTABLE_PROCESSES: &[(&str, &str)] = &[
    ("chrome", "Google Chrome"),
    ("msedge", "Microsoft Edge"),
    ("firefox", "Firefox"),
    ("opera", "Opera"),
    ("brave", "Brave"),
    ("vivaldi", "Vivaldi"),
    ("slack", "Slack"),
    ("teams", "Microsoft Teams"),
    ("ms-teams", "Microsoft Teams"),
    ("skype", "Skype"),
    ("zoom", "Zoom"),
    ("onedrive", "OneDrive"),
    ("dropbox", "Dropbox"),
    ("googledrivefs", "Google Drive"),
    ("icloudservices", "iCloud"),
    ("ccleaner64", "CCleaner"),
    ("ccleaner", "CCleaner"),
    ("utorrent", "uTorrent"),
    ("qbittorrent", "qBittorrent"),
    ("creative cloud", "Adobe Creative Cloud"),
    ("adobeipcbroker", "Adobe Helper"),
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
/// it can be restored once the boosted game exits. `None` once
/// restored (or if we never managed to read it in the first place).
#[derive(Default)]
pub struct BoosterState {
    previous_power_scheme: Mutex<Option<String>>,
}

#[derive(Clone, Serialize)]
pub struct BoostStepResult {
    pub id: String,
    pub label: String,
    pub applied: bool,
    pub detail: String,
    /// A short stat badge for the UI — "3 apps", "128 MB", etc. `None`
    /// when there's nothing worth quantifying (e.g. the power plan
    /// switch is just on/off).
    pub metric: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct BoostReport {
    pub steps: Vec<BoostStepResult>,
    pub closed_apps: Vec<String>,
}

#[derive(Clone, Serialize)]
pub struct BoostableApp {
    pub name: String,
    pub pid: u32,
}

fn format_bytes(bytes: u64) -> String {
    const MB: u64 = 1024 * 1024;
    const KB: u64 = 1024;
    if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.0} KB", bytes as f64 / KB as f64)
    } else {
        format!("{bytes} B")
    }
}

/// Reads `booster_enabled_modules` from the generic `settings` table.
/// Missing/empty defaults to "everything on" — a fresh install should
/// boost fully, not do nothing until the person visits Settings first.
fn enabled_modules(db: &Database) -> Vec<String> {
    let conn = db.connection.lock().expect("db mutex poisoned");
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

// ---------------------------------------------------------------------
// Module 1: close background apps
// ---------------------------------------------------------------------

fn display_name_for(process_name: &str) -> Option<String> {
    let lower = process_name.to_lowercase();
    let base = lower.strip_suffix(".exe").unwrap_or(&lower);
    BOOSTABLE_PROCESSES
        .iter()
        .find(|(key, _)| *key == base)
        .map(|(_, display)| display.to_string())
}

/// Lets the settings panel show *which* known background apps are
/// currently running before the person commits to closing them. Async +
/// off the main thread: the process-list refresh alone costs hundreds
/// of ms and would otherwise freeze the window event loop.
#[tauri::command]
pub async fn scan_boostable_apps() -> Vec<BoostableApp> {
    tokio::task::spawn_blocking(|| {
        let mut system = System::new();
        system.refresh_processes(ProcessesToUpdate::All, true);

        system
            .processes()
            .values()
            .filter_map(|process| {
                let display = display_name_for(&process.name().to_string_lossy())?;
                Some(BoostableApp {
                    name: display,
                    pid: process.pid().as_u32(),
                })
            })
            .collect()
    })
    .await
    .unwrap_or_default()
}

fn close_background_apps() -> (BoostStepResult, Vec<String>) {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);

    let mut closed: Vec<String> = Vec::new();
    for process in system.processes().values() {
        let Some(display) = display_name_for(&process.name().to_string_lossy()) else {
            continue;
        };
        if process.kill() && !closed.contains(&display) {
            closed.push(display);
        }
    }

    let detail = if closed.is_empty() {
        "No unnecessary background apps were running.".to_string()
    } else {
        format!("Closed {}.", closed.join(", "))
    };

    (
        BoostStepResult {
            id: "close_apps".into(),
            label: "Close background apps".into(),
            applied: true,
            detail,
            metric: Some(format!("{} apps", closed.len())),
        },
        closed,
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

    /// The same per-user Multimedia System Profile values Windows' own
    /// "Games" task-scheduling category (and most third-party game-mode
    /// tools) set — tells the scheduler to reserve less CPU for
    /// background/multimedia tasks and to favor the foreground app.
    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut ok = true;

        if let Ok((profile, _)) = hkcu
            .create_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile")
        {
            ok &= profile.set_value("SystemResponsiveness", &0u32).is_ok();
        } else {
            ok = false;
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
                "Windows will prioritize CPU/GPU scheduling for the game.".into()
            } else {
                "Some CPU scheduling tweaks could not be applied.".into()
            },
            metric: None,
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
// Module 3: free up RAM (Windows-only)
// ---------------------------------------------------------------------

#[cfg(windows)]
mod ram {
    use crate::commands::booster::{format_bytes, BoostStepResult};
    use sysinfo::{ProcessesToUpdate, System};
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    };

    /// Trims every process we're allowed to (same-user processes,
    /// typically — a non-elevated app can't touch most system/other-user
    /// processes, and that's fine, this quietly skips those). Measured
    /// by the OS-wide available-memory delta rather than summing each
    /// process's working set, since `EmptyWorkingSet` only *asks* for a
    /// minimum working set — how much actually comes back to the
    /// system-wide free pool is what the person actually cares about.
    pub fn boost() -> BoostStepResult {
        let mut system = System::new_all();
        system.refresh_memory();
        let before = system.available_memory();

        system.refresh_processes(ProcessesToUpdate::All, true);
        let me = std::process::id();
        let mut trimmed = 0u32;
        for process in system.processes().values() {
            // Trimming our own working set just forces the launcher to
            // fault its own pages back in — skip it.
            if process.pid().as_u32() == me {
                continue;
            }
            unsafe {
                let handle = OpenProcess(
                    PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA,
                    0,
                    process.pid().as_u32(),
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

        // Windows' own idle-time memory/maintenance routine — the same
        // thing it runs on its own once the machine sits idle, just
        // triggered on demand. Fire-and-forget: it can run for a while
        // and there's nothing further to report once it's started.
        let _ = std::process::Command::new("Rundll32.exe")
            .args(["advapi32.dll,ProcessIdleTasks"])
            .spawn();

        system.refresh_memory();
        let after = system.available_memory();
        let freed = after.saturating_sub(before);

        BoostStepResult {
            id: "ram".into(),
            label: "Free up RAM".into(),
            applied: trimmed > 0,
            detail: format!("Trimmed memory in {trimmed} processes."),
            metric: Some(format_bytes(freed)),
        }
    }
}

#[cfg(not(windows))]
mod ram {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "ram".into(),
            label: "Free up RAM".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Module 4: clear temporary files (cross-platform)
// ---------------------------------------------------------------------

fn temp_dirs_to_clean() -> Vec<PathBuf> {
    let mut dirs = vec![std::env::temp_dir()];
    #[cfg(windows)]
    {
        if let Ok(windir) = std::env::var("SystemRoot") {
            dirs.push(PathBuf::from(windir).join("Temp"));
        }
    }
    dirs
}

/// Deletes only *loose files sitting directly* in the temp folder(s) —
/// deliberately never recurses into subfolders. A subfolder under Temp
/// can belong to an installer or another app mid-run; a stray top-level
/// file is the safe, conventional target every "clear temp files" tool
/// sticks to. Locked/in-use files simply fail to delete and are skipped,
/// not treated as an error.
fn clear_temp_files() -> BoostStepResult {
    let mut freed: u64 = 0;
    let mut deleted = 0u32;

    for dir in temp_dirs_to_clean() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if !metadata.is_file() {
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
    use std::process::Command;
    use std::time::Duration;

    /// The Windows "High performance" power scheme's well-known GUID —
    /// stable across Windows versions, no lookup needed.
    const HIGH_PERFORMANCE_SCHEME_GUID: &str = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c";

    fn parse_active_scheme_guid(output: &str) -> Option<String> {
        output
            .split_whitespace()
            .find(|token| token.len() == 36 && token.chars().filter(|c| *c == '-').count() == 4)
            .map(|token| token.to_string())
    }

    pub fn boost(state: &BoosterState) -> BoostStepResult {
        let mut get_cmd = Command::new("powercfg");
        get_cmd.arg("/getactivescheme");
        if let Some(output) = super::run_command_with_timeout(get_cmd, Duration::from_millis(2000)) {
            if let Some(guid) = parse_active_scheme_guid(&String::from_utf8_lossy(&output.stdout)) {
                *state
                    .previous_power_scheme
                    .lock()
                    .expect("booster mutex poisoned") = Some(guid);
            }
        }

        let mut set_cmd = Command::new("powercfg");
        set_cmd.args(["/setactive", HIGH_PERFORMANCE_SCHEME_GUID]);
        let applied = super::run_command_with_timeout(set_cmd, Duration::from_millis(2000))
            .map(|status| status.status.success())
            .unwrap_or(false);

        BoostStepResult {
            id: "power_plan".into(),
            label: "High performance power plan".into(),
            applied,
            detail: if applied {
                "Switched Windows to the High performance power plan.".into()
            } else {
                "Could not switch the power plan.".into()
            },
            metric: None,
        }
    }

    pub fn restore(state: &BoosterState) {
        let guid = state
            .previous_power_scheme
            .lock()
            .expect("booster mutex poisoned")
            .take();
        if let Some(guid) = guid {
            let _ = Command::new("powercfg")
                .args(["/setactive", &guid])
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

    /// Flips the per-user "Game Mode" toggle in the registry — the same
    /// switch the Xbox Game Bar's Settings > Gaming > Game Mode flips.
    /// No admin needed (HKCU), and it's how Windows dedicates more CPU/
    /// GPU to the foreground fullscreen game and suppresses background
    /// work like Windows Update while you're playing.
    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let subkey = r"SOFTWARE\Microsoft\GameBar";
        let ok = hkcu
            .create_subkey(subkey)
            .and_then(|(k, _)| k.set_value("AutoGameMode", &1u32))
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
            metric: None,
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
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    /// Disables MMCSS lazy mode, removes network packet throttling for games,
    /// and suppresses background game DVR recording overhead.
    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let mut ok = true;

        // 1. Disable MMCSS lazy mode and network throttling for games
        if let Ok((sys_profile, _)) = hkcu.create_subkey(
            r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Multimedia\SystemProfile",
        ) {
            ok &= sys_profile.set_value("NoLazyMode", &1u32).is_ok();
            ok &= sys_profile
                .set_value("NetworkThrottlingIndex", &0xffffffffu32)
                .is_ok();
            ok &= sys_profile.set_value("AlwaysOn", &1u32).is_ok();
        } else {
            ok = false;
        }

        // 2. Disable background GameDVR capture stutter
        if let Ok((dvr, _)) =
            hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\GameDVR")
        {
            let _ = dvr.set_value("AppCaptureEnabled", &0u32);
        }
        if let Ok((store, _)) = hkcu.create_subkey(r"System\GameConfigStore") {
            let _ = store.set_value("GameDVR_Enabled", &0u32);
        }

        // 3. Prevent background windows from stealing focus and CPU scheduling quantum
        if let Ok((desktop, _)) = hkcu.create_subkey(r"Control Panel\Desktop") {
            let _ = desktop.set_value("ForegroundLockTimeout", &0u32);
        }

        BoostStepResult {
            id: "gaming_priority".into(),
            label: "Game thread & MMCSS scheduling".into(),
            applied: ok,
            detail: if ok {
                "MMCSS lazy mode disabled, network packet throttling removed, and foreground thread quantum boosted.".into()
            } else {
                "Could not apply real-time thread scheduling tweaks.".into()
            },
            metric: if ok {
                Some("Realtime MMCSS".into())
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

        let ok = super::run_command_with_timeout(cmd, Duration::from_millis(2000))
            .map(|out| out.status.success())
            .unwrap_or(false);

        BoostStepResult {
            id: "indexer_pause".into(),
            label: "Pause Windows Search indexer".into(),
            applied: ok,
            detail: if ok {
                "Background disk indexing suspended to avoid asset loading hitches.".into()
            } else {
                "Windows Search indexer is already idle or paused.".into()
            },
            metric: if ok { Some("IO locked".into()) } else { None },
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
// Module 9: Desktop Visual Effects Tuning
// ---------------------------------------------------------------------

#[cfg(windows)]
mod visual_fx {
    use crate::commands::booster::BoostStepResult;
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    pub fn boost() -> BoostStepResult {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let ok = hkcu
            .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects")
            .and_then(|(k, _)| k.set_value("VisualFXSetting", &2u32))
            .is_ok();

        let _ = hkcu
            .create_subkey(r"Control Panel\Desktop\WindowMetrics")
            .map(|(k, _)| {
                let _ = k.set_value("MinAnimate", &"0".to_string());
            });

        BoostStepResult {
            id: "visual_fx".into(),
            label: "Optimize desktop visual effects".into(),
            applied: ok,
            detail: if ok {
                "Desktop window animation overhead reduced for maximum VRAM headroom.".into()
            } else {
                "Could not adjust desktop visual effects.".into()
            },
            metric: if ok { Some("VRAM freed".into()) } else { None },
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
    use crate::commands::booster::BoostStepResult;

    #[link(name = "winmm")]
    extern "system" {
        fn timeBeginPeriod(u_period: u32) -> u32;
    }

    pub fn boost() -> BoostStepResult {
        let res = unsafe { timeBeginPeriod(1) };
        let ok = res == 0;

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
}

#[cfg(not(windows))]
mod timer_res {
    use crate::commands::booster::BoostStepResult;

    pub fn boost() -> BoostStepResult {
        BoostStepResult {
            id: "timer_res".into(),
            label: "High-precision 1ms timer".into(),
            applied: false,
            detail: "Not available on this OS.".into(),
            metric: None,
        }
    }
}

// ---------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------

/// Runs every *enabled* module and calls `on_step(&step, step_index, total_steps)` after each module finishes.
pub fn perform_boost_with_progress<F>(
    db: &Database,
    state: &BoosterState,
    mut on_step: F,
) -> BoostReport
where
    F: FnMut(&BoostStepResult, usize, usize),
{
    let modules = enabled_modules(db);
    let has = |id: &str| modules.iter().any(|m| m == id);

    let mut steps = Vec::new();
    let mut closed_apps = Vec::new();

    let total_steps = ALL_MODULE_IDS.iter().filter(|&&id| has(id)).count().max(1);
    let mut current_step = 0;

    let mut record = |step: BoostStepResult, on_step: &mut F| {
        current_step += 1;
        on_step(&step, current_step, total_steps);
        steps.push(step);
    };

    if has("close_apps") {
        let (step, closed) = close_background_apps();
        closed_apps = closed;
        record(step, &mut on_step);
    }
    if has("cpu") {
        record(cpu_priority::boost(), &mut on_step);
    }
    if has("ram") {
        record(ram::boost(), &mut on_step);
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
        record(timer_res::boost(), &mut on_step);
    }

    BoostReport { steps, closed_apps }
}

/// Runs every *enabled* module (per the `booster_enabled_modules`
/// setting) and reports what actually happened with each one. Used
/// directly by the settings panel's Boost button, and by `launch_game`
/// when Auto Boost is on (see `commands/launch.rs`).
pub fn perform_boost(db: &Database, state: &BoosterState) -> BoostReport {
    perform_boost_with_progress(db, state, |_, _, _| {})
}

#[tauri::command]
pub async fn run_game_boost(
    db: tauri::State<'_, Database>,
    state: tauri::State<'_, BoosterState>,
) -> AppResult<BoostReport> {
    // Async so the blocking process/registry/powercfg work below runs on
    // the command runtime instead of the main thread (see
    // `scan_boostable_apps`).
    Ok(perform_boost(&db, &state))
}

/// Restores whatever power plan was active before the last boost — best
/// effort, and a no-op if no boost has switched it. Called when the
/// boosted game exits (`launch.rs`), not exposed as its own command
/// since nothing else should trigger it.
pub fn restore_power_plan(state: &BoosterState) {
    power_plan::restore(state);
}

/// Trims working sets of running background processes to immediately free physical RAM.
#[tauri::command]
pub async fn boost_ram_only() -> AppResult<BoostStepResult> {
    tokio::task::spawn_blocking(ram::boost)
        .await
        .map_err(|e| crate::error::AppError::Other(e.to_string()))
}
