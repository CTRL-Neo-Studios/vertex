mod state;

use rayon::prelude::*;
use state::AppState;
use std::fs;
use std::path::Path;
use tauri::{Listener, Manager, WebviewWindow};
use tauri_plugin_decorum::WebviewWindowExt;
use url::Url;

const MAIN_WINDOW: &str = "main";
const SESSION_WINDOW_PREFIX: &str = "session-";

#[derive(serde::Serialize, serde::Deserialize)]
struct FileReadResult {
    path: String,
    content: Option<String>,
    error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct DirectoryEntry {
    path: String,
    name: String,
    is_directory: bool,
    size: u64,
    created: Option<i64>,  // Unix timestamp in milliseconds
    modified: Option<i64>, // Unix timestamp in milliseconds
    children: Vec<String>, // Paths of direct children
}

/// Reads multiple text files in parallel using Rust's native I/O and rayon for parallelism.
/// This is much faster than calling readTextFile multiple times from the frontend
/// because it reduces IPC overhead and uses efficient native I/O.
#[tauri::command]
fn read_text_files_batch(paths: Vec<String>) -> Vec<FileReadResult> {
    paths.par_iter()
        .map(|path| {
            match fs::read_to_string(path) {
                Ok(content) => FileReadResult {
                    path: path.clone(),
                    content: Some(content),
                    error: None,
                },
                Err(e) => FileReadResult {
                    path: path.clone(),
                    content: None,
                    error: Some(e.to_string()),
                }
            }
        })
        .collect()
}

/// Recursively scans a directory tree and returns all entries with metadata.
/// This is much faster than doing recursive readDir calls from JavaScript
/// because it eliminates all the IPC overhead and does the entire traversal in native code.
#[tauri::command]
fn scan_directory_recursive(root_path: String) -> Result<Vec<DirectoryEntry>, String> {
    let mut entries = Vec::new();
    let mut properties_files = Vec::new();
    
    fn scan_dir(
        path: &Path, 
        entries: &mut Vec<DirectoryEntry>,
        properties_files: &mut Vec<String>
    ) -> Result<Vec<String>, String> {
        let dir_entries = fs::read_dir(path)
            .map_err(|e| format!("Failed to read directory {}: {}", path.display(), e))?;
        
        let mut children = Vec::new();
        
        for entry in dir_entries {
            let entry = entry.map_err(|e| e.to_string())?;
            let entry_path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();
            
            // Skip hidden files (starting with .)
            if name.starts_with('.') {
                continue;
            }
            
            let metadata = fs::metadata(&entry_path)
                .map_err(|e| format!("Failed to get metadata for {}: {}", entry_path.display(), e))?;
            
            let is_directory = metadata.is_dir();
            let size = metadata.len();
            
            let created = metadata.created()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);
            
            let modified = metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);
            
            let path_str = entry_path.to_string_lossy().to_string();
            children.push(path_str.clone());
            
            // Track properties files
            if !is_directory && (name == "properties.yml" || name == "properties.yaml") {
                properties_files.push(path_str.clone());
            }
            
            let child_children = if is_directory {
                scan_dir(&entry_path, entries, properties_files)?
            } else {
                Vec::new()
            };
            
            entries.push(DirectoryEntry {
                path: path_str,
                name,
                is_directory,
                size,
                created,
                modified,
                children: child_children,
            });
        }
        
        // Sort children for consistent ordering
        children.sort();
        Ok(children)
    }
    
    scan_dir(Path::new(&root_path), &mut entries, &mut properties_files)?;
    Ok(entries)
}

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

/// Quits the app after every session window has flushed its pending session write.
/// Each window answers `vertex://flush-requested` by awaiting its last write and calling `flush_done`.
/// The timeout only guards against a hung webview; normal flushes finish in milliseconds.
#[tauri::command]
async fn quit_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) {
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Listener};

    let pending: std::collections::HashSet<String> = app
        .webview_windows()
        .into_keys()
        .filter(|l| l.starts_with(SESSION_WINDOW_PREFIX))
        .collect();
    if !pending.is_empty() {
        let pending = Arc::new(Mutex::new(pending));
        let (tx, rx) = tokio::sync::oneshot::channel::<()>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let id = {
            let (pending, tx) = (pending.clone(), tx.clone());
            app.listen_any(state::EVENT_FLUSH_DONE, move |event| {
                let label = event.payload().trim_matches('"').to_owned();
                let mut p = pending.lock().unwrap();
                p.remove(&label);
                if p.is_empty() {
                    if let Some(tx) = tx.lock().unwrap().take() {
                        let _ = tx.send(());
                    }
                }
            })
        };
        let _ = app.emit(state::EVENT_FLUSH_REQUESTED, ());
        let _ = tokio::time::timeout(std::time::Duration::from_secs(3), rx).await;
        app.unlisten(id);
    }
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second launch (Windows/Linux file association, or user re-opening the app).
            match parse_file_path_from_args(&args) {
                Some(path) => app.state::<AppState>().push_open_request(app, path),
                None => show_main_window(app),
            }
        }));
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .invoke_handler(tauri::generate_handler![
            read_text_files_batch,
            scan_directory_recursive,
            state::sessions_list,
            state::sessions_upsert,
            state::sessions_remove,
            state::settings_get,
            state::settings_set,
            state::take_open_requests,
            quit_app,
        ])
        .setup(|app| {
            let main_window = app.get_webview_window(MAIN_WINDOW).unwrap();
            apply_decorum_style(&main_window);

            // Cold start with a file argument (Windows/Linux).
            #[cfg(any(windows, target_os = "linux"))]
            {
                let args: Vec<String> = std::env::args().collect();
                if let Some(path) = parse_file_path_from_args(&args) {
                    app.state::<AppState>().push_open_request(app.handle(), path);
                }
            }

            let app_handle = app.handle().clone();
            app.listen_any("tauri://webview-created", move |event| {
                let label = event.payload().replace('"', "");
                if label.starts_with(SESSION_WINDOW_PREFIX) {
                    if let Some(win) = app_handle.get_webview_window(&label) {
                        apply_decorum_style(&win);
                    }
                    sync_main_visibility(&app_handle, None);
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
                if window.label().starts_with(SESSION_WINDOW_PREFIX) {
                    sync_main_visibility(window.app_handle(), Some(window.label()));
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // macOS delivers file associations (cold and warm) as RunEvent::Opened, possibly several at once.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                let state = _app_handle.state::<AppState>();
                for path in urls.iter().filter_map(|u| u.to_file_path().ok()) {
                    state.push_open_request(_app_handle, path.to_string_lossy().into_owned());
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
