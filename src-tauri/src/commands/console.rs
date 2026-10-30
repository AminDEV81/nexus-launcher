//! Console Mode (Big Picture) Backend Commands & Guide-Button Listener.
//!
//! Provides fullscreen/monitor lifecycle management, display-awake execution
//! state guards, system & controller battery status, master volume control,
//! game window foreground handoff (`console_resume_game`), dominant cover
//! color extraction (`console_extract_dominant_color`), whitelisted power
//! actions (`console_power_action`), and the opt-in Guide/PS button listener
//! (`console_guide_listener_start` / `console_guide_listener_stop`).

use crate::commands::dualsense::DualSenseEngineState;
use crate::commands::overlay::window::{MonitorDto, OverlayWindowManager};
use crate::commands::save_manager::fs_ops::is_valid_id_segment;
use crate::commands::save_manager::session::SessionManager;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use image::GenericImageView;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedWindowGeometry {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub maximized: bool,
    pub fullscreen: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ControllerBatteryStatus {
    pub slot_index: u8,
    pub name: String,
    pub glyph_family: String, // "playstation" | "xbox"
    pub connected: bool,
    pub battery_percent: u8,
    pub charging: bool,
    pub emulation_active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsoleSystemStatus {
    pub in_console_mode: bool,
    pub quick_menu_open: bool,
    pub guide_listener_active: bool,
    pub master_volume: u32,
    pub system_battery_percent: Option<u8>,
    pub system_battery_charging: bool,
    pub controllers: Vec<ControllerBatteryStatus>,
    pub launched_with_console_flag: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuideEventPayload {
    pub source: String, // "xinput_guide" | "xinput_combo" | "dualsense_ps" | "dualsense_combo"
    pub slot_index: u8,
    pub timestamp_ms: i64,
}

pub struct ConsoleModeState {
    pub in_console_mode: AtomicBool,
    pub quick_menu_open: AtomicBool,
    pub guide_listener_running: Arc<AtomicBool>,
    pub master_volume: AtomicU32,
    pub previous_geometry: Mutex<Option<SavedWindowGeometry>>,
    pub color_cache: Mutex<HashMap<String, String>>,
    pub launched_with_console_flag: bool,
}

impl Default for ConsoleModeState {
    fn default() -> Self {
        Self::new()
    }
}

impl ConsoleModeState {
    pub fn new() -> Self {
        let has_console_arg = std::env::args().any(|a| a.trim() == "--console");
        Self {
            in_console_mode: AtomicBool::new(has_console_arg),
            quick_menu_open: AtomicBool::new(false),
            guide_listener_running: Arc::new(AtomicBool::new(false)),
            master_volume: AtomicU32::new(get_os_master_volume().unwrap_or(85)),
            previous_geometry: Mutex::new(None),
            color_cache: Mutex::new(HashMap::new()),
            launched_with_console_flag: has_console_arg,
        }
    }
}

pub fn clamp_volume_level(level: i64) -> u32 {
    level.clamp(0, 100) as u32
}

pub fn clamp_ui_scale(scale: i64) -> i64 {
    scale.clamp(80, 150)
}

pub fn clamp_safe_margin(margin: i64) -> i64 {
    margin.clamp(0, 10)
}

pub fn validate_power_action(raw: &str) -> AppResult<&'static str> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "sleep" => Ok("sleep"),
        "hibernate" => Ok("hibernate"),
        "restart" => Ok("restart"),
        "shutdown" => Ok("shutdown"),
        "lock" => Ok("lock"),
        "cancel" => Ok("cancel"),
        other => Err(AppError::Invalid(format!(
            "Unsupported power action '{other}'. Allowed: sleep, hibernate, restart, shutdown, lock, cancel."
        ))),
    }
}

/// Validates any `console_*` setting key/value pair during settings updates or backup imports.
pub fn validate_console_setting_value(key: &str, value: &str) -> Option<String> {
    let v = value.trim();
    match key {
        "console_enabled"
        | "console_start_in_console"
        | "console_sounds"
        | "console_haptics"
        | "console_confirm_swap"
        | "console_screensaver"
        | "console_ost_preview"
        | "console_guide_enabled"
        | "console_reduce_motion"
        | "console_minimal_home" => {
            if matches!(v, "0" | "1" | "true" | "false") {
                Some(if v == "1" || v == "true" { "1" } else { "0" }.to_string())
            } else {
                Some("0".to_string())
            }
        }
        "console_monitor" => v
            .parse::<usize>()
            .ok()
            .filter(|&idx| idx <= 16)
            .map(|idx| idx.to_string()),
        "console_ui_scale" => v
            .parse::<i64>()
            .ok()
            .map(|n| clamp_ui_scale(n).to_string()),
        "console_safe_margin" => v
            .parse::<i64>()
            .ok()
            .map(|n| clamp_safe_margin(n).to_string()),
        "console_sound_volume" => v
            .parse::<i64>()
            .ok()
            .map(|n| clamp_volume_level(n).to_string()),
        "console_idle_minutes" => v
            .parse::<i64>()
            .ok()
            .map(|n| n.clamp(1, 120).to_string()),
        "console_theme" => {
            if matches!(v, "cyberpunk" | "oled" | "light") {
                Some(v.to_string())
            } else {
                Some("cyberpunk".to_string())
            }
        }
        "console_glyph_override" => {
            if matches!(v, "auto" | "playstation" | "xbox" | "switch" | "keyboard") {
                Some(v.to_string())
            } else {
                Some("auto".to_string())
            }
        }
        "console_guide_combo" => {
            if matches!(v, "back_start" | "guide_only" | "both") {
                Some(v.to_string())
            } else {
                Some("both".to_string())
            }
        }
        "console_language" => {
            if matches!(v, "en" | "fa") {
                Some(v.to_string())
            } else {
                Some("en".to_string())
            }
        }
        _ => None,
    }
}

#[cfg(target_os = "windows")]
fn set_display_awake(keep_awake: bool) {
    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(esFlags: u32) -> u32;
    }
    const ES_CONTINUOUS: u32 = 0x8000_0000;
    const ES_SYSTEM_REQUIRED: u32 = 0x0000_0001;
    const ES_DISPLAY_REQUIRED: u32 = 0x0000_0002;

    let flags = if keep_awake {
        ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED
    } else {
        ES_CONTINUOUS
    };
    unsafe {
        let _ = SetThreadExecutionState(flags);
    }
}

