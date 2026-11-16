//! Vertex's kernel as a Tauri plugin (`vertex`): the state every window shares (sessions, settings, trust, workspace
//! settings), files, the Trash, the clipboard's files, fonts, update channels, and the host services every plugin
//! builds on (`http_fetch`, `search_notes`, secrets, plugin data). Plugin crates use its Rust API, [`api`].

pub mod api;
mod fonts;
mod host;
mod notes;
mod state;
mod trash;
mod updater;
mod web;

use api::SESSION_WINDOW_PREFIX;
use rayon::prelude::*;
use state::AppState;
use std::fs;
use std::path::Path;
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, Runtime};

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
    paths
        .par_iter()
        .map(|path| match fs::read_to_string(path) {
            Ok(content) => FileReadResult {
                path: path.clone(),
                content: Some(content),
                error: None,
            },
            Err(e) => FileReadResult {
                path: path.clone(),
                content: None,
                error: Some(e.to_string()),
            },
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
        properties_files: &mut Vec<String>,
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

            let metadata = fs::metadata(&entry_path).map_err(|e| {
                format!("Failed to get metadata for {}: {}", entry_path.display(), e)
            })?;

            let is_directory = metadata.is_dir();
            let size = metadata.len();

            let created = metadata
                .created()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);

            let modified = metadata
                .modified()
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

/// The files on the system clipboard (a Copy in Finder, Explorer or Vertex's Files), as absolute paths; none when it
/// holds no files or can't be read.
#[tauri::command]
fn clipboard_files_get() -> Vec<String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.get().file_list())
        .map(|list| list.into_iter().map(|p| p.to_string_lossy().into_owned()).collect())
        .unwrap_or_default()
}

/// Puts files on the system clipboard, as Finder's or Explorer's Copy does: they paste there, and into Vertex.
#[tauri::command]
fn clipboard_files_set(paths: Vec<String>) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set().file_list(&paths))
        .map_err(|e| e.to_string())
}

/// Quits the app after every session window has flushed its pending session write.
/// Each window answers `vertex://flush-requested` by awaiting its last write and calling `flush_done`.
/// The timeout only guards against a hung webview; normal flushes finish in milliseconds.
#[tauri::command]
async fn quit_app<R: Runtime>(app: AppHandle<R>) {
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Listener};

    app.state::<AppState>().set_quitting();
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

/// The kernel plugin. Register it before every plugin that uses [`api`] in its setup (Tauri sets plugins up in
/// registration order).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vertex")
        .invoke_handler(tauri::generate_handler![
            read_text_files_batch,
            scan_directory_recursive,
            state::sessions_list,
            state::sessions_upsert,
            state::sessions_remove,
            state::settings_get,
            state::settings_set,
            state::trust_get,
            state::trust_set,
            state::trust_clear,
            state::trust_move,
            state::trust_follow_edit,
            state::trust_pin,
            state::workspace_settings_get,
            state::workspace_settings_update,
            state::workspace_settings_reload,
            state::take_open_requests,
            quit_app,
            clipboard_files_get,
            clipboard_files_set,
            trash::trash_item,
            trash::trash_restore,
            updater::update_token_get,
            updater::update_token_set,
            updater::update_channels,
            fonts::system_fonts,
            web::http_fetch,
            notes::search_notes,
            host::secret_get,
            host::secret_set,
            host::secret_delete,
            host::data_get,
            host::data_set,
        ])
        .setup(|app, _api| {
            app.manage(AppState::default());
            Ok(())
        })
        .build()
}
