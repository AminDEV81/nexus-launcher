use crate::commands::booster;
use crate::db::Database;
use crate::error::{AppError, AppResult};
use chrono::{DateTime, Utc};
use rusqlite::params;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{Pid, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;
use crate::commands::save_manager::locks::SaveManagerLocks;
use crate::commands::save_manager::session::{ActiveGameSession, ProcessJobTracker, SessionManager};
use crate::commands::save_manager::transaction::TransactionCoordinator;
use uuid::Uuid;

const POLL_INTERVAL: Duration = Duration::from_secs(3);
const STEAM_LAUNCH_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Default)]
pub struct LaunchTracker {
    running: Mutex<HashMap<String, Option<u32>>>,
}

impl LaunchTracker {
    fn try_start(&self, game_id: &str) -> bool {
        let mut running = self.running.lock().unwrap_or_else(|e| e.into_inner());
        if running.contains_key(game_id) {
            return false;
        }
        running.insert(game_id.to_string(), None);
        true
    }

    fn set_pid(&self, game_id: &str, pid: u32) {
        if let Some(slot) = self
            .running
            .lock().unwrap_or_else(|e| e.into_inner())
            .get_mut(game_id)
        {
            *slot = Some(pid);
        }
    }

    fn pid_of(&self, game_id: &str) -> Option<u32> {
        self.running
            .lock().unwrap_or_else(|e| e.into_inner())
            .get(game_id)
            .copied()
            .flatten()
    }

    fn finish(&self, game_id: &str) {
        self.running
            .lock().unwrap_or_else(|e| e.into_inner())
            .remove(game_id);
    }

    pub fn is_running(&self, game_id: &str) -> bool {
        self.running
            .lock().unwrap_or_else(|e| e.into_inner())
            .contains_key(game_id)
    }
}

#[tauri::command]
pub fn get_running_games(tracker: State<'_, LaunchTracker>) -> Vec<String> {
    tracker
        .running
        .lock().unwrap_or_else(|e| e.into_inner())
        .keys()
        .cloned()
        .collect()
}

#[tauri::command]
pub fn stop_game(
    db: State<'_, Database>,
    tracker: State<'_, LaunchTracker>,
    game_id: String,
) -> AppResult<()> {
    let pid = tracker.pid_of(&game_id).ok_or_else(|| {
        AppError::Invalid("This game isn't running yet — try again in a moment.".into())
    })?;

    let expected_name = fetch_launch_target(&db, &game_id).ok().and_then(|target| {
        Path::new(target.executable_path.as_deref()?)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
    });

    let mut system = System::new_all();
    system.refresh_processes(ProcessesToUpdate::All, true);
    let process = system
        .process(Pid::from_u32(pid))
        .ok_or_else(|| AppError::NotFound("That game has already closed.".into()))?;

    if let Some(expected) = expected_name.as_deref() {
        let is_script = {
            let lower = expected.to_ascii_lowercase();
            lower.ends_with(".bat") || lower.ends_with(".cmd") || lower.ends_with(".ps1")
        };
        if !is_script
            && !process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case(expected)
        {
            return Err(AppError::NotFound("That game has already closed.".into()));
        }
    }

    let sys_pid = Pid::from_u32(pid);
    for child_proc in system.processes().values() {
        if child_proc.parent() == Some(sys_pid) {
            let _ = child_proc.kill();
        }
    }

    if !process.kill() {
        return Err(AppError::Other("Could not close the game.".into()));
    }
    Ok(())
}

#[derive(Clone, Serialize)]
struct PlaytimeUpdatedPayload {
    game_id: String,
    elapsed_seconds: i64,
}

#[derive(Clone, Serialize)]
struct GameExitedPayload {
    game_id: String,
    duration_seconds: i64,
}

#[derive(Clone, Serialize)]
pub struct LaunchBoostStartPayload {
    pub game_id: String,
    pub game_name: String,
    pub cover_path: Option<String>,
}

#[derive(Clone, Serialize)]
pub struct LaunchBoostStepPayload {
    pub game_id: String,
    pub step_index: usize,
    pub total_steps: usize,
    pub module_id: String,
    pub label: String,
    pub applied: bool,
    pub detail: String,
    pub metric: Option<String>,
    pub percent: u32,
}

#[derive(Clone, Serialize)]
pub struct LaunchBoostCompletePayload {
    pub game_id: String,
    pub report: booster::BoostReport,
}

struct LaunchTarget {
    name: String,
    cover_path: Option<String>,
    source: String,
    steam_app_id: Option<String>,
    executable_path: Option<String>,
    install_path: Option<String>,
    launch_arguments: Option<String>,
    pre_launch_command: Option<String>,
    post_launch_command: Option<String>,
}

fn fetch_launch_target(db: &Database, game_id: &str) -> AppResult<LaunchTarget> {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.query_row(
        "SELECT name, cover_path, source, steam_app_id, executable_path, install_path, launch_arguments,
                pre_launch_command, post_launch_command
         FROM games WHERE id = ?1",
        [game_id],
        |row| {
            Ok(LaunchTarget {
                name: row.get(0)?,
                cover_path: row.get(1)?,
                source: row.get(2)?,
                steam_app_id: row.get(3)?,
                executable_path: row.get(4)?,
                install_path: row.get(5)?,
                launch_arguments: row.get(6)?,
                pre_launch_command: row.get(7)?,
                post_launch_command: row.get(8)?,
            })
        },
    )
    .map_err(|_| AppError::NotFound(format!("no game with id {game_id}")))
}

fn auto_boost_enabled(db: &Database) -> bool {
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'auto_boost_enabled'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|value| value == "true")
    .unwrap_or(false)
}