#[cfg(not(target_os = "windows"))]
fn set_display_awake(_keep_awake: bool) {}

#[cfg(target_os = "windows")]
fn query_system_battery() -> (Option<u8>, bool) {
    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetSystemPowerStatus(lpSystemPowerStatus: *mut SystemPowerStatus) -> i32;
    }
    let mut status = SystemPowerStatus {
        ac_line_status: 255,
        battery_flag: 255,
        battery_life_percent: 255,
        system_status_flag: 0,
        battery_life_time: 0,
        battery_full_life_time: 0,
    };
    let ok = unsafe { GetSystemPowerStatus(&mut status) };
    if ok == 0 || (status.battery_flag & 128) != 0 || status.battery_life_percent > 100 {
        return (None, status.ac_line_status == 1);
    }
    let charging = status.ac_line_status == 1 || (status.battery_flag & 8) != 0;
    (Some(status.battery_life_percent), charging)
}

#[cfg(not(target_os = "windows"))]
fn query_system_battery() -> (Option<u8>, bool) {
    (None, false)
}

#[cfg(target_os = "windows")]
fn get_os_master_volume() -> Option<u32> {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    unsafe {
        let dll_name: Vec<u16> = "winmm.dll\0".encode_utf16().collect();
        let hmod = LoadLibraryW(dll_name.as_ptr());
        if hmod.is_null() {
            return None;
        }
        let proc = GetProcAddress(hmod, b"waveOutGetVolume\0".as_ptr());
        let Some(func_ptr) = proc else {
            return None;
        };
        type WaveOutGetVolumeFn = unsafe extern "system" fn( usize, *mut u32) -> u32;
        let wave_get: WaveOutGetVolumeFn = std::mem::transmute(func_ptr);
        let mut raw_vol: u32 = 0xFFFF_FFFF;
        if wave_get(usize::MAX, &mut raw_vol) == 0 {
            let left = (raw_vol & 0xFFFF) as f64;
            let pct = ((left / 65535.0) * 100.0).round() as u32;
            Some(pct.min(100))
        } else {
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_os_master_volume() -> Option<u32> {
    None
}

#[cfg(target_os = "windows")]
fn set_os_master_volume(level: u32) {
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    unsafe {
        let dll_name: Vec<u16> = "winmm.dll\0".encode_utf16().collect();
        let hmod = LoadLibraryW(dll_name.as_ptr());
        if hmod.is_null() {
            return;
        }
        let proc = GetProcAddress(hmod, b"waveOutSetVolume\0".as_ptr());
        let Some(func_ptr) = proc else {
            return;
        };
        type WaveOutSetVolumeFn = unsafe extern "system" fn(usize, u32) -> u32;
        let wave_set: WaveOutSetVolumeFn = std::mem::transmute(func_ptr);
        let ch = ((level.min(100) as f64 / 100.0) * 65535.0).round() as u32;
        let packed = (ch & 0xFFFF) | ((ch & 0xFFFF) << 16);
        let _ = wave_set(usize::MAX, packed);
    }
}

#[cfg(not(target_os = "windows"))]
fn set_os_master_volume(_level: u32) {}

#[tauri::command]
pub async fn console_mode_enter(
    app: AppHandle,
    state: State<'_, ConsoleModeState>,
    monitor_index: Option<usize>,
) -> AppResult<bool> {
    if let Some(window) = app.get_webview_window("main") {
        // Save previous desktop geometry once before entering fullscreen
        if !state.in_console_mode.load(Ordering::SeqCst) {
            let pos = window
                .outer_position()
                .unwrap_or(tauri::PhysicalPosition::new(100, 100));
            let size = window
                .outer_size()
                .unwrap_or(tauri::PhysicalSize::new(1440, 900));
            let maximized = window.is_maximized().unwrap_or(false);
            let fullscreen = window.is_fullscreen().unwrap_or(false);
            let mut prev = state
                .previous_geometry
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            *prev = Some(SavedWindowGeometry {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
                maximized,
                fullscreen,
            });
        }

        // Move to selected monitor if specified
        if let Some(idx) = monitor_index {
            if let Ok(monitors) = app.available_monitors() {
                if let Some(m) = monitors.get(idx) {
                    let _ = window.set_fullscreen(false);
                    let _ = window.set_position(tauri::Position::Physical(*m.position()));
                }
            }
        }

        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_fullscreen(true);
        let _ = window.set_focus();
    }

    set_display_awake(true);
    state.in_console_mode.store(true, Ordering::SeqCst);
    let _ = app.emit("console://mode-changed", true);
    Ok(true)
}

#[tauri::command]
pub async fn console_mode_exit(
    app: AppHandle,
    state: State<'_, ConsoleModeState>,
) -> AppResult<bool> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_fullscreen(false);
        let _ = window.set_cursor_visible(true);

        let saved = state
            .previous_geometry
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take();

        if let Some(geo) = saved {
            if geo.fullscreen {
                let _ = window.set_fullscreen(true);
            } else if geo.maximized {
                let _ = window.maximize();
            } else {
                let _ = window.unmaximize();
                let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize::new(
                    geo.width.max(1024),
                    geo.height.max(640),
                )));
                let _ = window.set_position(tauri::Position::Physical(
                    tauri::PhysicalPosition::new(geo.x, geo.y),
                ));
            }
        }
        let _ = window.set_focus();
    }

    set_display_awake(false);
    state.in_console_mode.store(false, Ordering::SeqCst);
    let _ = app.emit("console://mode-changed", false);
    Ok(false)
}

