//! Vertex's kernel as a Tauri plugin (`vertex`): the app's windows, the state every window shares (sessions, settings,
//! trust, workspace settings), files, the Trash, the clipboard's files, fonts, update channels, the host services
//! every plugin builds on (`http_fetch`, `search_notes`, secrets, plugin data), and installed community plugins. Plugin
//! crates use its Rust API, [`api`].

pub mod api;
mod dialogs;
mod fonts;
mod grants;
mod host;
mod notes;
mod plugins;
mod sources;
mod protocol;
mod reach;
mod state;
mod trash;
mod updater;
mod web;
mod windows;

use api::SESSION_WINDOW_PREFIX;
use rayon::prelude::*;
use state::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Manager, RunEvent, Runtime, WindowEvent};

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

/// Every file and folder under `root_path` (hidden names skipped), each folder with its children's paths, in one
/// native traversal: no IPC per folder. Only the root failing is an error. What else can't be read is skipped, so one
/// bad entry doesn't cost the workspace its index: a link that leads nowhere, a folder without permission, something
/// deleted mid-scan. A linked folder is followed, except one that leads back to a folder it's inside (a loop), which
/// is listed without its contents.
#[tauri::command]
fn scan_directory_recursive(root_path: String) -> Result<Vec<DirectoryEntry>, String> {
    let root = Path::new(&root_path);
    let listing = fs::read_dir(root).map_err(|e| format!("Failed to read directory {}: {e}", root.display()))?;
    let mut entries = Vec::new();
    // The folders being scanned, outermost first, by their real paths.
    let mut inside = vec![fs::canonicalize(root).unwrap_or_else(|_| root.to_path_buf())];
    scan_dir(listing, &mut entries, &mut inside);
    Ok(entries)
}

/// Adds what `listing` holds (and what's under it) to `entries`; the listed paths, sorted.
fn scan_dir(listing: fs::ReadDir, entries: &mut Vec<DirectoryEntry>, inside: &mut Vec<PathBuf>) -> Vec<String> {
    let mut children = Vec::new();
    for entry in listing.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        // A link is what it leads to.
        let Ok(metadata) = fs::metadata(&path) else { continue };
        let is_directory = metadata.is_dir();
        let path_str = path.to_string_lossy().to_string();
        children.push(path_str.clone());

        let mut child_children = Vec::new();
        if is_directory {
            if let (Ok(real), Ok(listing)) = (fs::canonicalize(&path), fs::read_dir(&path)) {
                if !inside.contains(&real) {
                    inside.push(real);
                    child_children = scan_dir(listing, entries, inside);
                    inside.pop();
                }
            }
        }
        entries.push(entry_of(path_str, name, &metadata, child_children));
    }
    children.sort();
    children
}

fn entry_of(path: String, name: String, metadata: &fs::Metadata, children: Vec<String>) -> DirectoryEntry {
    let millis = |time: std::io::Result<SystemTime>| {
        time.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map(|d| d.as_millis() as i64)
    };
    DirectoryEntry {
        path,
        name,
        is_directory: metadata.is_dir(),
        size: metadata.len(),
        created: millis(metadata.created()),
        modified: millis(metadata.modified()),
        children,
    }
}

/// A path as `describe_paths` found it.
#[derive(serde::Serialize, serde::Deserialize)]
struct PathState {
    path: String,
    /// What's there (a folder without its `children`), or `None` when nothing is.
    entry: Option<DirectoryEntry>,
}

/// What the disk has at each path, in one call (Watcher Plan, W2): gone, or a file or folder with its size and times,
/// named as its folder lists it. On a disk that ignores case, a path asked for as `note.md` finds `Note.md`, and the
/// entry says `Note.md`: how a rename of case shows. A link is what it leads to; one that leads nowhere is gone.
#[tauri::command]
fn describe_paths(paths: Vec<String>) -> Vec<PathState> {
    // Each folder listed once, however many of the paths are in it.
    let mut listings: std::collections::HashMap<PathBuf, Vec<String>> = std::collections::HashMap::new();
    paths
        .into_iter()
        .map(|path| {
            let entry = fs::metadata(&path).ok().map(|metadata| {
                let asked = Path::new(&path);
                let asked_name = asked.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
                let names = asked.parent().map(|parent| {
                    listings.entry(parent.to_path_buf()).or_insert_with(|| {
                        fs::read_dir(parent).map(|l| l.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect()).unwrap_or_default()
                    })
                });
                // The name as written when the folder has it, else the one it has under another case.
                let name = names
                    .and_then(|names| {
                        if names.contains(&asked_name) {
                            None
                        } else {
                            names.iter().find(|n| n.to_lowercase() == asked_name.to_lowercase()).cloned()
                        }
                    })
                    .unwrap_or(asked_name);
                entry_of(path.clone(), name, &metadata, Vec::new())
            });
            PathState { path, entry }
        })
        .collect()
}

