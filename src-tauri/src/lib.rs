use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Listener, Manager, WebviewWindow};
use tauri_plugin_decorum::WebviewWindowExt;
use url::Url;
use rayon::prelude::*;
use std::fs;

// GLOBAL STATIC STORAGE
// This survives across the entire app lifecycle, regardless of when functions are called.
static STARTUP_FILE: Mutex<Option<String>> = Mutex::new(None);

#[derive(serde::Serialize, serde::Deserialize)]
struct FileReadResult {
    path: String,
    content: Option<String>,
    error: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct FileStatResult {
    path: String,
    size: Option<u64>,
    created: Option<i64>,  // Unix timestamp in milliseconds
    modified: Option<i64>, // Unix timestamp in milliseconds
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

/// Gets file metadata (size, created time, modified time) for multiple files in parallel.
/// Much faster than calling stat() multiple times from the frontend due to reduced IPC overhead.
#[tauri::command]
fn stat_files_batch(paths: Vec<String>) -> Vec<FileStatResult> {
    paths.par_iter()
        .map(|path| {
            match fs::metadata(path) {
                Ok(metadata) => {
                    let size = Some(metadata.len());
                    
                    // Convert system times to Unix timestamps in milliseconds
                    let created = metadata.created()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as i64);
                    
                    let modified = metadata.modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as i64);
                    
                    FileStatResult {
                        path: path.clone(),
                        size,
                        created,
                        modified,
                        error: None,
                    }
                },
                Err(e) => FileStatResult {
                    path: path.clone(),
                    size: None,
                    created: None,
                    modified: None,
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
    let mut builder = tauri::Builder::default().plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();

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
        .invoke_handler(tauri::generate_handler![
            get_startup_file, 
            read_text_files_batch, 
            stat_files_batch,
            scan_directory_recursive
        ])
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
                            println!(
                                "[Rust] Failed to emit event (window might not be ready): {}",
                                e
                            );
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