#[tauri::command]
pub fn console_list_monitors(app: AppHandle) -> AppResult<Vec<MonitorDto>> {
    Ok(OverlayWindowManager::get_monitors(&app))
}

#[tauri::command]
pub fn console_get_system_status(
    state: State<'_, ConsoleModeState>,
    ds_state: State<'_, DualSenseEngineState>,
) -> AppResult<ConsoleSystemStatus> {
    let (sys_batt, sys_charging) = query_system_battery();
    let ds_snap = ds_state.snapshot();

    let mut controllers = Vec::new();
    for slot in &ds_snap.slots {
        if slot.dualsense.connected {
            controllers.push(ControllerBatteryStatus {
                slot_index: slot.slot_index,
                name: slot.dualsense.device_name.clone(),
                glyph_family: "playstation".to_string(),
                connected: true,
                battery_percent: slot.dualsense.battery_percent,
                charging: slot.dualsense.battery_charging,
                emulation_active: slot.xbox.emulation_active,
            });
        }
    }

    Ok(ConsoleSystemStatus {
        in_console_mode: state.in_console_mode.load(Ordering::SeqCst),
        quick_menu_open: state.quick_menu_open.load(Ordering::SeqCst),
        guide_listener_active: state.guide_listener_running.load(Ordering::SeqCst),
        master_volume: state.master_volume.load(Ordering::SeqCst),
        system_battery_percent: sys_batt,
        system_battery_charging: sys_charging,
        controllers,
        launched_with_console_flag: state.launched_with_console_flag,
    })
}