/// The files on the system clipboard (a Copy in Finder, Explorer or Vertex's Files), as absolute paths; none when it
/// holds no files or can't be read. The asking window may read them from now on: they're what it pastes.
#[tauri::command]
fn clipboard_files_get<R: Runtime>(webview: tauri::Webview<R>) -> Vec<String> {
    let paths: Vec<String> = arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.get().file_list())
        .map(|list| list.into_iter().map(|p| p.to_string_lossy().into_owned()).collect())
        .unwrap_or_default();
    for path in &paths {
        if let Err(e) = grants::grant_files(webview.app_handle(), webview.label(), path, grants::Files::Paste) {
            eprintln!("[clipboard] {path}: {e}");
        }
    }
    paths
}

/// Puts files on the system clipboard, as Finder's or Explorer's Copy does: they paste there, and into Vertex.
#[tauri::command]
fn clipboard_files_set(paths: Vec<String>) -> Result<(), String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set().file_list(&paths))
        .map_err(|e| e.to_string())
}

/// Shows `paths` in Finder or Explorer. The opener plugin's own command checks no scope; this one goes through the gate.
#[tauri::command]
async fn reveal_paths(paths: Vec<String>) -> Result<(), String> {
    api::blocking(move || tauri_plugin_opener::reveal_items_in_dir(&paths).map_err(|e| e.to_string())).await
}

/// Asks every session window to flush its pending session write (`vertex://flush-requested`; each answers with
/// `flush_done` once its last write is done) and waits for them. The timeout only guards against a hung webview; normal
/// flushes finish in milliseconds. From now on a destroyed session window keeps its session `open`, for the next launch.
async fn flush_windows<R: Runtime>(app: &AppHandle<R>) {
    use std::sync::{Arc, Mutex};
    use tauri::{Emitter, Listener};

    app.state::<AppState>().set_quitting();
    let pending: std::collections::HashSet<String> = app
        .webview_windows()
        .into_keys()
        .filter(|l| l.starts_with(SESSION_WINDOW_PREFIX))
        .collect();
    if pending.is_empty() {
        return;
    }
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

/// Quits the app after every session window has flushed its pending session write.
#[tauri::command]
async fn quit_app<R: Runtime>(app: AppHandle<R>) {
    flush_windows(&app).await;
    app.exit(0);
}

/// Restarts the app as quitting does, and the next launch reopens every session window that was open, whatever the
/// recovery setting. How a plugin turned off loses its grants: Tauri can't take one back from a running app.
#[tauri::command]
async fn restart_app<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    flush_windows(&app).await;
    state::mark_restart(&app)?;
    app.request_restart();
    Ok(())
}