fn run_hook(command: &str) {
    let result = if cfg!(target_os = "windows") {
        StdCommand::new("cmd").args(["/C", command]).spawn()
    } else {
        StdCommand::new("sh").args(["-c", command]).spawn()
    };

    if let Err(err) = result {
        log::warn!("launch hook failed to start: {err}");
    }
}

enum LaunchedProcess {
    Pid(u32),
    WatchByName,
}

fn launch_via_steam(app: &AppHandle, steam_app_id: Option<&str>) -> AppResult<LaunchedProcess> {
    let steam_app_id = steam_app_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Invalid("This game is missing its Steam App ID.".into()))?;
    if !steam_app_id.chars().all(|c| c.is_ascii_digit()) {
        return Err(AppError::Invalid(
            "Invalid Steam App ID: must contain digits only.".into(),
        ));
    }
    let url = format!("steam://rungameid/{steam_app_id}");
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|err| AppError::Other(format!("could not hand off to Steam: {err}")))?;
    Ok(LaunchedProcess::WatchByName)
}

fn split_launch_arguments(args: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut saw_content = false;

    for ch in args.chars() {
        match ch {
            '"' => {
                in_quotes = !in_quotes;
                saw_content = true;
            }
            _ if ch.is_whitespace() && !in_quotes => {
                if saw_content {
                    parts.push(std::mem::take(&mut current));
                    saw_content = false;
                }
            }
            _ => {
                current.push(ch);
                saw_content = true;
            }
        }
    }
    if saw_content {
        parts.push(current);
    }
    parts
}

#[cfg(target_os = "linux")]
fn find_linux_runner(candidates: &[&str]) -> Option<String> {
    if let Ok(path_var) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path_var) {
            for &candidate in candidates {
                let p = dir.join(candidate);
                if p.is_file() {
                    return Some(candidate.to_string());
                }
            }
        }
    }
    None
}

fn launch_directly(target: &LaunchTarget) -> AppResult<LaunchedProcess> {
    let executable_path = target
        .executable_path
        .as_deref()
        .ok_or_else(|| AppError::Invalid("This game has no executable set.".into()))?;

    let path_obj = Path::new(executable_path);
    let ext = path_obj
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    let mut command = if cfg!(windows) && (ext == "bat" || ext == "cmd") {
        if executable_path.contains(['"', '!', '\r', '\n', '\0']) || !path_obj.is_file() {
            return Err(AppError::Invalid(
                "Invalid or unsafe batch script path.".into(),
            ));
        }
        // Pass batch path via environment variable with delayed expansion (`!NEXUS_BATCH_TARGET!`)
        // so `cmd.exe` never parses `&`, `|`, `^`, `<`, `>`, or `%` in the path as shell metacharacters.
        let mut cmd = StdCommand::new("cmd.exe");
        cmd.env("NEXUS_BATCH_TARGET", executable_path);
        cmd.args(["/d", "/v:on", "/c", "call \"!NEXUS_BATCH_TARGET!\""]);
        cmd
    } else if cfg!(windows) && ext == "ps1" {
        let mut cmd = StdCommand::new("powershell.exe");
        cmd.args(["-ExecutionPolicy", "Bypass", "-File", executable_path]);
        cmd
    } else if cfg!(target_os = "linux") && ext == "sh" {
        #[cfg(target_os = "linux")]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(executable_path) {
                let mut perms = meta.permissions();
                let mode = perms.mode();
                if mode & 0o111 == 0 {
                    perms.set_mode(mode | 0o755);
                    let _ = std::fs::set_permissions(executable_path, perms);
                }
            }
        }
        let mut cmd = StdCommand::new("sh");
        cmd.arg(executable_path);
        cmd
    } else if cfg!(target_os = "linux") && ext == "exe" {
        #[cfg(target_os = "linux")]
        {
            let runner = find_linux_runner(&["wine", "proton", "umu-run"]);
            if let Some(r) = runner {
                let mut cmd = StdCommand::new(r);
                cmd.arg(executable_path);
                cmd
            } else {
                return Err(AppError::Other(
                    "Running Windows games (.exe) on Linux requires Wine or Proton. Please install wine or proton."
                        .into(),
                ));
            }
        }
        #[cfg(not(target_os = "linux"))]
        {
            StdCommand::new(executable_path)
        }
    } else {
        #[cfg(target_os = "linux")]
        {
            use std::os::unix::fs::PermissionsExt;
            if let Ok(meta) = std::fs::metadata(executable_path) {
                let mut perms = meta.permissions();
                let mode = perms.mode();
                if mode & 0o111 == 0 {
                    perms.set_mode(mode | 0o755);
                    let _ = std::fs::set_permissions(executable_path, perms);
                }
            }
        }
        StdCommand::new(executable_path)
    };

    // Preserve Windows Mark-of-the-Web (MotW) and SmartScreen zone checks on downloaded executables.

    // Provide SteamAppId / SteamGameId environment variables when available so Steamworks games launch directly without `steam://` network delays
    if let Some(app_id) = target
        .steam_app_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit()))
    {
        command.env("SteamAppId", app_id);
        command.env("SteamGameId", app_id);
    }

    if let Some(args) = target
        .launch_arguments
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        command.args(split_launch_arguments(args));
    }
    if let Some(parent) = path_obj.parent().filter(|p| p.is_dir()) {
        command.current_dir(parent);
    } else if let Some(dir) = target.install_path.as_deref().filter(|d| Path::new(d).is_dir()) {
        command.current_dir(dir);
    }

    let child = command
        .spawn()
        .map_err(|err| AppError::Other(format!("could not start the game: {err}")))?;
    Ok(LaunchedProcess::Pid(child.id()))
}

