use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindow};
use tauri_plugin_decorum::WebviewWindowExt;
use url::Url;

// GLOBAL STATIC STORAGE
// This survives across the entire app lifecycle, regardless of when functions are called.
static STARTUP_FILE: Mutex<Option<String>> = Mutex::new(None);

#[tauri::command]
fn get_startup_file() -> Option<String> {
    let mut file_guard = STARTUP_FILE.lock().unwrap();
    let file = file_guard.take(); // Read and clear

    // Log for debugging
    if let Some(ref f) = file {
        println!("[Rust] Frontend requested startup file. Found: {}", f);
    } else {
        println!("[Rust] Frontend requested startup file. Found: None");
    }

    file
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app.get_webview_window("main").expect("no main window").set_focus();

            // WARM START (Windows/Linux)
            if let Some(path) = parse_file_path_from_args(&args) {
                println!("[Rust] Warm Start (Args): {}", path);
                let _ = app.emit("open-file", path);
            }
        }));
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(tauri::generate_handler![get_startup_file])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            apply_decorum_style(&main_window);

            // COLD START (Windows/Linux - Args)
            #[cfg(any(windows, target_os = "linux"))]
            {
                let args: Vec<String> = std::env::args().collect();
                if let Some(path) = parse_file_path_from_args(&args) {
                    println!("[Rust] Cold Start (Args): {}", path);
                    *STARTUP_FILE.lock().unwrap() = Some(path);
                }
            }

            let app_handle = app.handle().clone();

            app.listen_any("tauri://webview-created", move |event| {
                 let label = event.payload();
                 let clean_label = label.replace("\"", "");

                 if clean_label.starts_with("session-") {
                     if let Some(win) = app_handle.get_webview_window(&clean_label) {
                         apply_decorum_style(&win);
                     }
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {

            // COLD & WARM START (macOS - File Associations)
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                // macOS delivers files as URLs (file:///...)
                if let Some(url) = urls.first() {
                     if let Ok(path_buf) = url.to_file_path() {
                         let path_str = path_buf.to_string_lossy().to_string();
                         println!("[Rust] macOS RunEvent::Opened: {}", path_str);

                         // 1. SAVE TO GLOBAL STATE ALWAYS
                         *STARTUP_FILE.lock().unwrap() = Some(path_str.clone());

                         // 2. ATTEMPT TO EMIT (Works if frontend is ready)
                         // If frontend is NOT ready, it will just miss this event,
                         // but it will pick up the data from STARTUP_FILE via the command.
                         if let Err(e) = app_handle.emit("open-file", path_str) {
                             println!("[Rust] Failed to emit event (window might not be ready): {}", e);
                         } else {
                             println!("[Rust] Emitted open-file event successfully");
                         }
                     }
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
        if i == 0 { continue; }
        if arg.starts_with("-") { continue; }

        if let Ok(url) = Url::parse(arg) {
            if let Ok(path) = url.to_file_path() {
                return Some(path.to_string_lossy().to_string());
            }
        }
        return Some(arg.clone());
    }
    None
}