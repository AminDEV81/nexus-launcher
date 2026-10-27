mod commands;
mod db;
mod error;
mod paths;
pub mod services;

use db::Database;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

/// Reliably restores and focuses the main Nexus Launcher window on Windows/Linux/macOS
/// from system tray or a second desktop shortcut invocation (`single_instance`),
/// bypassing Windows ForegroundLockTimeout restrictions via Win32 thread attachment & Topmost bounce.
pub fn restore_and_focus_main_window(app: &tauri::AppHandle) {
    use tauri::Emitter;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_skip_taskbar(false);
        let _ = window.show();
        let _ = window.unminimize();

        #[cfg(target_os = "windows")]
        {
            if let Ok(hwnd) = window.hwnd() {
                unsafe {
                    use windows_sys::Win32::System::Threading::{
                        AttachThreadInput, GetCurrentThreadId,
                    };
                    use windows_sys::Win32::UI::WindowsAndMessaging::{
                        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, IsIconic,
                        SetForegroundWindow, SetWindowPos, ShowWindow, HWND_NOTOPMOST,
                        HWND_TOPMOST, SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SW_RESTORE, SW_SHOW,
                    };

                    let h = hwnd.0 as _;
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

                    SetWindowPos(
                        h,
                        HWND_TOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                    );
                    SetWindowPos(
                        h,
                        HWND_NOTOPMOST,
                        0,
                        0,
                        0,
                        0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
                    );
                    BringWindowToTop(h);
                    SetForegroundWindow(h);

                    if fg_tid != 0 && fg_tid != cur_tid {
                        AttachThreadInput(fg_tid, cur_tid, 0);
                    }
                }
            }
        }

        let _ = window.set_focus();
        let _ = app.emit("app://window-restored", ());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Fix WebKitGTK DMA-BUF rendering glitch on Wayland compositors (Hyprland, Sway, GNOME Wayland with Nvidia, etc.)
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }

        // Fix AppImage forced GDK_BACKEND=x11 on pure Wayland compositors (Hyprland, Sway):
        if std::env::var_os("WAYLAND_DISPLAY").is_some() {
            if let Ok(backend) = std::env::var("GDK_BACKEND") {
                if backend == "x11" {
                    std::env::set_var("GDK_BACKEND", "wayland,x11");
                }
            }
        }
    }

    tauri::Builder::default()
        // Second launch of the installed exe must not spawn a second
        // window: focus the existing one instead. Must be the FIRST
        // plugin so later plugins don't initialize twice.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            restore_and_focus_main_window(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Logging ships in release builds too (Epic 16): a shared
            // exe that misbehaves leaves a Warn-level trail in the log
            // dir to diagnose from. Debug builds stay chattier (Info)
            // and mirror into the webview console.
            use tauri_plugin_log::{Target, TargetKind};
            let level = if cfg!(debug_assertions) {
                log::LevelFilter::Info
            } else {
                log::LevelFilter::Warn
            };
            let builder = tauri_plugin_log::Builder::default().level(level);
            // Shadowing (not `mut` + reassign) so the release profile —
            // where this cfg block is compiled out — doesn't warn about
            // an unused mut.
            #[cfg(debug_assertions)]
            let builder = builder.target(Target::new(TargetKind::Webview));
            let logger = builder
                .target(Target::new(TargetKind::Stdout))
                .target(Target::new(TargetKind::LogDir {
                    file_name: Some("nexus".into()),
                }))
                .build();
            app.handle().plugin(logger)?;

            // Open/create the SQLite database and run migrations before
            // any window is shown, so commands can rely on `State<Database>`
            // being ready from the very first frontend render.
            let database = Database::init(app.handle())?;
            {
                let conn = database.connection.lock().unwrap_or_else(|e| e.into_inner());
                if let Err(err) = commands::save_manager::recovery::CrashRecoveryEngine::recover_interrupted_operations(&conn) {
                    log::error!("Failed to recover interrupted save operations: {}", err);
                }
                if let Ok(custom_st_dir) = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'soundtrack_download_dir'",
                    [],
                    |row| row.get::<_, String>(0),
                ) {
                    let trimmed = custom_st_dir.trim();
                    if !trimmed.is_empty() {
                        commands::soundtrack::allow_soundtrack_directory_in_scopes(
                            app.handle(),
                            std::path::Path::new(trimmed),
                        );
                    }
                }
            }
            commands::soundtrack::allow_soundtrack_directory_in_scopes(
                app.handle(),
                &commands::soundtrack::downloader::get_default_soundtrack_dir(),
            );
            app.manage(database);

            // Run save location auto-configuration in the background after startup
            // inside `spawn_blocking` with fine-grained per-game locking so neither
            // Tokio worker threads nor the SQLite mutex stall UI IPC calls.
            let bg_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                let _ = tokio::task::spawn_blocking(move || {
                    let db = bg_app.state::<Database>();
                    let configured =
                        commands::save_manager::auto_configure_all_installed_games_unlocked(&db);
                    if configured > 0 {
                        log::info!(
                            "Auto-configured save locations for {} games from save manifest database",
                            configured
                        );
                    }
                })
                .await;
            });

            app.manage(commands::save_manager::locks::SaveManagerLocks::default());
            app.manage(commands::save_manager::session::SessionManager::default());

            // Epic 6's metadata pipeline: a shared HTTP client (reused
            // across every IGDB/SteamGridDB request and artwork
            // download instead of reconnecting each time) and the IGDB
            // OAuth token cache.
            let http_client = commands::metadata::HttpClient::default();
            let token_cache = commands::metadata::IgdbTokenCache::default();
            let resolver = std::sync::Arc::new(services::metadata::MetadataProviderResolver::new(
                http_client.0.clone(),
                token_cache.clone(),
            ));
            app.manage(resolver);
            app.manage(http_client);
            app.manage(token_cache);
            app.manage(commands::launch::LaunchTracker::default());
            app.manage(commands::booster::BoosterState::default());
            app.manage(commands::download::DownloadState::default());
            app.manage(commands::soundtrack::SoundtrackDownloadState::default());
            app.manage(commands::overlay::OverlayState::new());
            app.manage(commands::dualsense::DualSenseEngineState::new());
            // The hotkey manager lives in managed state so saving the
            // overlay config can re-register a changed hotkey at runtime.
            app.manage(commands::overlay::GlobalHotkeyManager::new());
            let initial_hotkey =
                commands::overlay::config::current_config(app.handle()).hotkey;
            app.state::<commands::overlay::GlobalHotkeyManager>()
                .start(app.handle().clone(), initial_hotkey);
            let game_watcher = commands::overlay::AutoGameWatcher::new();
            game_watcher.start(app.handle().clone());
            commands::launch::start_external_game_detector(app.handle().clone());
            // Download tasks die with the process — orphaned mid-flight
            // rows become resumable paused entries (see download.rs).
            commands::download::recover_orphaned_downloads(app.handle());
            commands::soundtrack::downloader::cleanup_stale_staging_files(app.handle());

            // Ensure the main window is visible, unminimized, and brought to front
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }

            // Tray icon: while a game runs the main window is hidden to
            // free GPU composition — this is the way back in (plus it
            // gives launch/exit shortcuts). Left-click restores too.
            let open = MenuItem::with_id(app, "open", "Show Nexus", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Nexus", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().expect("app icon").clone())
                .tooltip("Nexus Launcher")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "open" => {
                        restore_and_focus_main_window(app);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    }
                    | tauri::tray::TrayIconEvent::DoubleClick {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } => {
                        restore_and_focus_main_window(tray.app_handle());
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::health_check,
            commands::system::shutdown_system,
            commands::system::cancel_shutdown,
            commands::system::hide_to_tray,
            commands::system::restore_main_window,
            commands::system::exit_application,
            commands::system::get_system_specs,
            commands::system::get_live_metrics,
            commands::games::list_games,
            commands::games::get_game,
            commands::games::create_game,
            commands::games::update_game_installation,
            commands::games::update_game_flags,
            commands::games::update_game_name,
            commands::games::delete_game,
            commands::games::restore_game_from_memory,
            commands::games::permanently_delete_game,
            commands::games::set_game_playtime,
            commands::games::promote_wishlist_game,
            commands::games::get_game_screenshots,
            commands::games::update_launch_arguments,
            commands::games::set_game_igdb_id,
            commands::games::update_pre_launch_command,
            commands::games::update_post_launch_command,
            commands::games::set_game_user_rating,
            commands::launch::launch_game,
            commands::launch::stop_game,
            commands::launch::get_running_games,
            commands::collections::list_collections,
            commands::collections::create_collection,
            commands::collections::delete_collection,
            commands::collections::add_game_to_collection,
            commands::collections::remove_game_from_collection,
            commands::collections::list_games_in_collection,
            commands::collections::list_collections_with_previews,
            commands::collections::list_collection_ids_for_game,
            commands::tags::list_tags,
            commands::tags::create_tag,
            commands::tags::update_tag,
            commands::tags::delete_tag,
            commands::tags::set_game_tags,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
            commands::stats::get_stats_summary,
            commands::stats::get_playtime_by_genre,
            commands::stats::get_playtime_timeline,
            commands::stats::get_daily_activity,
            commands::stats::get_recent_sessions,
            commands::hub::get_hub_new_releases,
            commands::hub::get_hub_coming_soon,
            commands::hub::get_hub_top_rated,
            commands::hub::get_hub_recommended,
            commands::hub::get_hub_discounted_games,
            commands::hub::resolve_hub_game_scores,
            commands::hub::resolve_nexusmods_url,
            commands::hub::refresh_hub_catalog,
            commands::hub::search_hub_games,
            commands::hub::list_hub_genres,
            commands::hub::list_hub_platforms,
            commands::hub::get_hub_feed,
            commands::hub::get_hub_game_details,
            commands::hub::get_hub_similar_games,
            commands::hub::add_game_from_hub,
            commands::hub::add_game_to_wishlist,
            commands::hub::resolve_hub_trailer_stream,
            commands::hub::open_google_auth_window,
            commands::hub::open_trailer_window,
            commands::hub::mount_embedded_trailer,
            commands::hub::mount_embedded_google_auth,
            commands::hub::update_embedded_trailer_bounds,
            commands::hub::unmount_embedded_trailer,
            paths::is_portable_mode,
            commands::import::resolve_shortcut,
            commands::import::scan_folder_for_executables,
            commands::import::compute_path_size,
            commands::scan::scan_all_stores,
            commands::scan::import_scanned_games,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::backup::get_backup_stats,
            commands::metadata::search_metadata_candidates,
            commands::metadata::apply_metadata,
            commands::metadata::sync_game_metadata,
            commands::metadata::sync_wishlist_metadata,
            commands::metadata::search_cover_options,
            commands::metadata::apply_cover,
            commands::metadata::apply_custom_cover,
            commands::metadata::search_banner_options,
            commands::metadata::search_logo_options,
            commands::metadata::apply_banner,
            commands::metadata::apply_logo,
            commands::metadata::apply_custom_banner,
            commands::metadata::crop_and_save_image,
            commands::metadata::reset_artwork,
            commands::metadata::get_orphaned_artwork_summary,
            commands::metadata::cleanup_orphaned_artworks,
            commands::metadata::repair_missing_covers,
            commands::booster::scan_boostable_apps,
            commands::booster::run_game_boost,
            commands::booster::boost_ram_only,
            commands::booster::restore_game_boost,
            commands::booster::kill_selected_apps,
            commands::system_tweaks::get_system_tweak_status,
            commands::system_tweaks::create_restore_point,
            commands::system_tweaks::toggle_network_tweaks,
            commands::system_tweaks::toggle_gpu_msi_mode,
            commands::system_tweaks::toggle_bcd_tweaks,
            commands::system_tweaks::toggle_telemetry_debloat,
            commands::system_tweaks::clean_shader_caches,
            commands::download::start_download,
            commands::download::start_game_download,
            commands::download::start_batch_downloads,
            commands::download::pause_download,
            commands::download::resume_download,
            commands::download::queue_download,
            commands::download::queue_bundle,
            commands::download::resume_queue_sequential,
            commands::download::cancel_download,
            commands::download::delete_download,
            commands::download::get_downloads,
            commands::download::get_download_progress,
            commands::profiles::list_profiles,
            commands::profiles::get_active_profile,
            commands::profiles::create_profile,
            commands::profiles::update_profile,
            commands::profiles::delete_profile,
            commands::profiles::switch_profile,
            commands::profiles::search_gaming_avatars,
            commands::profiles::download_avatar_data_url,
            commands::save_manager::get_game_save_details,
            commands::save_manager::apply_save_locations_from_database,
            commands::save_manager::auto_detect_save_locations_for_game,
            commands::save_manager::detect_game_saves,
            commands::save_manager::configure_save_location,
            commands::save_manager::remove_save_location,
            commands::save_manager::toggle_save_location,
            commands::save_manager::list_save_snapshots,
            commands::save_manager::restore_save_snapshot,
            commands::save_manager::delete_save_snapshot,
            commands::save_manager::clone_profile_save,
            commands::save_manager::open_save_folder,
            commands::save_manager::list_save_operations,
            commands::save_manager::export_game_save_zip,
            commands::save_manager::inspect_game_save_zip,
            commands::save_manager::restore_game_save_zip,
            commands::save_manager::get_default_save_backup_path,
            commands::steam_price::get_steam_game_price,
            commands::steam_price::get_steam_regional_prices,
            commands::soundtrack::soundtrack_resolve_game,
            commands::soundtrack::soundtrack_clear_game,
            commands::soundtrack::soundtrack_get_album,
            commands::soundtrack::soundtrack_get_all_albums,
            commands::soundtrack::soundtrack_save_album,
            commands::soundtrack::soundtrack_toggle_favorite,
            commands::soundtrack::soundtrack_get_favorites,
            commands::soundtrack::soundtrack_record_play,
            commands::soundtrack::soundtrack_get_history,
            commands::soundtrack::soundtrack_cache_get,
            commands::soundtrack::soundtrack_cache_set,
            commands::soundtrack::soundtrack_download,
            commands::soundtrack::soundtrack_cancel_download,
            commands::soundtrack::soundtrack_get_downloads,
            commands::soundtrack::soundtrack_get_download_directory,
            commands::soundtrack::soundtrack_set_download_directory,
            commands::soundtrack::soundtrack_scan_library,
            commands::soundtrack::soundtrack_get_local_files,
            commands::soundtrack::soundtrack_search_youtube,
            commands::soundtrack::soundtrack_http_get,
            commands::overlay::get_overlay_config,
            commands::overlay::save_overlay_config,
            commands::overlay::get_overlay_metrics,
            commands::overlay::start_overlay_telemetry,
            commands::overlay::stop_overlay_telemetry,
            commands::overlay::toggle_overlay_window,
            commands::overlay::set_overlay_click_through,
            commands::overlay::get_overlay_monitors,
            commands::overlay::get_telemetry_status,
            commands::overlay::is_overlay_visible,
            commands::overlay::get_overlay_hotkey_status,
            commands::overlay::push_overlay_notification,
            commands::cleanup::scan_cleanup_targets,
            commands::cleanup::execute_cleanup,
            commands::dualsense::dualsense_get_state,
            commands::dualsense::dualsense_select_slot,
            commands::dualsense::dualsense_set_xbox_emulation,
            commands::dualsense::dualsense_update_config,
            commands::dualsense::dualsense_set_virtual_override,
            commands::dualsense::dualsense_scan_devices,
            commands::dualsense::dualsense_trigger_rumble_test,
            commands::dualsense::dualsense_install_driver,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