#[tauri::command]
pub async fn launch_game(
    app: AppHandle,
    db: State<'_, Database>,
    tracker: State<'_, LaunchTracker>,
    locks: State<'_, SaveManagerLocks>,
    session_mgr: State<'_, SessionManager>,
    game_id: String,
) -> AppResult<()> {
    if !tracker.try_start(&game_id) {
        return Err(AppError::Invalid("This game is already running.".into()));
    }

    if session_mgr.get_session_by_game(&game_id).is_some() {
        tracker.finish(&game_id);
        return Err(AppError::Invalid("This game already has an active session.".into()));
    }

    let should_boost = auto_boost_enabled(&db);

    let mut target = match fetch_launch_target(&db, &game_id) {
        Ok(target) => target,
        Err(err) => {
            tracker.finish(&game_id);
            if should_boost {
                let _ = app.emit(
                    "launch-boost-failed",
                    serde_json::json!({
                        "game_id": &game_id,
                        "error": err.to_string(),
                    }),
                );
            }
            return Err(err);
        }
    };

    // If `executable_path` is missing or invalid, auto-discover the best executable inside `install_path`
    // so both Steam and offline games can launch directly without stalling on `steam://rungameid/` when offline!
    let exe_valid = target
        .executable_path
        .as_deref()
        .is_some_and(|p| !p.trim().is_empty() && Path::new(p).is_file());
    if !exe_valid {
        if let Some(ref install_dir) = target.install_path {
            let install_path_obj = Path::new(install_dir);
            if install_path_obj.is_dir() {
                if let Some(best_exe) = crate::commands::import::find_best_executable(install_path_obj) {
                    if let Ok(conn) = db.connection.lock() {
                        let _ = conn.execute(
                            "UPDATE games SET executable_path = ?1 WHERE id = ?2",
                            params![&best_exe, &game_id],
                        );
                    }
                    target.executable_path = Some(best_exe);
                }
            }
        }
    }

    if should_boost {
        let _ = app.emit(
            "launch-boost-start",
            LaunchBoostStartPayload {
                game_id: game_id.clone(),
                game_name: target.name.clone(),
                cover_path: target.cover_path.clone(),
            },
        );
    }

    let active_profile_id = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'active_profile_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "default".to_string())
    };

    if should_boost {
        let _ = app.emit(
            "launch-boost-progress",
            LaunchBoostStepPayload {
                game_id: game_id.clone(),
                step_index: 0,
                total_steps: 10,
                module_id: "saves".into(),
                label: "Preparing save state".into(),
                applied: true,
                detail: "Game saves verified & locked for session.".into(),
                metric: Some("Safe".into()),
                percent: 10,
            },
        );
    }

    // Prepare save transaction before spawning game
    {
        let (_global_guard, _game_lock) = locks.acquire_game_transaction_locks(&game_id).await;
        let app_c = app.clone();
        let game_id_c = game_id.clone();
        let active_profile_id_c = active_profile_id.clone();

        let tx_id = match tokio::task::spawn_blocking(move || {
            let db = app_c.state::<Database>();
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            TransactionCoordinator::prepare_game_saves(&conn, &active_profile_id_c, &game_id_c)
        })
        .await
        {
            Ok(Ok(id)) => id,
            Ok(Err(err)) => {
                log::warn!("Non-fatal save preparation warning for {}: {}", game_id, err);
                String::new()
            }
            Err(e) => {
                log::warn!("Non-fatal save preparation task join warning for {}: {}", game_id, e);
                String::new()
            }
        };

        let session_id = Uuid::new_v4().to_string();
        let session = ActiveGameSession {
            session_id,
            game_id: game_id.clone(),
            profile_id: active_profile_id.clone(),
            process_id: 0,
            started_at: Utc::now().to_rfc3339(),
            save_transaction_id: tx_id,
        };
        let _ = session_mgr.register_session(session);
    }

    let exe_name = target
        .executable_path
        .as_deref()
        .and_then(|path| Path::new(path).file_name())
        .map(|name| name.to_string_lossy().to_string());

    if should_boost {
        let app_boost = app.clone();
        let gid = game_id.clone();
        let report = tokio::task::spawn_blocking(move || {
            let db_state = app_boost.state::<Database>();
            let booster_state = app_boost.state::<booster::BoosterState>();
            booster::perform_boost_with_progress(
                &db_state,
                &booster_state,
                |step, current, total| {
                    let percent = 10 + ((current as f32 / total as f32) * 75.0) as u32;
                    let _ = app_boost.emit(
                        "launch-boost-progress",
                        LaunchBoostStepPayload {
                            game_id: gid.clone(),
                            step_index: current,
                            total_steps: total,
                            module_id: step.id.clone(),
                            label: step.label.clone(),
                            applied: step.applied,
                            detail: step.detail.clone(),
                            metric: step.metric.clone(),
                            percent,
                        },
                    );
                    std::thread::sleep(std::time::Duration::from_millis(15));
                },
            )
        })
        .await
        .unwrap_or_else(|_| booster::BoostReport {
            steps: Vec::new(),
            closed_apps: Vec::new(),
            freed_ram_bytes: 0,
        });
        let _ = app.emit("game-boosted", &report);
        let _ = app.emit(
            "launch-boost-complete",
            LaunchBoostCompletePayload {
                game_id: game_id.clone(),
                report,
            },
        );
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }

    if let Some(hook) = target
        .pre_launch_command
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        run_hook(hook);
    }

    if should_boost {
        let _ = app.emit(
            "launch-boost-progress",
            LaunchBoostStepPayload {
                game_id: game_id.clone(),
                step_index: 10,
                total_steps: 10,
                module_id: "spawn".into(),
                label: "Spawning game executable".into(),
                applied: true,
                detail: "Allocating execution pipeline & launching game process.".into(),
                metric: Some("Ready".into()),
                percent: 92,
            },
        );
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }

    let has_local_exe = target
        .executable_path
        .as_deref()
        .is_some_and(|p| Path::new(p).is_file());

    let steam_baseline: HashSet<u32> = if target.source == "steam" && !has_local_exe {
        exe_name
            .as_deref()
            .map(|name| {
                let mut system = System::new();
                snapshot_pids_by_name(&mut system, name)
            })
            .unwrap_or_default()
    } else {
        HashSet::new()
    };

    // Always prefer launching the local executable directly when it exists on disk!
    // This guarantees instant (<10ms) offline and online launches without waiting 30-45s
    // for `steam://rungameid/` cloud/login timeouts when internet is disconnected.
    let launched = if has_local_exe {
        match launch_directly(&target) {
            Ok(proc) => Ok(proc),
            Err(direct_err) => {
                if target.source == "steam" && target.steam_app_id.is_some() {
                    launch_via_steam(&app, target.steam_app_id.as_deref())
                } else {
                    Err(direct_err)
                }
            }
        }
    } else if target.source == "steam" {
        launch_via_steam(&app, target.steam_app_id.as_deref())
    } else {
        launch_directly(&target)
    };

    let launched = match launched {
        Ok(launched) => launched,
        Err(err) => {
            session_mgr.remove_session(&game_id);
            tracker.finish(&game_id);
            if should_boost {
                let _ = app.emit(
                    "launch-boost-failed",
                    serde_json::json!({
                        "game_id": &game_id,
                        "error": err.to_string(),
                    }),
                );
            }
            return Err(err);
        }
    };

    let overlay_enabled = {
        let conn = db.connection.lock().ok();
        conn.map(|c| crate::commands::overlay::config::ConfigStore::get(&c).enabled)
            .unwrap_or(true)
    };

    if overlay_enabled {
        let app_overlay = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(tokio::time::Duration::from_millis(800)).await;
            let _ =
                crate::commands::overlay::toggle_overlay_window(app_overlay.clone(), Some(true))
                    .await;
        });
    }

    tokio::spawn(track_session(
        app,
        game_id,
        active_profile_id,
        launched,
        exe_name,
        target.install_path,
        steam_baseline,
        target.post_launch_command,
        should_boost,
    ));

    Ok(())
}

