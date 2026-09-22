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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Fix WebKitGTK DMA-BUF rendering glitch on Wayland compositors (Hyprland, Sway, GNOME Wayland with Nvidia, etc.)
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
    }

    tauri::Builder::default()
        // Second launch of the installed exe must not spawn a second
        // window: focus the existing one instead. Must be the FIRST
        // plugin so later plugins don't initialize twice.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
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
                let conn = database.connection.lock().expect("db mutex poisoned");
                if let Err(err) = commands::save_manager::recovery::CrashRecoveryEngine::recover_interrupted_operations(&conn) {
                    log::error!("Failed to recover interrupted save operations: {}", err);
                }
                let configured = commands::save_manager::auto_configure_all_installed_games(&conn);
                if configured > 0 {
                    log::info!("Auto-configured save locations for {} games from save manifest database", configured);
                }
            }
            app.manage(database);

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
            // Download tasks die with the process — orphaned mid-flight
            // rows become resumable paused entries (see download.rs).
            commands::download::recover_orphaned_downloads(app.handle());

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
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    }
                    | tauri::tray::TrayIconEvent::DoubleClick {
                        button: tauri::tray::MouseButton::Left,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::system::health_check,
            commands::system::shutdown_system,
            commands::system::get_system_specs,
            commands::system::get_live_metrics,
            commands::games::list_games,
            commands::games::get_game,
            commands::games::create_game,
            commands::games::update_game_installation,
            commands::games::update_game_flags,
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
            commands::hub::search_hub_games,
            commands::hub::list_hub_genres,
            commands::hub::list_hub_platforms,
            commands::hub::get_hub_feed,
            commands::hub::get_hub_game_details,
            commands::hub::get_hub_similar_games,
            commands::hub::add_game_from_hub,
            commands::hub::add_game_to_wishlist,
            commands::hub::open_google_auth_window,
            commands::hub::open_trailer_window,
            commands::hub::mount_embedded_trailer,
            commands::hub::unmount_embedded_trailer,
            paths::is_portable_mode,
            commands::import::resolve_shortcut,
            commands::import::scan_folder_for_executables,
            commands::import::compute_path_size,
            commands::scan::scan_all_stores,
            commands::scan::import_scanned_games,
            commands::backup::export_backup,
            commands::backup::import_backup,
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
            commands::booster::scan_boostable_apps,
            commands::booster::run_game_boost,
            commands::booster::boost_ram_only,
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
            commands::steam_price::get_steam_game_price,
            commands::steam_price::get_steam_regional_prices,
            commands::soundtrack::soundtrack_resolve_game,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
