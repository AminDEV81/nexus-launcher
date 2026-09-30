use super::config::OverlayConfig;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonitorDto {
    pub index: usize,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

pub struct OverlayWindowManager;

impl OverlayWindowManager {
    /// Physical bounds of the monitor selected in the config. Falls back
    /// to the primary monitor (then to 1080p) if the index is stale, e.g.
    /// after a second display was unplugged.
    fn target_bounds(
        app: &AppHandle,
        monitor_index: usize,
    ) -> (tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>, f64) {
        let monitors = app.available_monitors().unwrap_or_default();
        let picked = monitors
            .get(monitor_index)
            .cloned()
            .or_else(|| app.primary_monitor().ok().flatten())
            .or_else(|| monitors.first().cloned());

        match picked {
            Some(m) => (*m.position(), *m.size(), m.scale_factor()),
            None => (
                tauri::PhysicalPosition::new(0, 0),
                tauri::PhysicalSize::new(1920, 1080),
                1.0,
            ),
        }
    }

    fn apply_bounds(app: &AppHandle, win: &WebviewWindow, monitor_index: usize) {
        let (pos, size, _) = Self::target_bounds(app, monitor_index);
        let _ = win.set_position(tauri::Position::Physical(pos));
        let _ = win.set_size(tauri::Size::Physical(size));
    }

    /// Makes the window non-activating and hidden from Alt+Tab so showing
    /// it never steals focus from the game (a focus steal makes the game
    /// minimise or drop out of fullscreen).
    #[cfg(target_os = "windows")]
    fn apply_native_styles(win: &WebviewWindow) {
        if let Ok(hwnd) = win.hwnd() {
            unsafe {
                use windows_sys::Win32::UI::WindowsAndMessaging::{
                    GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_NOACTIVATE,
                    WS_EX_TOOLWINDOW,
                };
                let h = hwnd.0 as _;
                let ex = GetWindowLongPtrW(h, GWL_EXSTYLE);
                SetWindowLongPtrW(
                    h,
                    GWL_EXSTYLE,
                    ex | (WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW) as isize,
                );
            }
        }
    }

    pub fn get_or_create_window(
        app: &AppHandle,
        cfg: &OverlayConfig,
    ) -> Result<WebviewWindow, String> {
        if let Some(existing) = app.get_webview_window("overlay") {
            return Ok(existing);
        }

        let (pos, size, scale) = Self::target_bounds(app, cfg.monitor_index);

        // Transparent, borderless, always-on-top window covering the target monitor.
        let window = WebviewWindowBuilder::new(app, "overlay", WebviewUrl::default())
            .title("Nexus Overlay")
            .initialization_script(
                "window.__NEXUS_IS_OVERLAY__ = true; window.location.hash = '#overlay-window';",
            )
            .position(pos.x as f64 / scale, pos.y as f64 / scale)
            .inner_size(size.width as f64 / scale, size.height as f64 / scale)
            .transparent(true)
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .focused(false)
            .visible(false)
            .resizable(false)
            .build()
            .map_err(|e| format!("Failed to create overlay window: {e}"))?;

        #[cfg(target_os = "windows")]
        Self::apply_native_styles(&window);

        Self::apply_bounds(app, &window, cfg.monitor_index);
        let _ = window.set_ignore_cursor_events(cfg.click_through);

        Ok(window)
    }

    pub fn show(app: &AppHandle, cfg: &OverlayConfig) -> Result<(), String> {
        let win = Self::get_or_create_window(app, cfg)?;

        // Re-align in case the display setup changed since last time.
        Self::apply_bounds(app, &win, cfg.monitor_index);
        let _ = win.set_ignore_cursor_events(cfg.click_through);

        #[cfg(target_os = "windows")]
        Self::apply_native_styles(&win);

        win.show().map_err(|e| e.to_string())?;
        let _ = win.set_always_on_top(true);
        Self::reassert_topmost(app);

        Ok(())
    }

    /// Re-applies bounds / click-through after a settings change without
    /// touching visibility. No-op while the window has never been created.
    pub fn apply_config(app: &AppHandle, cfg: &OverlayConfig) {
        if let Some(win) = app.get_webview_window("overlay") {
            Self::apply_bounds(app, &win, cfg.monitor_index);
            let _ = win.set_ignore_cursor_events(cfg.click_through);
        }
    }

    pub fn reassert_topmost(app: &AppHandle) {
        #[cfg(target_os = "windows")]
        {
            if let Some(win) = app.get_webview_window("overlay") {
                if let Ok(true) = win.is_visible() {
                    if let Ok(hwnd) = win.hwnd() {
                        unsafe {
                            use windows_sys::Win32::UI::WindowsAndMessaging::{
                                SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
                                SWP_SHOWWINDOW,
                            };
                            SetWindowPos(
                                hwnd.0 as _,
                                HWND_TOPMOST,
                                0,
                                0,
                                0,
                                0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
                            );
                        }
                    }
                }
            }
        }
        #[cfg(not(target_os = "windows"))]
        let _ = app;
    }

    pub fn hide(app: &AppHandle) -> Result<(), String> {
        if let Some(win) = app.get_webview_window("overlay") {
            win.hide().map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn set_click_through(app: &AppHandle, click_through: bool) -> Result<(), String> {
        if let Some(win) = app.get_webview_window("overlay") {
            win.set_ignore_cursor_events(click_through)
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn get_monitors(app: &AppHandle) -> Vec<MonitorDto> {
        let mut list = Vec::new();
        if let Ok(monitors) = app.available_monitors() {
            let primary = app.primary_monitor().ok().flatten();
            let primary_pos = primary.map(|p| *p.position());

            for (i, m) in monitors.into_iter().enumerate() {
                let name = m
                    .name()
                    .cloned()
                    .unwrap_or_else(|| format!("Monitor {}", i + 1));
                let size = m.size();
                let scale = m.scale_factor();
                let is_primary = primary_pos
                    .map(|pos| pos == *m.position())
                    .unwrap_or(i == 0);

                list.push(MonitorDto {
                    index: i,
                    name,
                    width: size.width,
                    height: size.height,
                    scale_factor: scale,
                    is_primary,
                });
            }
        }
        if list.is_empty() {
            list.push(MonitorDto {
                index: 0,
                name: "Primary Display".to_string(),
                width: 1920,
                height: 1080,
                scale_factor: 1.0,
                is_primary: true,
            });
        }
        list
    }
}