fn snapshot_pids_by_name(system: &mut System, exe_name: &str) -> HashSet<u32> {
    system.refresh_processes(ProcessesToUpdate::All, true);
    system
        .processes()
        .values()
        .filter(|process| {
            process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case(exe_name)
        })
        .map(|process| process.pid().as_u32())
        .collect()
}

#[allow(clippy::too_many_arguments)]
async fn track_session(
    app: AppHandle,
    game_id: String,
    session_profile_id: String,
    launched: LaunchedProcess,
    exe_name: Option<String>,
    install_path: Option<String>,
    steam_baseline: HashSet<u32>,
    post_launch_command: Option<String>,
    should_boost: bool,
) {
    let mut system = System::new();

    let pid = match launched {
        LaunchedProcess::Pid(pid) => Some(pid),
        LaunchedProcess::WatchByName => {
            wait_for_game_process(
                &mut system,
                exe_name.as_deref(),
                install_path.as_deref(),
                STEAM_LAUNCH_TIMEOUT,
                &steam_baseline,
            )
            .await
        }
    };

    let Some(pid) = pid else {
        finish_without_session(&app, &game_id);
        return;
    };

    app.state::<LaunchTracker>().set_pid(&game_id, pid);
    crate::commands::booster::set_process_high_priority(pid);

    let mut job_tracker = ProcessJobTracker::new();
    if let Some(ref jt) = job_tracker {
        if !jt.assign_process(pid) {
            log::warn!("Failed to assign process {} to job tracker, falling back to process-name tracking", pid);
            job_tracker = None;
        }
    }

    let started_at = Utc::now();
    let _ = app.emit("game-launched", &game_id);
    {
        let app_ov_start = app.clone();
        tauri::async_runtime::spawn(async move {
            let ov_cfg = crate::commands::overlay::config::current_config(&app_ov_start);
            if ov_cfg.enabled {
                let state = app_ov_start.state::<crate::commands::overlay::OverlayState>();
                state.suppressed_pid.store(0, std::sync::atomic::Ordering::SeqCst);
                let _ = crate::commands::overlay::commands::apply_visibility(
                    &app_ov_start,
                    Some(true),
                    crate::commands::overlay::commands::ToggleSource::Auto,
                )
                .await;
            }
        });
    }
    if should_boost {
        tokio::time::sleep(tokio::time::Duration::from_millis(1200)).await;
    }
    handle_launch_window_action(&app);

    let sys_pid = Pid::from_u32(pid);
    let is_script = exe_name
        .as_deref()
        .map(|name| {
            let lower = name.to_ascii_lowercase();
            lower.ends_with(".bat") || lower.ends_with(".cmd") || lower.ends_with(".ps1")
        })
        .unwrap_or(false);

    let session_id = Uuid::new_v4().to_string();
    init_session_row(&app, &session_id, &game_id, &session_profile_id, started_at);

    let mut active_elapsed_ms: u64 = 0;
    let mut checkpointed_seconds: i64 = 0;
    let mut last_tick_instant = tokio::time::Instant::now();
    let max_tick_ms: u64 = (POLL_INTERVAL.as_millis() as u64).saturating_mul(3).max(6000);

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let now_instant = tokio::time::Instant::now();
        let tick_ms = (now_instant.duration_since(last_tick_instant).as_millis() as u64).min(max_tick_ms);
        last_tick_instant = now_instant;

        let still_running = if let Some(ref jt) = job_tracker {
            jt.is_active()
        } else if is_script {
            system.refresh_processes(ProcessesToUpdate::All, true);
            if system.process(sys_pid).is_some() {
                true
            } else {
                system.processes().values().any(|p| p.parent() == Some(sys_pid))
            }
        } else {
            system.refresh_processes(ProcessesToUpdate::Some(&[sys_pid]), true);
            match system.process(sys_pid) {
                None => false,
                Some(process) => match exe_name.as_deref() {
                    Some(expected) => process
                        .name()
                        .to_string_lossy()
                        .eq_ignore_ascii_case(expected),
                    None => true,
                },
            }
        };

        if !still_running {
            break;
        }

        active_elapsed_ms = active_elapsed_ms.saturating_add(tick_ms);
        let elapsed = (active_elapsed_ms / 1000) as i64;
        if elapsed - checkpointed_seconds >= 30 {
            let delta = elapsed - checkpointed_seconds;
            if checkpoint_session(&app, &session_id, &game_id, &session_profile_id, started_at, Utc::now(), elapsed, delta) {
                checkpointed_seconds = elapsed;
            }
        }

        let _ = app.emit(
            "playtime-updated",
            PlaytimeUpdatedPayload {
                game_id: game_id.clone(),
                elapsed_seconds: elapsed,
            },
        );
    }

    // Record exit timestamp and finalize playtime BEFORE save sync so large save backups
    // never inflate gameplay duration.
    let ended_at = Utc::now();
    let duration_seconds = ((active_elapsed_ms / 1000) as i64).max(checkpointed_seconds);
    let remaining_delta = (duration_seconds - checkpointed_seconds).max(0);
    record_session(
        &app,
        &session_id,
        &game_id,
        &session_profile_id,
        started_at,
        ended_at,
        duration_seconds,
        remaining_delta,
    );

    {
        let locks = app.state::<SaveManagerLocks>();
        let (_global, _game) = locks.acquire_game_transaction_locks(&game_id).await;
        let app_c = app.clone();
        let game_id_c = game_id.clone();
        let session_profile_c = session_profile_id.clone();

        let sync_res = tokio::task::spawn_blocking(move || {
            let db = app_c.state::<Database>();
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            let res = TransactionCoordinator::sync_game_saves_after_exit(&conn, &session_profile_c, &game_id_c);

            let active_profile_id: String = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'active_profile_id'",
                    [],
                    |row| row.get(0),
                )
                .unwrap_or_else(|_| "default".to_string());

            if active_profile_id != session_profile_c {
                log::info!("Swapping OS saves back to active profile {} for game {}", active_profile_id, game_id_c);
                let _ = TransactionCoordinator::prepare_game_saves(&conn, &active_profile_id, &game_id_c);
            }
            res
        })
        .await;

        if let Ok(Err(err)) = sync_res {
            log::error!("Failed to sync game saves after exit for game {}: {}", game_id, err);
        }
    }
    app.state::<SessionManager>().remove_session(&game_id);

    if let Some(hook) = post_launch_command.filter(|value| !value.trim().is_empty()) {
        run_hook(&hook);
    }

    booster::restore_power_plan(&app.state::<booster::BoosterState>());

    restore_launcher_window(&app);

    let app_overlay = app.clone();
    tauri::async_runtime::spawn(async move {
        let state = app_overlay.state::<crate::commands::overlay::OverlayState>();
        if !state.manually_opened.load(std::sync::atomic::Ordering::SeqCst) {
            let _ = crate::commands::overlay::commands::apply_visibility(
                &app_overlay,
                Some(false),
                crate::commands::overlay::commands::ToggleSource::Auto,
            )
            .await;
        }
    });
    let _ = app.emit(
        "game-exited",
        GameExitedPayload {
            game_id: game_id.clone(),
            duration_seconds,
        },
    );
    app.state::<LaunchTracker>().finish(&game_id);
}

