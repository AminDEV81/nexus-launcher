use crate::commands::overlay::commands::{
    apply_visibility, is_hud_active, load_known_games, OverlayState, ToggleSource,
};
use crate::commands::overlay::config::current_config;
use crate::commands::overlay::game_detection::{GameResolver, ProcessScanner};
use crate::commands::overlay::window::OverlayWindowManager;
use crate::db::Database;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// How often the library list is re-read for game matching.
const KNOWN_GAMES_REFRESH: Duration = Duration::from_secs(10);

pub struct AutoGameWatcher {
    is_running: Arc<AtomicBool>,
}

impl AutoGameWatcher {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, app: AppHandle) {
        if self.is_running.swap(true, Ordering::SeqCst) {
            return;
        }

        let is_running = self.is_running.clone();

        tauri::async_runtime::spawn(async move {
            let mut auto_opened = false;
            let mut active_game_pid: Option<u32> = None;
            let mut known_games = Vec::new();
            let mut known_games_at: Option<Instant> = None;

            while is_running.load(Ordering::SeqCst) {
                tokio::time::sleep(Duration::from_millis(1000)).await;

                let cfg = current_config(&app);
                let state = app.state::<OverlayState>();

                // Overlay switched off in settings: close anything we opened.
                if !cfg.enabled {
                    if auto_opened && is_hud_active(&app) {
                        let _ = apply_visibility(&app, Some(false), ToggleSource::Auto).await;
                    }
                    auto_opened = false;
                    continue;
                }

                if known_games_at
                    .map(|t| t.elapsed() >= KNOWN_GAMES_REFRESH)
                    .unwrap_or(true)
                {
                    known_games = load_known_games(&app.state::<Database>());
                    known_games_at = Some(Instant::now());
                }

                // Only real games count — never an arbitrary foreground app.
                let fg_game = ProcessScanner::get_foreground_process()
                    .filter(|p| GameResolver::is_game_like(&known_games, p));

                if let Some(fg) = fg_game {
                    active_game_pid = Some(fg.pid);
                    state.foreground_game_pid.store(fg.pid, Ordering::SeqCst);

                    // A different game than the one the user dismissed the HUD for.
                    if state.suppressed_pid.load(Ordering::SeqCst) != fg.pid {
                        state.suppressed_pid.store(0, Ordering::SeqCst);
                    }
                    let suppressed = state.suppressed_pid.load(Ordering::SeqCst) == fg.pid;

                    if is_hud_active(&app) {
                        // Keep the overlay in front of the active game window.
                        OverlayWindowManager::reassert_topmost(&app);
                    } else if !suppressed {
                        log::info!(
                            "[Overlay AutoWatcher] Game detected ({}: {}), showing HUD",
                            fg.pid,
                            fg.exe_name
                        );
                        if apply_visibility(&app, Some(true), ToggleSource::Auto)
                            .await
                            .is_ok()
                        {
                            auto_opened = true;
                        }
                    }
                } else if let Some(pid) = active_game_pid {
                    if ProcessScanner::is_pid_alive(pid) {
                        // Alt-tabbed but the game is still running: keep the HUD on top.
                        if is_hud_active(&app) {
                            OverlayWindowManager::reassert_topmost(&app);
                        }
                    } else {
                        log::info!(
                            "[Overlay AutoWatcher] Game PID {} exited, closing HUD",
                            pid
                        );
                        active_game_pid = None;
                        state.foreground_game_pid.store(0, Ordering::SeqCst);
                        state.suppressed_pid.store(0, Ordering::SeqCst);
                        if auto_opened && is_hud_active(&app) {
                            let _ = apply_visibility(&app, Some(false), ToggleSource::Auto).await;
                        }
                        auto_opened = false;
                    }
                }
            }
        });
    }

    #[allow(dead_code)]
    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}

impl Default for AutoGameWatcher {
    fn default() -> Self {
        Self::new()
    }
}