#[tauri::command]
pub fn console_get_master_volume(state: State<'_, ConsoleModeState>) -> AppResult<u32> {
    if let Some(os_vol) = get_os_master_volume() {
        state.master_volume.store(os_vol, Ordering::SeqCst);
        return Ok(os_vol);
    }
    Ok(state.master_volume.load(Ordering::SeqCst))
}

#[tauri::command]
pub fn console_set_master_volume(
    level: i64,
    state: State<'_, ConsoleModeState>,
) -> AppResult<u32> {
    let clamped = clamp_volume_level(level);
    set_os_master_volume(clamped);
    state.master_volume.store(clamped, Ordering::SeqCst);
    Ok(clamped)
}

#[cfg(target_os = "windows")]
fn bring_process_window_to_front(target_pid: u32) -> bool {
    use windows_sys::core::BOOL;
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, EnumWindows, GetForegroundWindow, GetWindow, GetWindowThreadProcessId,
        IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindow, GW_OWNER, SW_RESTORE, SW_SHOW,
    };

    struct SearchCtx {
        target_pid: u32,
        found_hwnd: HWND,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut SearchCtx);
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == ctx.target_pid
            && IsWindowVisible(hwnd) != 0
            && GetWindow(hwnd, GW_OWNER).is_null()
        {
            ctx.found_hwnd = hwnd;
            return 0; // stop enumeration
        }
        1
    }

    unsafe {
        let mut ctx = SearchCtx {
            target_pid,
            found_hwnd: std::ptr::null_mut(),
        };
        EnumWindows(Some(enum_proc), &mut ctx as *mut SearchCtx as LPARAM);
        if ctx.found_hwnd.is_null() {
            return false;
        }

        let h = ctx.found_hwnd;
        ShowWindow(h, SW_SHOW);
        if IsIconic(h) != 0 {
            ShowWindow(h, SW_RESTORE);
        }

        let fg_hwnd = GetForegroundWindow();
        let cur_tid = GetCurrentThreadId();
        let fg_tid = if !fg_hwnd.is_null() {
            GetWindowThreadProcessId(fg_hwnd, std::ptr::null_mut())
        } else {
            0
        };

        if fg_tid != 0 && fg_tid != cur_tid {
            AttachThreadInput(fg_tid, cur_tid, 1);
        }
        BringWindowToTop(h);
        SetForegroundWindow(h);
        if fg_tid != 0 && fg_tid != cur_tid {
            AttachThreadInput(fg_tid, cur_tid, 0);
        }
        true
    }
}

#[cfg(not(target_os = "windows"))]
fn bring_process_window_to_front(_target_pid: u32) -> bool {
    false
}

#[tauri::command]
pub async fn console_resume_game(
    app: AppHandle,
    session_mgr: State<'_, SessionManager>,
    game_id: Option<String>,
) -> AppResult<bool> {
    if let Some(ref gid) = game_id {
        if !gid.is_empty() && !is_valid_id_segment(gid) {
            return Err(AppError::Invalid("Invalid game ID.".into()));
        }
    }

    let pid_opt: Option<u32> = if let Some(ref gid) = game_id.filter(|s| !s.is_empty()) {
        session_mgr
            .get_session_by_game(gid)
            .map(|s| s.process_id)
    } else {
        session_mgr
            .list_active_sessions()
            .first()
            .map(|s| s.process_id)
    }
    .or_else(|| {
        let ov_state = app.state::<crate::commands::overlay::OverlayState>();
        let fg = ov_state.foreground_game_pid.load(Ordering::SeqCst);
        if fg > 0 { Some(fg) } else { None }
    });

    let Some(pid) = pid_opt else {
        return Ok(false);
    };

    let focused = tokio::task::spawn_blocking(move || bring_process_window_to_front(pid))
        .await
        .unwrap_or(false);

    Ok(focused)
}