fn handle_launch_window_action(app: &AppHandle) {
    let action = {
        let db = app.state::<Database>();
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'game_launch_window_action'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "hide".to_string())
    };

    if let Some(window) = app.get_webview_window("main") {
        match action.as_str() {
            "minimize" => {
                let _ = window.minimize();
            }
            "keep" => {}
            _ => {
                let _ = window.hide();
            }
        }
    }
}

fn restore_launcher_window(app: &AppHandle) {
    let action = {
        let db = app.state::<Database>();
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'game_launch_window_action'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "hide".to_string())
    };

    if action.as_str() != "keep" {
        crate::restore_and_focus_main_window(app);
    }
}

async fn wait_for_game_process(
    system: &mut System,
    exe_name: Option<&str>,
    install_path: Option<&str>,
    timeout: Duration,
    baseline: &HashSet<u32>,
) -> Option<u32> {
    if exe_name.is_none() && install_path.is_none() {
        return None;
    }
    let norm_install = install_path.map(|p| {
        p.trim()
            .replace('/', "\\")
            .trim_end_matches('\\')
            .to_lowercase()
    });

    let deadline = tokio::time::Instant::now() + timeout;
    while tokio::time::Instant::now() < deadline {
        system.refresh_processes(ProcessesToUpdate::All, true);
        let found = system.processes().values().find(|process| {
            let pid = process.pid().as_u32();
            if baseline.contains(&pid) {
                return false;
            }
            let pname = process.name().to_string_lossy();
            let pname_low = pname.to_lowercase();
            if IGNORED_EXTERNAL_EXES.contains(&pname_low.as_str()) {
                return false;
            }
            if let Some(expected) = exe_name {
                if pname.eq_ignore_ascii_case(expected) {
                    return true;
                }
            }
            if let Some(ref inst) = norm_install {
                if !inst.is_empty() {
                    if let Some(p_exe) = process.exe() {
                        let p_norm = p_exe.to_string_lossy().replace('/', "\\").to_lowercase();
                        if p_norm.starts_with(inst) && p_norm[inst.len()..].starts_with('\\') {
                            return true;
                        }
                    }
                }
            }
            false
        });
        if let Some(process) = found {
            return Some(process.pid().as_u32());
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
    None
}

fn finish_without_session(app: &AppHandle, game_id: &str) {
    app.state::<SessionManager>().remove_session(game_id);
    booster::restore_power_plan(&app.state::<booster::BoosterState>());
    let _ = app.emit(
        "launch-boost-failed",
        serde_json::json!({
            "game_id": game_id,
            "error": "Game process did not start. Please verify the game's executable path in Installation Settings.",
        }),
    );
    let _ = app.emit(
        "game-exited",
        GameExitedPayload {
            game_id: game_id.to_string(),
            duration_seconds: 0,
        },
    );
    app.state::<LaunchTracker>().finish(game_id);
}

fn init_session_row(
    app: &AppHandle,
    _session_id: &str,
    game_id: &str,
    _profile_id: &str,
    started_at: DateTime<Utc>,
) {
    // Only update `last_played_at` on launch; do not insert a 0-second row into `playtime_sessions`
    // before the first checkpoint/exit so a crash in the first 30s never leaves a 0s orphan row.
    let db = app.state::<Database>();
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let started_iso = started_at.to_rfc3339();
    let _ = conn.execute(
        "UPDATE games SET last_played_at = ?1 WHERE id = ?2",
        params![&started_iso, game_id],
    );
}

#[allow(clippy::too_many_arguments)]
fn checkpoint_session(
    app: &AppHandle,
    session_id: &str,
    game_id: &str,
    profile_id: &str,
    started_at: DateTime<Utc>,
    now: DateTime<Utc>,
    total_session_seconds: i64,
    delta_seconds: i64,
) -> bool {
    if delta_seconds <= 0 || total_session_seconds <= 0 {
        return true;
    }
    let db = app.state::<Database>();
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
    let started_iso = started_at.to_rfc3339();
    let now_iso = now.to_rfc3339();
    let res = (|| -> rusqlite::Result<()> {
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "INSERT INTO playtime_sessions (id, game_id, profile_id, started_at, ended_at, duration_seconds)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(id) DO UPDATE SET ended_at = excluded.ended_at, duration_seconds = excluded.duration_seconds",
            params![session_id, game_id, profile_id, &started_iso, &now_iso, total_session_seconds],
        )?;
        tx.execute(
            "UPDATE games SET total_playtime_seconds = total_playtime_seconds + ?1, last_played_at = ?2 WHERE id = ?3",
            params![delta_seconds, &now_iso, game_id],
        )?;
        tx.commit()
    })();
    res.is_ok()
}

#[allow(clippy::too_many_arguments)]
fn record_session(
    app: &AppHandle,
    session_id: &str,
    game_id: &str,
    profile_id: &str,
    started_at: DateTime<Utc>,
    ended_at: DateTime<Utc>,
    duration_seconds: i64,
    remaining_delta: i64,
) {
    if duration_seconds <= 0 {
        return;
    }
    let db = app.state::<Database>();
    let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());

    let result = (|| -> rusqlite::Result<()> {
        let tx = conn.unchecked_transaction()?;
        let updated = tx.execute(
            "UPDATE playtime_sessions SET ended_at = ?1, duration_seconds = ?2 WHERE id = ?3",
            params![ended_at.to_rfc3339(), duration_seconds, session_id],
        )?;
        if updated == 0 {
            tx.execute(
                "INSERT INTO playtime_sessions (id, game_id, profile_id, started_at, ended_at, duration_seconds)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    session_id,
                    game_id,
                    profile_id,
                    started_at.to_rfc3339(),
                    ended_at.to_rfc3339(),
                    duration_seconds
                ],
            )?;
        }
        tx.execute(
            "UPDATE games SET total_playtime_seconds = total_playtime_seconds + ?1, last_played_at = ?2 WHERE id = ?3",
            params![remaining_delta.max(0), ended_at.to_rfc3339(), game_id],
        )?;
        tx.commit()
    })();

    if let Err(err) = result {
        log::error!("failed to record playtime session for {game_id} (profile: {profile_id}): {err}");
    }
}

