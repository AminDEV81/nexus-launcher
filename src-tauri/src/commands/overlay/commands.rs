use super::config::{current_config, ConfigStore, OverlayConfig};
use super::hotkey::{GlobalHotkeyManager, HotkeyStatus};
use super::telemetry::{OverlayMetrics, TelemetryManager, TelemetryProviderStatus};
use super::window::{MonitorDto, OverlayWindowManager};
use crate::db::Database;
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::Mutex;

pub struct OverlayState {
    pub telemetry: Arc<Mutex<TelemetryManager>>,
    /// Single source of truth for "the HUD window is shown". The window
    /// counts as exactly one telemetry consumer while this is true.
    pub hud_active: AtomicBool,
    /// PID of the last game the watcher saw in the foreground (0 = none).
    pub foreground_game_pid: AtomicU32,
    /// PID the user manually hid the HUD for; the auto-watcher must not
    /// reopen it for this process (0 = none).
    pub suppressed_pid: AtomicU32,
}

impl OverlayState {
    pub fn new() -> Self {
        Self {
            telemetry: Arc::new(Mutex::new(TelemetryManager::new())),
            hud_active: AtomicBool::new(false),
            foreground_game_pid: AtomicU32::new(0),
            suppressed_pid: AtomicU32::new(0),
        }
    }
}

impl Default for OverlayState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ToggleSource {
    /// Hotkey or UI button: the user's decision wins over auto-detection.
    Manual,
    /// Auto game watcher.
    Auto,
}

/// Idempotent show/hide. Keeps the HUD flag, the telemetry consumer count,
/// frame timing and the window in sync, and tells every webview about it.
pub async fn apply_visibility(
    app: &AppHandle,
    target: Option<bool>,
    source: ToggleSource,
) -> Result<bool, String> {
    let state = app.state::<OverlayState>();
    let current = state.hud_active.load(Ordering::SeqCst);
    let target = target.unwrap_or(!current);

    if target == current {
        return Ok(current);
    }

    if target {
        let cfg = current_config(app);
        OverlayWindowManager::show(app, &cfg)?;
        state.hud_active.store(true, Ordering::SeqCst);
        if source == ToggleSource::Manual {
            state.suppressed_pid.store(0, Ordering::SeqCst);
        }
        let mut mgr = state.telemetry.lock().await;
        mgr.add_consumer();
        mgr.start_frame_timing();
    } else {
        OverlayWindowManager::hide(app)?;
        state.hud_active.store(false, Ordering::SeqCst);
        if source == ToggleSource::Manual {
            let fg = state.foreground_game_pid.load(Ordering::SeqCst);
            state.suppressed_pid.store(fg, Ordering::SeqCst);
        }
        let mut mgr = state.telemetry.lock().await;
        mgr.remove_consumer();
        if !mgr.has_active_consumers() {
            mgr.stop_frame_timing();
        }
    }

    let _ = app.emit("overlay://visibility", target);
    Ok(target)
}

pub fn is_hud_active(app: &AppHandle) -> bool {
    app.state::<OverlayState>()
        .hud_active
        .load(Ordering::SeqCst)
}

