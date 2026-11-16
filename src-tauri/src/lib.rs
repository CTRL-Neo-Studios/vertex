//! The app: builds the plugins (the kernel `tauri-plugin-vertex`, the feature plugins, third-party ones), opens the
//! start window, and hands files the OS asks it to open to the kernel. Every command lives in a plugin, and the kernel
//! makes every window (`windows.rs` there).

use tauri_plugin_decorum::WebviewWindowExt;
use tauri_plugin_vertex::api;
use url::Url;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The kernel first: the feature plugins use its API when they're set up.
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_vertex::init())
        .plugin(tauri_plugin_vertex_ai::init())
        .plugin(tauri_plugin_vertex_chats::init())
        .plugin(tauri_plugin_vertex_git::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second launch (Windows/Linux file association, or user re-opening the app).
            match parse_file_path_from_args(&args) {
                Some(path) => api::push_open_request(app, path),
                None => api::show_main(app),
            }
        }));
        // Each session window (`session-{uuid}`, stable per session) and Settings reopen at their last size and
        // place, pulled back on screen when that monitor is gone. `main`, the start window, stays centred.
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().with_denylist(&[api::MAIN_WINDOW]).build());
        builder = builder.plugin(tauri_plugin_drag::init());
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // After every plugin is set up (window state, decorum), so the start window gets them as any other. Every
            // window the kernel builds gets the overlay title bar.
            api::set_window_style(app.handle(), |window| {
                let _ = window.create_overlay_titlebar();
            });
            api::open_main(app.handle())?;

            // trust.json exists from launch (and old settings migrate then), not only once a window reads it.
            if let Err(e) = api::ensure_trust(app.handle()) {
                eprintln!("[state] could not create trust.json: {e}");
            }

            // Cold start with a file argument (Windows/Linux).
            #[cfg(any(windows, target_os = "linux"))]
            {
                let args: Vec<String> = std::env::args().collect();
                if let Some(path) = parse_file_path_from_args(&args) {
                    api::push_open_request(app.handle(), path);
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // Quitting by any route (menu, Dock, ⌘Q, shutdown): windows destroyed from now on stay `open`, for recovery.
            if let tauri::RunEvent::ExitRequested { .. } = _event {
                api::set_quitting(_app_handle);
            }
            // macOS delivers file associations (cold and warm) as RunEvent::Opened, possibly several at once.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                for path in urls.iter().filter_map(|u| u.to_file_path().ok()) {
                    api::push_open_request(_app_handle, path.to_string_lossy().into_owned());
                }
            }
        });
}

fn parse_file_path_from_args(args: &[String]) -> Option<String> {
    for (i, arg) in args.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if arg.starts_with("-") {
            continue;
        }

        if let Ok(url) = Url::parse(arg) {
            if let Ok(path) = url.to_file_path() {
                return Some(path.to_string_lossy().to_string());
            }
        }
        return Some(arg.clone());
    }
    None
}