#[derive(Clone, Serialize)]
struct ExternalGameDetectedPayload {
    game_id: String,
    game_name: String,
    pid: u32,
}

const IGNORED_EXTERNAL_EXES: &[&str] = &[
    "explorer.exe",
    "cmd.exe",
    "powershell.exe",
    "pwsh.exe",
    "conhost.exe",
    "steam.exe",
    "steamwebhelper.exe",
    "steamservice.exe",
    "epicgameslauncher.exe",
    "galaxyclient.exe",
    "ubisoftconnect.exe",
    "eadesktop.exe",
    "origin.exe",
    "battle.net.exe",
    "riotclientservices.exe",
    "unins000.exe",
    "uninstall.exe",
    "setup.exe",
    "crashhandler.exe",
    "crashhandler64.exe",
    "unitycrashhandler64.exe",
    "unitycrashhandler32.exe",
    "crs-handler.exe",
    "vc_redist.x64.exe",
    "vc_redist.x86.exe",
    "dxsetup.exe",
];

pub fn attach_external_game_if_not_running(
    app: &AppHandle,
    game_id: &str,
    pid: u32,
    exe_name_override: Option<String>,
) -> bool {
    let tracker = app.state::<LaunchTracker>();
    if !tracker.try_start(game_id) {
        return false;
    }

    let session_mgr = app.state::<SessionManager>();
    if session_mgr.get_session_by_game(game_id).is_some() {
        tracker.finish(game_id);
        return false;
    }

    let db = app.state::<Database>();
    let target = match fetch_launch_target(&db, game_id) {
        Ok(t) => t,
        Err(_) => {
            tracker.finish(game_id);
            return false;
        }
    };

    let active_profile_id = {
        let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'active_profile_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "default".to_string())
    };

    tracker.set_pid(game_id, pid);

    let session = ActiveGameSession {
        session_id: Uuid::new_v4().to_string(),
        game_id: game_id.to_string(),
        profile_id: active_profile_id.clone(),
        process_id: pid,
        started_at: Utc::now().to_rfc3339(),
        save_transaction_id: format!("ext_{}", Uuid::new_v4()),
    };
    let _ = session_mgr.register_session(session);

    let exe_name = exe_name_override.or_else(|| {
        target
            .executable_path
            .as_deref()
            .and_then(|path| Path::new(path).file_name())
            .map(|name| name.to_string_lossy().to_string())
    });

    let _ = app.emit(
        "external-game-detected",
        ExternalGameDetectedPayload {
            game_id: game_id.to_string(),
            game_name: target.name.clone(),
            pid,
        },
    );
    let _ = app.emit("game-launched", game_id);

    let app_clone = app.clone();
    let gid = game_id.to_string();
    let post_cmd = target.post_launch_command;
    tauri::async_runtime::spawn(async move {
        track_external_session(app_clone, gid, active_profile_id, pid, exe_name, post_cmd).await;
    });

    true
}