/// The kernel plugin. Register it before every plugin that uses [`api`] in its setup (Tauri sets plugins up in
/// registration order).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("vertex")
        // Every command taking a path is checked against the calling window's reach first (`reach.rs`).
        .invoke_handler(reach::gate(reach::kernel_path_args, tauri::generate_handler![
            read_text_files_batch,
            scan_directory_recursive,
            describe_paths,
            state::sessions_list,
            state::sessions_upsert,
            state::sessions_remove,
            state::settings_get,
            state::settings_set,
            state::trust_get,
            state::trust_set,
            state::trust_revoke,
            state::trust_clear,
            state::trust_move,
            state::trust_follow_edit,
            state::trust_pin,
            state::workspace_settings_get,
            state::workspace_settings_update,
            state::workspace_settings_reload,
            state::take_open_requests,
            quit_app,
            restart_app,
            grants::plugins_waiting_restart,
            clipboard_files_get,
            clipboard_files_set,
            reveal_paths,
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
            plugins::plugins_list,
            plugins::plugin_read,
            plugins::plugin_stage,
            plugins::plugin_discard,
            plugins::plugin_install,
            plugins::plugin_remove,
            plugins::plugin_readme,
            plugins::plugin_source_resolve,
            plugins::plugin_updates,
            windows::window_open,
            dialogs::dialog_open,
            dialogs::dialog_save,
        ]))
        .register_asynchronous_uri_scheme_protocol(protocol::SCHEME, protocol::handle)
        .register_asynchronous_uri_scheme_protocol(plugins::SCHEME, plugins::handle)
        .setup(|app, _api| {
            app.manage(AppState::default());
            app.manage(grants::WindowGrants::default());
            app.manage(reach::Reaches::default());
            app.manage(plugins::Watches::default());
            app.manage(plugins::Updates::default());
            let handle = app.clone();
            app.state::<AppState>().on_settings_change(Box::new(move |_, new| plugins::sync_watches(&handle, new)));
            Ok(())
        })
        .on_event(|app, event| {
            if let RunEvent::WindowEvent { label, event: WindowEvent::Destroyed, .. } = event {
                windows::destroyed(app, label);
            }
        })
        .build()
}

#[cfg(all(test, unix))]
mod tests {
    use super::{describe_paths, scan_directory_recursive};
    use std::fs;
    use std::os::unix::fs::symlink;

    #[test]
    fn a_scan_skips_what_it_cannot_read_and_follows_no_loop() {
        let root = std::env::temp_dir().join(format!("vertex-scan-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("notes/deep")).unwrap();
        fs::write(root.join("notes/a.md"), "a").unwrap();
        fs::write(root.join(".hidden.md"), "h").unwrap();
        // A link that leads nowhere, one back to the root from inside it, and one to a folder beside it.
        symlink(root.join("gone"), root.join("dangling.md")).unwrap();
        symlink(&root, root.join("notes/deep/loop")).unwrap();
        symlink(root.join("notes"), root.join("linked")).unwrap();

        let entries = scan_directory_recursive(root.to_string_lossy().into_owned()).unwrap();
        let prefix = format!("{}/", root.to_string_lossy());
        let mut listed: Vec<(String, usize)> =
            entries.iter().map(|e| (e.path.trim_start_matches(&prefix).to_string(), e.children.len())).collect();
        listed.sort();
        let expected = [
            ("linked", 2), ("linked/a.md", 0), ("linked/deep", 1), ("linked/deep/loop", 0),
            ("notes", 2), ("notes/a.md", 0), ("notes/deep", 1), ("notes/deep/loop", 0),
        ];
        assert_eq!(listed, expected.map(|(path, children)| (path.to_string(), children)));
        assert!(scan_directory_recursive(root.join("gone").to_string_lossy().into_owned()).is_err());
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn paths_are_described_as_the_disk_has_them() {
        let root = std::env::temp_dir().join(format!("vertex-describe-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("folder")).unwrap();
        fs::write(root.join("Note.md"), "four").unwrap();
        symlink(root.join("gone"), root.join("dangling.md")).unwrap();
        let path = |name: &str| root.join(name).to_string_lossy().into_owned();
        let asked = ["Note.md", "folder", "gone.md", "dangling.md", "note.md"].map(path);

        let found = describe_paths(asked.to_vec());
        let shown: Vec<_> = found.iter().map(|s| (s.path.clone(), s.entry.as_ref().map(|e| (e.name.clone(), e.is_directory, e.size)))).collect();
        assert_eq!(shown[..4], [
            (path("Note.md"), Some(("Note.md".to_string(), false, 4))),
            (path("folder"), Some(("folder".to_string(), true, shown[1].1.as_ref().unwrap().2))),
            (path("gone.md"), None),
            (path("dangling.md"), None),
        ]);
        assert!(found[0].entry.as_ref().unwrap().modified.is_some());
        // A disk that ignores case (macOS's, Windows') finds `Note.md` for `note.md`, under its own name; one that
        // doesn't, nothing.
        let case_blind = fs::metadata(root.join("note.md")).is_ok();
        assert_eq!(shown[4].1, case_blind.then(|| ("Note.md".to_string(), false, 4)));
        fs::remove_dir_all(&root).unwrap();
    }
}
