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

/// How often the tracker polls the running process and emits
/// `playtime-updated` — frequent enough that the details panel's live
/// "Playing: 05:23" counter feels responsive, infrequent enough not to
/// burn CPU on a `sysinfo` refresh for a background timer nobody is
/// staring at continuously.
const POLL_INTERVAL: Duration = Duration::from_secs(3);

/// How long we keep polling for a Steam game's process to *appear*
/// after handing off to `steam://rungameid/...` before giving up.
/// Generous (90s) so games with cloud sync, shader compilation, or
/// anti-cheat startup don't prematurely abort.
const STEAM_LAUNCH_TIMEOUT: Duration = Duration::from_secs(90);

/// Tracks which games currently have an active play session and, once
/// known, the PID of their process — purely in-memory. Lets the
/// frontend restore the "Playing…" state after a reload
/// (`get_running_games`), stops a game from being launched twice
/// concurrently, and gives `stop_game` something to actually kill.
///
/// The PID starts out `None` and is filled in once `track_session`
/// knows it: immediately for games we spawned ourselves, or once a
/// Steam hand-off's process is found by name. `stop_game` on a game
/// whose PID isn't known yet (rare, brief window right after a Steam
/// launch) has nothing to kill — see its own doc comment.
#[derive(Default)]
pub struct LaunchTracker {
    running: Mutex<HashMap<String, Option<u32>>>,
}

impl LaunchTracker {
    /// Returns `false` (without inserting) if the game was already
    /// marked running.
    fn try_start(&self, game_id: &str) -> bool {
        let mut running = self.running.lock().expect("launch tracker mutex poisoned");
        if running.contains_key(game_id) {
            return false;
        }
        running.insert(game_id.to_string(), None);
        true
    }

    fn set_pid(&self, game_id: &str, pid: u32) {
        if let Some(slot) = self
            .running
            .lock()
            .expect("launch tracker mutex poisoned")
            .get_mut(game_id)
        {
            *slot = Some(pid);
        }
    }

    fn pid_of(&self, game_id: &str) -> Option<u32> {
        self.running
            .lock()
            .expect("launch tracker mutex poisoned")
            .get(game_id)
            .copied()
            .flatten()
    }

    fn finish(&self, game_id: &str) {
        self.running
            .lock()
            .expect("launch tracker mutex poisoned")
            .remove(game_id);
    }
}

#[tauri::command]
pub fn get_running_games(tracker: State<'_, LaunchTracker>) -> Vec<String> {
    tracker
        .running
        .lock()
        .expect("launch tracker mutex poisoned")
        .keys()
        .cloned()
        .collect()
}

/// Force-closes a running game — the same thing Task Manager's "End
/// Task" does, and deliberately so: trying to ask an arbitrary game to
/// close gracefully has no reliable cross-game mechanism, while a plain
/// kill signal always works. This only ends the process; it doesn't
/// touch `playtime_sessions` or emit `game-exited` itself — the
/// existing poll loop in `track_session` notices the process is gone on
/// its next tick (within `POLL_INTERVAL`) and goes through the exact
/// same recording/emit path as if the game had closed on its own, so
/// there's only one place that ever finalizes a session.
#[tauri::command]
pub fn stop_game(
    db: State<'_, Database>,
    tracker: State<'_, LaunchTracker>,
    game_id: String,
) -> AppResult<()> {
    let pid = tracker.pid_of(&game_id).ok_or_else(|| {
        AppError::Invalid("This game isn't running yet — try again in a moment.".into())
    })?;

    // Re-check the process's identity before killing: Windows reuses
    // PIDs aggressively, and blindly task-killing whatever currently
    // owns the number could terminate an unrelated program that started
    // after the game crashed.
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

    // Kill any direct child processes if this was a script/wrapper launcher
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
    let conn = db.connection.lock().expect("db mutex poisoned");
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

/// Reads the `auto_boost_enabled` setting straight from the generic
/// `settings` KV table (see `commands/settings.rs`) rather than taking
/// it as a parameter — `launch_game` is also called from places that
/// don't have a reason to know about boosting otherwise, and this way
/// the setting has exactly one source of truth. Missing/unset
/// values default to on (true).
fn auto_boost_enabled(db: &Database) -> bool {
    let conn = db.connection.lock().expect("db mutex poisoned");
    conn.query_row(
        "SELECT value FROM settings WHERE key = 'auto_boost_enabled'",
        [],
        |row| row.get::<_, String>(0),
    )
    .map(|value| value != "false")
    .unwrap_or(true)
}

/// Runs an arbitrary shell command fire-and-forget — used for the
/// pre-launch/post-exit hooks (e.g. toggling a Discord status script,
/// pausing a sync tool). Failures are logged but never block or fail
/// the launch itself: a broken hook shouldn't prevent the game from
/// starting or its playtime from being recorded.
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

/// Either the PID of a process we spawned ourselves, or a signal that
/// we handed off to an external launcher (Steam) and have to find the
/// resulting process by watching for its executable name to appear.
enum LaunchedProcess {
    Pid(u32),
    WatchByName,
}

fn launch_via_steam(app: &AppHandle, steam_app_id: Option<&str>) -> AppResult<LaunchedProcess> {
    let steam_app_id = steam_app_id
        .ok_or_else(|| AppError::Invalid("This game is missing its Steam App ID.".into()))?;
    let url = format!("steam://rungameid/{steam_app_id}");
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|err| AppError::Other(format!("could not hand off to Steam: {err}")))?;
    Ok(LaunchedProcess::WatchByName)
}

