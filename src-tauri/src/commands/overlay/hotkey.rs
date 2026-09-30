#![allow(clippy::manual_c_str_literals)]

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

pub const MOD_ALT: u32 = 0x0001;
pub const MOD_CONTROL: u32 = 0x0002;
pub const MOD_SHIFT: u32 = 0x0004;
pub const MOD_WIN: u32 = 0x0008;

/// Parses strings like `Ctrl+Shift+O`, `Alt+F10`, `Shift+F11` into
/// `(modifiers, virtual_key)`. Platform independent so it can be validated
/// (and unit-tested) everywhere.
pub fn parse_hotkey(spec: &str) -> Result<(u32, u32), String> {
    let mut mods = 0u32;
    let mut vk: Option<u32> = None;

    for raw in spec.split('+') {
        let token = raw.trim();
        if token.is_empty() {
            return Err("Empty key in hotkey".into());
        }
        let lower = token.to_ascii_lowercase();
        match lower.as_str() {
            "ctrl" | "control" => mods |= MOD_CONTROL,
            "shift" => mods |= MOD_SHIFT,
            "alt" => mods |= MOD_ALT,
            "win" | "super" | "meta" | "cmd" => mods |= MOD_WIN,
            _ => {
                if vk.is_some() {
                    return Err("Only one non-modifier key is allowed".into());
                }
                vk = Some(key_to_vk(&lower).ok_or_else(|| format!("Unsupported key: {token}"))?);
            }
        }
    }

    let vk = vk.ok_or_else(|| "Hotkey needs a main key".to_string())?;
    let is_function_key = (0x70..=0x87).contains(&vk);
    if mods == 0 && !is_function_key {
        return Err("Hotkey needs at least one modifier (Ctrl, Shift, Alt) or an F-key".into());
    }
    Ok((mods, vk))
}

