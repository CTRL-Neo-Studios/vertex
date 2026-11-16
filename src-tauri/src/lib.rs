//! The app: builds the plugins (the kernel `tauri-plugin-vertex`, the feature plugins, third-party ones), keeps the
//! windows' lifecycle and hands files the OS asks it to open to the kernel. Every command lives in a plugin.

use tauri::{Listener, Manager, WebviewWindow};
use tauri_plugin_decorum::WebviewWindowExt;
use tauri_plugin_vertex::api::{self, SESSION_WINDOW_PREFIX};
use url::Url;

const MAIN_WINDOW: &str = "main";

fn show_main_window<R: tauri::Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(main) = app.get_webview_window(MAIN_WINDOW) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// Hides `main` once a session window exists and shows it again when the last one is gone,
/// so the app never ends up with zero visible windows. Driven by real window events, not timers.
fn sync_main_visibility<R: tauri::Runtime>(app: &tauri::AppHandle<R>, closing: Option<&str>) {
    let has_sessions = app
        .webview_windows()
        .keys()
        .any(|l| l.starts_with(SESSION_WINDOW_PREFIX) && Some(l.as_str()) != closing);
    if has_sessions {
        if let Some(main) = app.get_webview_window(MAIN_WINDOW) {
            let _ = main.hide();
        }
    } else {
        show_main_window(app);
    }
}

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
                None => show_main_window(app),
            }
        }));
        // Each session window (`session-{uuid}`, stable per session) and Settings reopen at their last size and
        // place, pulled back on screen when that monitor is gone. `main`, the start window, stays centred.
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().with_denylist(&[MAIN_WINDOW]).build());
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
            let main_window = app.get_webview_window(MAIN_WINDOW).unwrap();
            apply_decorum_style(&main_window);

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

            let app_handle = app.handle().clone();
            app.listen_any("tauri://webview-created", move |event| {
                let Some(label) = created_label(event.payload()) else { return };
                if let Some(uuid) = label.strip_prefix(SESSION_WINDOW_PREFIX) {
                    if let Some(win) = app_handle.get_webview_window(&label) {
                        apply_decorum_style(&win);
                    }
                    sync_main_visibility(&app_handle, None);
                    api::session_window(&app_handle, uuid, true);
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(uuid) = window.label().strip_prefix(SESSION_WINDOW_PREFIX) {
                    sync_main_visibility(window.app_handle(), Some(window.label()));
                    api::session_window(window.app_handle(), uuid, false);
                }
            }
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

fn apply_decorum_style(window: &WebviewWindow) {
    let _ = window.create_overlay_titlebar();
    #[cfg(target_os = "macos")]
    {
        // let _ = window.set_traffic_lights_inset(14.0, 21.0);
    }
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

/// The label in a `tauri://webview-created` payload (`{"label": "…"}`).
fn created_label(payload: &str) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(payload).ok()?.get("label")?.as_str().map(str::to_owned)
}

#[cfg(test)]
mod tests {
    #[test]
    fn created_label_reads_the_event_payload() {
        assert_eq!(super::created_label(r#"{"label":"session-a"}"#).as_deref(), Some("session-a"));
        assert_eq!(super::created_label(r#""session-a""#), None);
    }
}