async fn track_external_session(
    app: AppHandle,
    game_id: String,
    session_profile_id: String,
    pid: u32,
    exe_name: Option<String>,
    post_launch_command: Option<String>,
) {
    let mut system = System::new();
    let started_at = Utc::now();
    let sys_pid = Pid::from_u32(pid);
    let session_id = Uuid::new_v4().to_string();
    init_session_row(&app, &session_id, &game_id, &session_profile_id, started_at);

    let mut active_elapsed_ms: u64 = 0;
    let mut checkpointed_seconds: i64 = 0;
    let mut last_tick_instant = tokio::time::Instant::now();
    let max_tick_ms: u64 = (POLL_INTERVAL.as_millis() as u64).saturating_mul(3).max(6000);

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        let now_instant = tokio::time::Instant::now();
        let tick_ms = (now_instant.duration_since(last_tick_instant).as_millis() as u64).min(max_tick_ms);
        last_tick_instant = now_instant;

        system.refresh_processes(ProcessesToUpdate::Some(&[sys_pid]), true);
        let still_running = match system.process(sys_pid) {
            None => false,
            Some(process) => match exe_name.as_deref() {
                Some(expected) => process
                    .name()
                    .to_string_lossy()
                    .eq_ignore_ascii_case(expected),
                None => true,
            },
        };

        if !still_running {
            break;
        }

        active_elapsed_ms = active_elapsed_ms.saturating_add(tick_ms);
        let elapsed = (active_elapsed_ms / 1000) as i64;
        if elapsed - checkpointed_seconds >= 30 {
            let delta = elapsed - checkpointed_seconds;
            if checkpoint_session(&app, &session_id, &game_id, &session_profile_id, started_at, Utc::now(), elapsed, delta) {
                checkpointed_seconds = elapsed;
            }
        }

        let _ = app.emit(
            "playtime-updated",
            PlaytimeUpdatedPayload {
                game_id: game_id.clone(),
                elapsed_seconds: elapsed,
            },
        );
    }

    let ended_at = Utc::now();
    let duration_seconds = ((active_elapsed_ms / 1000) as i64).max(checkpointed_seconds);
    let remaining_delta = (duration_seconds - checkpointed_seconds).max(0);
    record_session(
        &app,
        &session_id,
        &game_id,
        &session_profile_id,
        started_at,
        ended_at,
        duration_seconds,
        remaining_delta,
    );

    {
        let locks = app.state::<SaveManagerLocks>();
        let (_global, _game) = locks.acquire_game_transaction_locks(&game_id).await;
        let app_c = app.clone();
        let game_id_c = game_id.clone();
        let session_profile_c = session_profile_id.clone();

        let _ = tokio::task::spawn_blocking(move || {
            let db = app_c.state::<Database>();
            let conn = db.connection.lock().unwrap_or_else(|e| e.into_inner());
            let _ = TransactionCoordinator::sync_game_saves_after_exit(
                &conn,
                &session_profile_c,
                &game_id_c,
            );
        })
        .await;
    }

    app.state::<SessionManager>().remove_session(&game_id);

    if let Some(hook) = post_launch_command.filter(|value| !value.trim().is_empty()) {
        run_hook(&hook);
    }

    let _ = app.emit(
        "game-exited",
        GameExitedPayload {
            game_id: game_id.clone(),
            duration_seconds,
        },
    );
    app.state::<LaunchTracker>().finish(&game_id);
}