fn key_to_vk(lower: &str) -> Option<u32> {
    let bytes = lower.as_bytes();
    if bytes.len() == 1 {
        let c = bytes[0];
        if c.is_ascii_lowercase() {
            return Some(c.to_ascii_uppercase() as u32);
        }
        if c.is_ascii_digit() {
            return Some(c as u32);
        }
    }
    if let Some(num) = lower.strip_prefix('f') {
        if let Ok(n) = num.parse::<u32>() {
            if (1..=24).contains(&n) {
                return Some(0x6F + n);
            }
        }
    }
    match lower {
        "space" => Some(0x20),
        "tab" => Some(0x09),
        "insert" | "ins" => Some(0x2D),
        "delete" | "del" => Some(0x2E),
        "home" => Some(0x24),
        "end" => Some(0x23),
        "pageup" | "pgup" => Some(0x21),
        "pagedown" | "pgdn" => Some(0x22),
        "left" => Some(0x25),
        "up" => Some(0x26),
        "right" => Some(0x27),
        "down" => Some(0x28),
        _ => None,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyStatus {
    pub hotkey: String,
    pub registered: bool,
    pub error: Option<String>,
}

pub struct GlobalHotkeyManager {
    is_active: Arc<AtomicBool>,
    pending: Arc<Mutex<Option<String>>>,
    status: Arc<Mutex<HotkeyStatus>>,
}

impl GlobalHotkeyManager {
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
            pending: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(HotkeyStatus {
                hotkey: String::new(),
                registered: false,
                error: None,
            })),
        }
    }

    /// Requests a (re-)registration. The hotkey thread owns the Win32
    /// registration (RegisterHotKey is per-thread), so it picks this up on
    /// its next loop iteration.
    pub fn set_hotkey(&self, hotkey: &str) {
        if let Ok(mut slot) = self.pending.lock() {
            *slot = Some(hotkey.to_string());
        }
    }

    pub fn status(&self) -> HotkeyStatus {
        self.status
            .lock()
            .map(|s| s.clone())
            .unwrap_or(HotkeyStatus {
                hotkey: String::new(),
                registered: false,
                error: Some("Hotkey status unavailable".into()),
            })
    }

    #[cfg(target_os = "windows")]
    pub fn start(&self, app: AppHandle, initial_hotkey: String) {
        if self.is_active.swap(true, Ordering::SeqCst) {
            return;
        }

        self.set_hotkey(&initial_hotkey);

        let is_running = self.is_active.clone();
        let pending = self.pending.clone();
        let status = self.status.clone();

        std::thread::spawn(move || {
            use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryA};
            use windows_sys::Win32::UI::WindowsAndMessaging::{
                DispatchMessageW, PeekMessageW, TranslateMessage, MSG, PM_REMOVE, WM_HOTKEY,
            };

            type FnRegisterHotKey = unsafe extern "system" fn(
                hwnd: *mut std::ffi::c_void,
                id: i32,
                fs_modifiers: u32,
                vk: u32,
            ) -> i32;

            type FnUnregisterHotKey =
                unsafe extern "system" fn(hwnd: *mut std::ffi::c_void, id: i32) -> i32;

            const HOTKEY_ID: i32 = 0x9001;
            const MOD_NOREPEAT: u32 = 0x4000;

            unsafe {
                let user32 = LoadLibraryA(b"user32.dll\0".as_ptr());
                if user32.is_null() {
                    return;
                }

                let reg_fn_ptr = GetProcAddress(user32, b"RegisterHotKey\0".as_ptr());
                let unreg_fn_ptr = GetProcAddress(user32, b"UnregisterHotKey\0".as_ptr());

                let register_hot_key: Option<FnRegisterHotKey> =
                    reg_fn_ptr.map(|p| std::mem::transmute(p));
                let unregister_hot_key: Option<FnUnregisterHotKey> =
                    unreg_fn_ptr.map(|p| std::mem::transmute(p));

                let (Some(reg), Some(unreg)) = (register_hot_key, unregister_hot_key) else {
                    return;
                };

                let mut msg: MSG = std::mem::zeroed();
                // Ensure a Windows message queue exists on this thread
                PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, 0);

                let mut currently_registered = false;

                while is_running.load(Ordering::SeqCst) {
                    // Apply a pending (re-)registration request.
                    let request = pending.lock().ok().and_then(|mut p| p.take());
                    if let Some(spec) = request {
                        if currently_registered {
                            unreg(std::ptr::null_mut(), HOTKEY_ID);
                        }

                        let (registered, error) = match parse_hotkey(&spec) {
                            Ok((mods, vk)) => {
                                if reg(std::ptr::null_mut(), HOTKEY_ID, mods | MOD_NOREPEAT, vk)
                                    != 0
                                {
                                    log::info!("[Overlay] Registered global hotkey {spec}");
                                    (true, None)
                                } else {
                                    log::warn!("[Overlay] Hotkey {spec} is already in use");
                                    (
                                        false,
                                        Some(format!(
                                            "{spec} is already used by another application"
                                        )),
                                    )
                                }
                            }
                            Err(e) => (false, Some(e)),
                        };
                        currently_registered = registered;
                        if let Ok(mut s) = status.lock() {
                            s.hotkey = spec;
                            s.registered = registered;
                            s.error = error;
                        }
                    }

                    if PeekMessageW(&mut msg, std::ptr::null_mut(), 0, 0, PM_REMOVE) != 0 {
                        if msg.message == WM_HOTKEY && msg.wParam as i32 == HOTKEY_ID {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                let cfg = crate::commands::overlay::config::current_config(
                                    &app_clone,
                                );
                                if !cfg.enabled {
                                    return;
                                }
                                let _ = crate::commands::overlay::commands::apply_visibility(
                                    &app_clone,
                                    None,
                                    crate::commands::overlay::commands::ToggleSource::Manual,
                                )
                                .await;
                            });
                        }
                        TranslateMessage(&msg);
                        DispatchMessageW(&msg);
                    } else {
                        std::thread::sleep(std::time::Duration::from_millis(30));
                    }
                }

                if currently_registered {
                    unreg(std::ptr::null_mut(), HOTKEY_ID);
                }
            }
        });
    }

    #[cfg(not(target_os = "windows"))]
    pub fn start(&self, _app: AppHandle, initial_hotkey: String) {
        let _ = &self.is_active;
        if let Ok(mut s) = self.status.lock() {
            s.hotkey = initial_hotkey;
        }
    }

    #[allow(dead_code)]
    pub fn stop(&self) {
        self.is_active.store(false, Ordering::SeqCst);
    }
}

impl Default for GlobalHotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_common_hotkeys() {
        assert_eq!(
            parse_hotkey("Ctrl+Shift+O").unwrap(),
            (MOD_CONTROL | MOD_SHIFT, 'O' as u32)
        );
        assert_eq!(parse_hotkey("F11").unwrap(), (0, 0x7A));
        assert_eq!(parse_hotkey("alt+f10").unwrap(), (MOD_ALT, 0x79));
    }

    #[test]
    fn rejects_invalid_hotkeys() {
        assert!(parse_hotkey("").is_err());
        assert!(parse_hotkey("O").is_err());
        assert!(parse_hotkey("Ctrl+").is_err());
        assert!(parse_hotkey("Ctrl+A+B").is_err());
        assert!(parse_hotkey("Ctrl+Banana").is_err());
    }
}