/// Loads `(id, name, executable_path, install_path)` for installed games.
pub fn load_known_games(
    db: &Database,
) -> Vec<(String, String, Option<String>, Option<String>)> {
    let Ok(conn) = db.connection.lock() else {
        return Vec::new();
    };
    let Ok(mut stmt) = conn
        .prepare("SELECT id, name, executable_path, install_path FROM games WHERE is_installed = 1")
    else {
        return Vec::new();
    };
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?,
            row.get::<_, Option<String>>(3)?,
        ))
    });
    match rows {
        Ok(iter) => iter.flatten().collect(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub async fn get_overlay_config(db: State<'_, Database>) -> Result<OverlayConfig, String> {
    let conn = db.connection.lock().map_err(|e| e.to_string())?;
    Ok(ConfigStore::get(&conn))
}

/// Persists the config (sanitised), applies it to the live window and the
/// global hotkey, and broadcasts it so the overlay webview updates
/// instantly. Returns the sanitised config the UI should adopt.
#[tauri::command]
pub async fn save_overlay_config(
    app: AppHandle,
    db: State<'_, Database>,
    config: OverlayConfig,
) -> Result<OverlayConfig, String> {
    let cfg = {
        let conn = db.connection.lock().map_err(|e| e.to_string())?;
        let mut cfg = config;
        cfg.sanitize();
        ConfigStore::save(&conn, &cfg)?;
        cfg
    };

    app.state::<GlobalHotkeyManager>().set_hotkey(&cfg.hotkey);
    OverlayWindowManager::apply_config(&app, &cfg);

    if !cfg.enabled && is_hud_active(&app) {
        let _ = apply_visibility(&app, Some(false), ToggleSource::Auto).await;
    }

    let _ = app.emit("overlay://config-changed", &cfg);
    Ok(cfg)
}

#[tauri::command]
pub async fn get_overlay_metrics(
    state: State<'_, OverlayState>,
    db: State<'_, Database>,
) -> Result<OverlayMetrics, String> {
    let installed_games = load_known_games(&db);
    let mut mgr = state.telemetry.lock().await;
    Ok(mgr.poll_metrics(&installed_games))
}

#[tauri::command]
pub async fn start_overlay_telemetry(state: State<'_, OverlayState>) -> Result<(), String> {
    let mut mgr = state.telemetry.lock().await;
    mgr.add_consumer();
    mgr.start_frame_timing();
    Ok(())
}

#[tauri::command]
pub async fn stop_overlay_telemetry(state: State<'_, OverlayState>) -> Result<(), String> {
    let mut mgr = state.telemetry.lock().await;
    mgr.remove_consumer();
    if !mgr.has_active_consumers() {
        mgr.stop_frame_timing();
    }
    Ok(())
}

#[tauri::command]
pub async fn toggle_overlay_window(app: AppHandle, show: Option<bool>) -> Result<bool, String> {
    apply_visibility(&app, show, ToggleSource::Manual).await
}

#[tauri::command]
pub async fn is_overlay_visible(app: AppHandle) -> Result<bool, String> {
    Ok(is_hud_active(&app))
}

#[tauri::command]
pub async fn set_overlay_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    OverlayWindowManager::set_click_through(&app, enabled)
}

#[tauri::command]
pub async fn get_overlay_monitors(app: AppHandle) -> Result<Vec<MonitorDto>, String> {
    Ok(OverlayWindowManager::get_monitors(&app))
}

#[tauri::command]
pub async fn get_telemetry_status(
    state: State<'_, OverlayState>,
) -> Result<TelemetryProviderStatus, String> {
    let mgr = state.telemetry.lock().await;
    Ok(mgr.get_provider_status())
}

#[tauri::command]
pub async fn get_overlay_hotkey_status(
    hotkeys: State<'_, GlobalHotkeyManager>,
) -> Result<HotkeyStatus, String> {
    Ok(hotkeys.status())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OverlayNotification {
    /// Optional stable id: a notification with the same id replaces the
    /// previous one instead of stacking.
    pub id: Option<String>,
    /// "info" | "success" | "warning" | "error"
    pub kind: String,
    pub title: String,
    pub body: Option<String>,
    pub duration_ms: Option<u64>,
    /// Origin of the notification: "app" = mirrored launcher toast (can be
    /// switched off separately in settings). Anything else is always shown.
    #[serde(default)]
    pub source: Option<String>,
}

fn truncate_chars(input: &str, max: usize) -> String {
    if input.chars().count() <= max {
        input.to_string()
    } else {
        let mut out: String = input.chars().take(max.saturating_sub(1)).collect();
        out.push('…');
        out
    }
}

/// Delivers a notification to the overlay window. Returns `false` (and
/// drops it) when the HUD isn't showing or notifications are disabled —
/// there is nobody to read it.
#[tauri::command]
pub async fn push_overlay_notification(
    app: AppHandle,
    notification: OverlayNotification,
) -> Result<bool, String> {
    if !is_hud_active(&app) {
        return Ok(false);
    }
    let cfg = current_config(&app);
    if !cfg.notifications.enabled {
        return Ok(false);
    }
    if notification.source.as_deref() == Some("app") && !cfg.notifications.mirror_app_toasts {
        return Ok(false);
    }

    let kind = match notification.kind.as_str() {
        "success" | "warning" | "error" => notification.kind.clone(),
        _ => "info".to_string(),
    };
    let payload = OverlayNotification {
        id: notification.id,
        kind,
        title: truncate_chars(notification.title.trim(), 80),
        body: notification
            .body
            .map(|b| truncate_chars(b.trim(), 240))
            .filter(|b| !b.is_empty()),
        duration_ms: notification.duration_ms.map(|d| d.clamp(1500, 15000)),
        source: notification.source,
    };
    if payload.title.is_empty() {
        return Ok(false);
    }

    app.emit_to("overlay", "overlay://notification", payload)
        .map_err(|e| e.to_string())?;
    Ok(true)
}