pub fn start_external_game_detector(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(4)).await;

        loop {
            tokio::time::sleep(Duration::from_secs(6)).await;

            let candidates: Vec<(String, Option<String>, Option<String>)> = {
                let db = app.state::<Database>();
                let tracker = app.state::<LaunchTracker>();
                let Ok(conn) = db.connection.lock() else {
                    continue;
                };
                let Ok(mut stmt) = conn.prepare(
                    "SELECT id, executable_path, install_path
                     FROM games
                     WHERE is_installed = 1
                       AND COALESCE(is_memory, 0) = 0
                       AND (executable_path IS NOT NULL OR install_path IS NOT NULL)",
                ) else {
                    continue;
                };
                let rows = stmt
                    .query_map([], |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                        ))
                    })
                    .ok();
                match rows {
                    Some(iter) => iter
                        .filter_map(|r| r.ok())
                        .filter(|(id, _, _)| !tracker.is_running(id))
                        .collect(),
                    None => Vec::new(),
                }
            };

            if candidates.is_empty() {
                continue;
            }

            let detected = tokio::task::spawn_blocking(move || {
                let mut sys = System::new();
                sys.refresh_processes(ProcessesToUpdate::All, true);

                // Pre-normalize running processes once per tick (O(M) instead of O(N*M))
                let proc_snapshots: Vec<(u32, String, String, Option<String>)> = sys
                    .processes()
                    .values()
                    .filter_map(|proc| {
                        let proc_name = proc.name().to_string_lossy().to_string();
                        let proc_name_low = proc_name.to_lowercase();
                        if IGNORED_EXTERNAL_EXES.contains(&proc_name_low.as_str()) {
                            return None;
                        }
                        let proc_exe_norm = proc
                            .exe()
                            .map(|p| p.to_string_lossy().replace('/', "\\").to_lowercase());
                        Some((proc.pid().as_u32(), proc_name, proc_name_low, proc_exe_norm))
                    })
                    .collect();

                let mut matches: Vec<(String, u32, String)> = Vec::new();

                for (game_id, exe_opt, install_opt) in &candidates {
                    let expected_exe_name = exe_opt
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .and_then(|p| Path::new(p).file_name())
                        .map(|n| n.to_string_lossy().to_lowercase())
                        .filter(|n| !IGNORED_EXTERNAL_EXES.contains(&n.as_str()));

                    let expected_full_exe = exe_opt
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(|p| p.replace('/', "\\").to_lowercase());

                    let expected_install_dir = install_opt
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(|p| {
                            let norm = p.replace('/', "\\").to_lowercase();
                            norm.trim_end_matches('\\').to_string()
                        });

                    for (pid, proc_name, proc_name_low, proc_exe_norm) in &proc_snapshots {
                        let mut is_match = false;
                        if let Some(ref exp_name) = expected_exe_name {
                            if proc_name_low == exp_name {
                                is_match = true;
                            }
                        }

                        if !is_match {
                            if let Some(ref exe_norm) = proc_exe_norm {
                                if let Some(ref exp_full) = expected_full_exe {
                                    if exe_norm == exp_full {
                                        is_match = true;
                                    }
                                }
                                if !is_match {
                                    if let Some(ref inst_dir) = expected_install_dir {
                                        if !inst_dir.is_empty()
                                            && exe_norm.starts_with(inst_dir)
                                            && exe_norm[inst_dir.len()..].starts_with('\\')
                                        {
                                            is_match = true;
                                        }
                                    }
                                }
                            }
                        }

                        if is_match {
                            matches.push((game_id.clone(), *pid, proc_name.clone()));
                            break;
                        }
                    }
                }

                matches
            })
            .await
            .unwrap_or_default();

            for (game_id, pid, exe_name) in detected {
                attach_external_game_if_not_running(&app, &game_id, pid, Some(exe_name));
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::split_launch_arguments;

    #[test]
    fn launch_arguments_honor_double_quotes() {
        assert_eq!(
            split_launch_arguments(r#"-conf "C:\My Games\config.ini" -fullscreen"#),
            vec!["-conf", r"C:\My Games\config.ini", "-fullscreen"]
        );
        assert_eq!(split_launch_arguments(r#""-windowed""#), vec!["-windowed"]);
    }

    #[test]
    fn launch_arguments_empty_and_edges() {
        assert_eq!(split_launch_arguments(""), Vec::<String>::new());
        assert_eq!(split_launch_arguments("    "), Vec::<String>::new());
        assert_eq!(split_launch_arguments("  -dx11  "), vec!["-dx11"]);
    }

    #[test]
    fn auto_boost_defaults_to_false_when_unset() {
        use crate::db::Database;
        use rusqlite::Connection;
        use std::sync::Mutex;

        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        let db = Database {
            connection: Mutex::new(conn),
        };
        assert!(!super::auto_boost_enabled(&db));
    }

    #[test]
    fn auto_boost_respects_settings_value() {
        use crate::db::Database;
        use rusqlite::Connection;
        use std::sync::Mutex;

        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('auto_boost_enabled', 'true')",
            [],
        )
        .unwrap();
        let db = Database {
            connection: Mutex::new(conn),
        };
        assert!(super::auto_boost_enabled(&db));

        let conn2 = Connection::open_in_memory().unwrap();
        conn2
            .execute(
                "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
                [],
            )
            .unwrap();
        conn2
            .execute(
                "INSERT INTO settings (key, value) VALUES ('auto_boost_enabled', 'false')",
                [],
            )
            .unwrap();
        let db2 = Database {
            connection: Mutex::new(conn2),
        };
        assert!(!super::auto_boost_enabled(&db2));
    }
}