#[tauri::command]
pub async fn console_toggle_quick_menu(
    app: AppHandle,
    state: State<'_, ConsoleModeState>,
    visible: Option<bool>,
) -> AppResult<bool> {
    let cur = state.quick_menu_open.load(Ordering::SeqCst);
    let next = visible.unwrap_or(!cur);
    state.quick_menu_open.store(next, Ordering::SeqCst);

    if next {
        let cfg = crate::commands::overlay::config::current_config(&app);
        let _ = OverlayWindowManager::show(&app, &cfg);
        let _ = OverlayWindowManager::set_click_through(&app, false);
        if let Some(win) = app.get_webview_window("overlay") {
            let _ = win.set_focus();
        }
    } else {
        let cfg = crate::commands::overlay::config::current_config(&app);
        let _ = OverlayWindowManager::set_click_through(&app, cfg.click_through);
        if !crate::commands::overlay::commands::is_hud_active(&app) {
            let _ = OverlayWindowManager::hide(&app);
        }
    }

    let _ = app.emit("overlay://quick-menu", next);
    Ok(next)
}

#[cfg(target_os = "windows")]
fn poll_xinput_guide_or_combo() -> Option<(u8, bool, bool)> {
    // Returns (slot_index, guide_pressed, back_plus_start_pressed) using dynamic ordinal 100
    // (`XInputGetStateEx`) of `xinput1_4.dll` or `xinput1_3.dll`, falling back to `XInputGetState`.
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};

    #[repr(C)]
    #[derive(Default)]
    struct XInputGamepad {
        w_buttons: u16,
        b_left_trigger: u8,
        b_right_trigger: u8,
        s_thumb_lx: i16,
        s_thumb_ly: i16,
        s_thumb_rx: i16,
        s_thumb_ry: i16,
    }

    #[repr(C)]
    #[derive(Default)]
    struct XInputState {
        dw_packet_number: u32,
        gamepad: XInputGamepad,
    }

    type XInputGetStateFn = unsafe extern "system" fn(u32, *mut XInputState) -> u32;

    static XINPUT_FN: std::sync::OnceLock<Option<XInputGetStateFn>> = std::sync::OnceLock::new();
    let func_opt = XINPUT_FN.get_or_init(|| unsafe {
        for dll in ["xinput1_4.dll\0", "xinput1_3.dll\0", "xinput9_1_0.dll\0"] {
            let wide: Vec<u16> = dll.encode_utf16().collect();
            let hmod = LoadLibraryW(wide.as_ptr());
            if !hmod.is_null() {
                // Ordinal 100 is XInputGetStateEx (exposes 0x0400 Guide button bit)
                let ex_proc = GetProcAddress(hmod, 100usize as *const u8);
                if let Some(p) = ex_proc {
                    return Some(std::mem::transmute::<_, XInputGetStateFn>(p));
                }
                let std_proc = GetProcAddress(hmod, b"XInputGetState\0".as_ptr());
                if let Some(p) = std_proc {
                    return Some(std::mem::transmute::<_, XInputGetStateFn>(p));
                }
            }
        }
        None
    });

    let func = (*func_opt)?;
    const XINPUT_GAMEPAD_START: u16 = 0x0010;
    const XINPUT_GAMEPAD_BACK: u16 = 0x0020;
    const XINPUT_GAMEPAD_GUIDE: u16 = 0x0400;

    for user_idx in 0..4u32 {
        let mut st = XInputState::default();
        let res = unsafe { func(user_idx, &mut st) };
        if res == 0 {
            let btns = st.gamepad.w_buttons;
            let guide = (btns & XINPUT_GAMEPAD_GUIDE) != 0;
            let combo = (btns & (XINPUT_GAMEPAD_START | XINPUT_GAMEPAD_BACK))
                == (XINPUT_GAMEPAD_START | XINPUT_GAMEPAD_BACK);
            if guide || combo {
                return Some((user_idx as u8, guide, combo));
            }
        }
    }
    None
}

#[cfg(not(target_os = "windows"))]
fn poll_xinput_guide_or_combo() -> Option<(u8, bool, bool)> {
    None
}