/// Splits a launch-arguments string into one argument per list entry,
/// honoring double quotes: `-conf "C:\My Games\config.ini"` must stay a
/// single argument, which a plain `split_whitespace` would shred into
/// three. Deliberately simple shell-style rules (no backslash-escape
/// processing) — games take literal paths, not shell code, and the value
/// is passed to the process argv directly, never through a shell.
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
        let mut cmd = StdCommand::new("cmd.exe");
        cmd.arg("/C").arg(executable_path);
        cmd
    } else if cfg!(windows) && ext == "ps1" {
        let mut cmd = StdCommand::new("powershell.exe");
        cmd.args(["-ExecutionPolicy", "Bypass", "-File", executable_path]);
        cmd
    } else {
        StdCommand::new(executable_path)
    };

    if let Some(args) = target
        .launch_arguments
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        command.args(split_launch_arguments(args));
    }
    if let Some(dir) = target.install_path.as_deref() {
        command.current_dir(dir);
    } else if let Some(parent) = path_obj.parent() {
        command.current_dir(parent);
    }

    let child = command
        .spawn()
        .map_err(|err| AppError::Other(format!("could not start the game: {err}")))?;
    Ok(LaunchedProcess::Pid(child.id()))
}

/// Starts a game and, in the background, tracks how long it stays
/// running. Returns as soon as the process has been started (or handed
/// off to Steam) — the actual playtime tracking happens in a detached
/// task and is reported to the frontend via the `game-launched`,
/// `playtime-updated`, and `game-exited` events, not this command's
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

    let target = match fetch_launch_target(&db, &game_id) {
        Ok(target) => target,
        Err(err) => {
            tracker.finish(&game_id);
            let _ = app.emit(
                "launch-boost-failed",
                serde_json::json!({
                    "game_id": &game_id,
                    "error": err.to_string(),
                }),
            );
            return Err(err);
        }
    };

    // Emit start event immediately so frontend popup opens with zero delay
    let _ = app.emit("launch-boost-start", LaunchBoostStartPayload {
        game_id: game_id.clone(),
        game_name: target.name.clone(),
        cover_path: target.cover_path.clone(),
    });

    let active_profile_id = {
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'active_profile_id'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "default".to_string())
    };

    // Emit save prep progress step
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

    // Prepare save transaction before spawning game (lock is scoped strictly to save preparation + session registration)
    {
        let (_global_guard, _game_lock) = locks.acquire_game_transaction_locks(&game_id).await;
        let app_c = app.clone();
        let game_id_c = game_id.clone();
        let active_profile_id_c = active_profile_id.clone();

        let tx_id = tokio::task::spawn_blocking(move || {
            let db = app_c.state::<Database>();
            let conn = db.connection.lock().expect("db mutex poisoned");
            TransactionCoordinator::prepare_game_saves(&conn, &active_profile_id_c, &game_id_c)
        })
        .await
        .map_err(|e| {
            tracker.finish(&game_id);
            let _ = app.emit(
                "launch-boost-failed",
                serde_json::json!({
                    "game_id": &game_id,
                    "error": format!("Task execution failed: {}", e),
                }),
            );
            AppError::Other(format!("Task execution failed: {}", e))
        })?
        .map_err(|err| {
            tracker.finish(&game_id);
            let _ = app.emit(
                "launch-boost-failed",
                serde_json::json!({
                    "game_id": &game_id,
                    "error": format!("Failed to prepare game saves: {}", err),
                }),
            );
            AppError::Other(format!("Failed to prepare game saves: {}", err))
        })?;

        // Register session inside the lock to prevent a profile switch from
        // sneaking in between save preparation and session registration.
        let session_id = Uuid::new_v4().to_string();
        let session = ActiveGameSession {
            session_id,
            game_id: game_id.clone(),
            profile_id: active_profile_id.clone(),
            process_id: 0, // Updated later by track_session
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

    // Auto Boost: run the same steps the settings panel's Boost button
    // triggers, synchronously, before anything is actually launched —
    // closing background apps and switching power plans after the game
    // has already started defeats the point.
    if auto_boost_enabled(&db) {
        let app_emit = app.clone();
        let gid = game_id.clone();
        let report = booster::perform_boost_with_progress(
            &db,
            &app.state::<booster::BoosterState>(),
            |step, current, total| {
                let percent = 10 + ((current as f32 / total as f32) * 75.0) as u32;
                let _ = app_emit.emit(
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
            },
        );
        let _ = app.emit("game-boosted", &report);
        let _ = app.emit(
            "launch-boost-complete",
            LaunchBoostCompletePayload {
                game_id: game_id.clone(),
                report,
            },
        );
    }

    if let Some(hook) = target
        .pre_launch_command
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        run_hook(hook);
    }

    // Emit final step before spawning process
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

    // For the Steam hand-off, remember which same-named processes were
    // already running *before* we asked Steam to start the game — the
    // tracker must attach to the new process, not to a second copy or
    // an unrelated program that happens to share the exe name.
    let steam_baseline: HashSet<u32> = if target.source == "steam" {
        exe_name
            .as_deref()
            .map(|name| {
                let mut system = System::new_all();
                snapshot_pids_by_name(&mut system, name)
            })
            .unwrap_or_default()
    } else {
        HashSet::new()
    };

    let launched = if target.source == "steam" {
        launch_via_steam(&app, target.steam_app_id.as_deref())
    } else {
        launch_directly(&target)
    };

    let launched = match launched {
        Ok(launched) => launched,
        Err(err) => {
            session_mgr.remove_session(&game_id);
            tracker.finish(&game_id);
            let _ = app.emit(
                "launch-boost-failed",
                serde_json::json!({
                    "game_id": &game_id,
                    "error": err.to_string(),
                }),
            );
            return Err(err);
        }
    };


    tokio::spawn(track_session(
        app,
        game_id,
        active_profile_id,
        launched,
        exe_name,
        steam_baseline,
        target.post_launch_command,
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

/// Polls `sysinfo` or Windows Job Object every `POLL_INTERVAL` for either a known PID or name.
/// Keeps polling until it disappears, emitting `playtime-updated`
/// on every tick, then synchronizes save data back to session_profile_id,
/// records the finished session, and emits `game-exited`.
async fn track_session(
    app: AppHandle,
    game_id: String,
    session_profile_id: String,
    launched: LaunchedProcess,
    exe_name: Option<String>,
    steam_baseline: HashSet<u32>,
    post_launch_command: Option<String>,
) {
    let mut system = System::new_all();

    let pid = match launched {
        LaunchedProcess::Pid(pid) => Some(pid),
        LaunchedProcess::WatchByName => match exe_name.as_deref() {
            None => None,
            Some(name) => {
                wait_for_process_by_name(&mut system, name, STEAM_LAUNCH_TIMEOUT, &steam_baseline)
                    .await
            }
        },
    };

    let Some(pid) = pid else {
        finish_without_session(&app, &game_id);
        return;
    };

    app.state::<LaunchTracker>().set_pid(&game_id, pid);

    let mut job_tracker = ProcessJobTracker::new();
    if let Some(ref jt) = job_tracker {
        if !jt.assign_process(pid) {
            log::warn!("Failed to assign process {} to job tracker, falling back to process-name tracking", pid);
            job_tracker = None;
        }
    }

    let started_at = Utc::now();
    let _ = app.emit("game-launched", &game_id);
    handle_launch_window_action(&app);

    let sys_pid = Pid::from_u32(pid);
    let is_script = exe_name
        .as_deref()
        .map(|name| {
            let lower = name.to_ascii_lowercase();
            lower.ends_with(".bat") || lower.ends_with(".cmd") || lower.ends_with(".ps1")
        })
        .unwrap_or(false);

    loop {
        tokio::time::sleep(POLL_INTERVAL).await;
        system.refresh_processes(ProcessesToUpdate::All, true);

        let still_running = if let Some(ref jt) = job_tracker {
            jt.is_active()
        } else if is_script {
            if system.process(sys_pid).is_some() {
                true
            } else {
                system.processes().values().any(|p| p.parent() == Some(sys_pid))
            }
        } else {
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

        let elapsed = (Utc::now() - started_at).num_seconds().max(0);
        let _ = app.emit(
            "playtime-updated",
            PlaytimeUpdatedPayload {
                game_id: game_id.clone(),
                elapsed_seconds: elapsed,
            },
        );
    }

    // Post-Exit Save Synchronization bound to session_profile_id:
    {
        let locks = app.state::<SaveManagerLocks>();
        let (_global, _game) = locks.acquire_game_transaction_locks(&game_id).await;
        let app_c = app.clone();
        let game_id_c = game_id.clone();
        let session_profile_c = session_profile_id.clone();

        let sync_res = tokio::task::spawn_blocking(move || {
            let db = app_c.state::<Database>();
            let conn = db.connection.lock().expect("db mutex poisoned");
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

    let ended_at = Utc::now();
    let duration_seconds = (ended_at - started_at).num_seconds().max(0);
    record_session(&app, &game_id, &session_profile_id, started_at, ended_at, duration_seconds);

    if let Some(hook) = post_launch_command.filter(|value| !value.trim().is_empty()) {
        run_hook(&hook);
    }

    // No-op if this session was never boosted (nothing to restore).
    booster::restore_power_plan(&app.state::<booster::BoosterState>());

    restore_launcher_window(&app);
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
        let conn = db.connection.lock().expect("db mutex poisoned");
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
            "keep" => {
                // Keep window open as is
            }
            _ => {
                // "hide" is default: tuck cleanly into background / system tray
                let _ = window.hide();
            }
        }
    }
}

fn restore_launcher_window(app: &AppHandle) {
    let action = {
        let db = app.state::<Database>();
        let conn = db.connection.lock().expect("db mutex poisoned");
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'game_launch_window_action'",
            [],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "hide".to_string())
    };

    if let Some(window) = app.get_webview_window("main") {
        if action.as_str() != "keep" {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
}

async fn wait_for_process_by_name(
    system: &mut System,
    exe_name: &str,
    timeout: Duration,
    baseline: &HashSet<u32>,
) -> Option<u32> {
    let deadline = tokio::time::Instant::now() + timeout;
    while tokio::time::Instant::now() < deadline {
        system.refresh_processes(ProcessesToUpdate::All, true);
        let found = system.processes().values().find(|process| {
            process
                .name()
                .to_string_lossy()
                .eq_ignore_ascii_case(exe_name)
                && !baseline.contains(&process.pid().as_u32())
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
            "error": "Game process did not start. If offline, please verify Steam is running in Offline Mode or that the game supports offline play.",
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

fn record_session(
    app: &AppHandle,
    game_id: &str,
    profile_id: &str,
    started_at: DateTime<Utc>,
    ended_at: DateTime<Utc>,
    duration_seconds: i64,
) {
    let db = app.state::<Database>();
    let conn = db.connection.lock().expect("db mutex poisoned");
    let session_id = Uuid::new_v4().to_string();

    // One transaction: a crash between the INSERT and the UPDATE would
    // otherwise leave `total_playtime_seconds` out of sync with the
    // session rows the stats page aggregates from.
    let result = (|| -> rusqlite::Result<()> {
        let tx = conn.unchecked_transaction()?;
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
        tx.execute(
            "UPDATE games SET total_playtime_seconds = total_playtime_seconds + ?1, last_played_at = ?2 WHERE id = ?3",
            params![duration_seconds, ended_at.to_rfc3339(), game_id],
        )?;
        tx.commit()
    })();

    if let Err(err) = result {
        log::error!("failed to record playtime session for {game_id} (profile: {profile_id}): {err}");
    }
}

#[cfg(test)]
mod tests {
    use super::split_launch_arguments;

    /// The splitter's whole job is keeping quoted paths whole — a plain
    /// whitespace split would shred `-conf "C:\My Games\cfg.ini"` into
    /// three argv entries and games would reject the launch.
    #[test]
    fn launch_arguments_honor_double_quotes() {
        assert_eq!(
            split_launch_arguments(r#"-conf "C:\My Games\config.ini" -fullscreen"#),
            vec!["-conf", r"C:\My Games\config.ini", "-fullscreen"]
        );
        // Quotes around a whole flag collapse to the bare flag.
        assert_eq!(split_launch_arguments(r#""-windowed""#), vec!["-windowed"]);
    }

    #[test]
    fn launch_arguments_empty_and_edges() {
        assert_eq!(split_launch_arguments(""), Vec::<String>::new());
        assert_eq!(split_launch_arguments("    "), Vec::<String>::new());
        assert_eq!(split_launch_arguments("  -dx11  "), vec!["-dx11"]);
    }
}