#[tauri::command]
pub fn console_guide_listener_start(
    app: AppHandle,
    state: State<'_, ConsoleModeState>,
) -> AppResult<bool> {
    if state
        .guide_listener_running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(true);
    }

    let running_flag = state.guide_listener_running.clone();
    std::thread::spawn(move || {
        let mut last_fire = Instant::now() - Duration::from_secs(5);
        let mut combo_hold_start: Option<Instant> = None;

        while running_flag.load(Ordering::SeqCst) {
            let now = Instant::now();
            let mut triggered: Option<(&'static str, u8)> = None;

            // 1. Check DualSense slots for PS button or Create+Options hold
            if let Some(ds_state) = app.try_state::<DualSenseEngineState>() {
                let snap = ds_state.snapshot();
                for slot in &snap.slots {
                    if !slot.dualsense.connected {
                        continue;
                    }
                    if slot.dualsense.ps && now.duration_since(last_fire) >= Duration::from_millis(650) {
                        triggered = Some(("dualsense_ps", slot.slot_index));
                        break;
                    }
                    if slot.dualsense.create && slot.dualsense.options {
                        let start = *combo_hold_start.get_or_insert(now);
                        if now.duration_since(start) >= Duration::from_millis(950)
                            && now.duration_since(last_fire) >= Duration::from_millis(1200)
                        {
                            triggered = Some(("dualsense_combo", slot.slot_index));
                            combo_hold_start = None;
                            break;
                        }
                    }
                }
            }

            // 2. Check XInput ordinal 100 (Guide bit 0x0400) or Back+Start 1s chord
            if triggered.is_none() {
                if let Some((slot_idx, guide_bit, combo_bits)) = poll_xinput_guide_or_combo() {
                    if guide_bit && now.duration_since(last_fire) >= Duration::from_millis(650) {
                        triggered = Some(("xinput_guide", slot_idx));
                    } else if combo_bits {
                        let start = *combo_hold_start.get_or_insert(now);
                        if now.duration_since(start) >= Duration::from_millis(950)
                            && now.duration_since(last_fire) >= Duration::from_millis(1200)
                        {
                            triggered = Some(("xinput_combo", slot_idx));
                            combo_hold_start = None;
                        }
                    } else {
                        combo_hold_start = None;
                    }
                } else {
                    combo_hold_start = None;
                }
            }

            if let Some((source, slot_index)) = triggered {
                last_fire = now;
                let payload = GuideEventPayload {
                    source: source.to_string(),
                    slot_index,
                    timestamp_ms: chrono::Utc::now().timestamp_millis(),
                };
                let _ = app.emit("console://guide", payload);
            }

            std::thread::sleep(Duration::from_millis(45));
        }
    });

    Ok(true)
}

#[tauri::command]
pub fn console_guide_listener_stop(state: State<'_, ConsoleModeState>) -> AppResult<bool> {
    state.guide_listener_running.store(false, Ordering::SeqCst);
    Ok(false)
}

/// Compact per-controller input frame read straight from the DualSense engine.
///
/// The browser Gamepad API cannot see a pad that the DualSense engine has cloaked with HidHide,
/// and it sees nothing at all when Xbox emulation is off. Console Mode therefore also polls this
/// frame, so a PS5 controller always drives the UI whether or not Chromium can enumerate it.
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NativePadSlot {
    pub slot_index: u8,
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub emulating: bool,
    pub cross: bool,
    pub circle: bool,
    pub square: bool,
    pub triangle: bool,
    pub l1: bool,
    pub r1: bool,
    pub l2: bool,
    pub r2: bool,
    pub create: bool,
    pub options: bool,
    pub ps: bool,
    pub dpad_up: bool,
    pub dpad_down: bool,
    pub dpad_left: bool,
    pub dpad_right: bool,
    /// Left stick, normalised to -1.0..=1.0 (Y grows downward, like the Gamepad API).
    pub lx: f32,
    pub ly: f32,
}

/// Maps a raw 0..=255 stick byte (centre ~128) to -1.0..=1.0 with a tiny centre snap.
pub fn normalize_stick_axis(raw: u8) -> f32 {
    let v = (f32::from(raw) - 128.0) / 127.0;
    if v.abs() < 0.02 {
        0.0
    } else {
        v.clamp(-1.0, 1.0)
    }
}

#[tauri::command]
pub async fn console_get_native_pad_input(
    ds_state: State<'_, DualSenseEngineState>,
) -> AppResult<Vec<NativePadSlot>> {
    let snap = ds_state.snapshot();
    Ok(snap
        .slots
        .iter()
        .filter(|slot| slot.dualsense.connected)
        .map(|slot| {
            let ds = &slot.dualsense;
            NativePadSlot {
                slot_index: slot.slot_index,
                name: ds.device_name.clone(),
                vendor_id: ds.vendor_id,
                product_id: ds.product_id,
                emulating: slot.xbox.emulation_active,
                cross: ds.cross,
                circle: ds.circle,
                square: ds.square,
                triangle: ds.triangle,
                l1: ds.l1,
                r1: ds.r1,
                l2: ds.l2_button || ds.l2 > 200,
                r2: ds.r2_button || ds.r2 > 200,
                create: ds.create,
                options: ds.options,
                ps: ds.ps,
                dpad_up: ds.dpad_up,
                dpad_down: ds.dpad_down,
                dpad_left: ds.dpad_left,
                dpad_right: ds.dpad_right,
                lx: normalize_stick_axis(ds.lx),
                ly: normalize_stick_axis(ds.ly),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn console_power_action(action: String) -> AppResult<()> {
    let validated = validate_power_action(&action)?;
    match validated {
        "cancel" => crate::commands::system::cancel_shutdown(),
        "sleep" | "hibernate" | "shutdown" => {
            crate::commands::system::shutdown_system(Some(validated.to_string()))
        }
        "restart" => {
            #[cfg(target_os = "windows")]
            {
                std::process::Command::new("shutdown")
                    .args(["/r", "/t", "5", "/c", "Nexus Console Mode initiated system restart."])
                    .spawn()
                    .map_err(|e| AppError::Other(format!("Failed to restart system: {e}")))?;
                Ok(())
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err(AppError::Other(
                    "System restart is currently supported on Windows only.".into(),
                ))
            }
        }
        "lock" => {
            #[cfg(target_os = "windows")]
            {
                #[link(name = "user32")]
                extern "system" {
                    fn LockWorkStation() -> i32;
                }
                let ok = unsafe { LockWorkStation() };
                if ok == 0 {
                    return Err(AppError::Other("Failed to lock workstation.".into()));
                }
                Ok(())
            }
            #[cfg(not(target_os = "windows"))]
            {
                Err(AppError::Other(
                    "Workstation lock is currently supported on Windows only.".into(),
                ))
            }
        }
        _ => unreachable!(),
    }
}

/// Converts an average RGB tuple into a vibrant, readable console accent hex string (`#rrggbb`).
pub fn rgb_to_vibrant_hex(r: u8, g: u8, b: u8) -> String {
    let max_c = r.max(g).max(b) as f32;
    let min_c = r.min(g).min(b) as f32;
    if max_c < 28.0 || (max_c - min_c) < 12.0 {
        // Near-grayscale or very dark cover: fallback to Nexus Cyan-Violet signature
        return "#00e5ff".to_string();
    }
    let boost = (230.0 / max_c).clamp(1.0, 2.2);
    let vr = ((r as f32 * boost).round() as u32).clamp(45, 255) as u8;
    let vg = ((g as f32 * boost).round() as u32).clamp(45, 255) as u8;
    let vb = ((b as f32 * boost).round() as u32).clamp(45, 255) as u8;
    format!("#{vr:02x}{vg:02x}{vb:02x}")
}

#[tauri::command]
pub async fn console_extract_dominant_color(
    db: State<'_, Database>,
    state: State<'_, ConsoleModeState>,
    game_id: String,
) -> AppResult<String> {
    if !is_valid_id_segment(&game_id) {
        return Err(AppError::Invalid("Invalid game ID.".into()));
    }

    if let Ok(guard) = state.color_cache.lock() {
        if let Some(hex) = guard.get(&game_id) {
            return Ok(hex.clone());
        }
    }

    let setting_key = format!("console_accent_{game_id}");
    let cover_path_opt: Option<String> = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        if let Ok(cached_hex) = conn.query_row(
            "SELECT value FROM settings WHERE key = ?1",
            params![&setting_key],
            |row| row.get::<_, String>(0),
        ) {
            if cached_hex.starts_with('#') && cached_hex.len() == 7 {
                if let Ok(mut guard) = state.color_cache.lock() {
                    guard.insert(game_id.clone(), cached_hex.clone());
                }
                return Ok(cached_hex);
            }
        }
        conn.query_row(
            "SELECT COALESCE(cover_path, banner_path, background_path) FROM games WHERE id = ?1",
            params![&game_id],
            |row| row.get::<_, Option<String>>(0),
        )
        .ok()
        .flatten()
    };

    let Some(cover_path) = cover_path_opt.filter(|p| !p.trim().is_empty() && !p.starts_with("http")) else {
        return Ok("#00e5ff".to_string());
    };

    let path_buf = PathBuf::from(&cover_path);
    let computed_hex = tokio::task::spawn_blocking(move || -> String {
        let Ok(meta) = std::fs::metadata(&path_buf) else {
            return "#00e5ff".to_string();
        };
        if !meta.is_file() || meta.len() > 15 * 1024 * 1024 {
            return "#00e5ff".to_string();
        }
        let Ok(img) = image::open(&path_buf) else {
            return "#00e5ff".to_string();
        };
        let thumb = img.thumbnail(32, 32);
        let mut r_sum: u64 = 0;
        let mut g_sum: u64 = 0;
        let mut b_sum: u64 = 0;
        let mut weight_sum: u64 = 0;

        for (_x, _y, px) in thumb.pixels() {
            let [r, g, b, a] = px.0;
            if a < 128 {
                continue;
            }
            let max_c = r.max(g).max(b) as u64;
            let min_c = r.min(g).min(b) as u64;
            let sat = max_c.saturating_sub(min_c);
            let luma = (r as u64 + g as u64 + b as u64) / 3;
            if !(20..=240).contains(&luma) {
                continue;
            }
            let w = (sat + 10).max(1);
            r_sum += (r as u64) * w;
            g_sum += (g as u64) * w;
            b_sum += (b as u64) * w;
            weight_sum += w;
        }

        if weight_sum == 0 {
            "#00e5ff".to_string()
        } else {
            rgb_to_vibrant_hex(
                (r_sum / weight_sum) as u8,
                (g_sum / weight_sum) as u8,
                (b_sum / weight_sum) as u8,
            )
        }
    })
    .await
    .unwrap_or_else(|_| "#00e5ff".to_string());

    if let Ok(mut guard) = state.color_cache.lock() {
        if guard.len() > 512 {
            guard.clear();
        }
        guard.insert(game_id.clone(), computed_hex.clone());
    }
    {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        let _ = conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![&setting_key, &computed_hex],
        );
    }

    Ok(computed_hex)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_power_action_whitelist() {
        assert_eq!(validate_power_action("sleep").unwrap(), "sleep");
        assert_eq!(validate_power_action("  RESTART ").unwrap(), "restart");
        assert_eq!(validate_power_action("shutdown").unwrap(), "shutdown");
        assert_eq!(validate_power_action("lock").unwrap(), "lock");
        assert_eq!(validate_power_action("cancel").unwrap(), "cancel");
        assert!(validate_power_action("format C:").is_err());
        assert!(validate_power_action("rm -rf /").is_err());
    }

    #[test]
    fn test_clamps_and_setting_validators() {
        assert_eq!(clamp_volume_level(-25), 0);
        assert_eq!(clamp_volume_level(65), 65);
        assert_eq!(clamp_volume_level(250), 100);

        assert_eq!(clamp_ui_scale(50), 80);
        assert_eq!(clamp_ui_scale(110), 110);
        assert_eq!(clamp_ui_scale(300), 150);

        assert_eq!(clamp_safe_margin(-3), 0);
        assert_eq!(clamp_safe_margin(5), 5);
        assert_eq!(clamp_safe_margin(25), 10);

        assert_eq!(
            validate_console_setting_value("console_ui_scale", "125"),
            Some("125".to_string())
        );
        assert_eq!(
            validate_console_setting_value("console_ui_scale", "999"),
            Some("150".to_string())
        );
        assert_eq!(
            validate_console_setting_value("console_theme", "oled"),
            Some("oled".to_string())
        );
        assert_eq!(
            validate_console_setting_value("console_theme", "<script>"),
            Some("cyberpunk".to_string())
        );
    }

    #[test]
    fn test_normalize_stick_axis() {
        assert_eq!(normalize_stick_axis(128), 0.0);
        assert_eq!(normalize_stick_axis(129), 0.0); // inside the centre snap
        assert!((normalize_stick_axis(255) - 1.0).abs() < 0.01);
        assert!((normalize_stick_axis(0) + 1.0).abs() < 0.01);
        assert!(normalize_stick_axis(200) > 0.5);
    }

    #[test]
    fn test_rgb_to_vibrant_hex() {
        assert_eq!(rgb_to_vibrant_hex(10, 10, 10), "#00e5ff");
        let vibrant = rgb_to_vibrant_hex(200, 60, 40);
        assert!(vibrant.starts_with('#') && vibrant.len() == 7);
    }
}
