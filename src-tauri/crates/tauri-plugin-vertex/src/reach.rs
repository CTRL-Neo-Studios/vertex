//! What each window may reach on disk (Window Permissions Plan, W4). A workspace window: its root, recursive; a
//! single-file window: its file's folder, not recursive; Settings: every workspace in `sessions.json`; every window:
//! what the user picked in a dialog there and the clipboard's files it asked for. A plugin on for the window that asks
//! for `files-outside-workspace` reaches everything. Paths are compared as Tauri's fs scope compares them: `..`
//! resolved, symlinks followed, so a link to outside the workspace is outside.

use crate::api::SESSION_WINDOW_PREFIX;
use crate::state::AppState;
use crate::windows::SETTINGS_WINDOW;
use serde_json::Value;
use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::ipc::{Invoke, InvokeBody};
use tauri::{AppHandle, Manager, Runtime};

/// A folder or file a window reaches: with everything under it (`recursive`), or itself and what's directly in it.
#[derive(Clone, Debug, PartialEq)]
pub struct Entry {
    pub path: PathBuf,
    pub recursive: bool,
}

impl Entry {
    pub fn covers(&self, path: &Path) -> bool {
        if self.recursive {
            path.starts_with(&self.path)
        } else {
            path == self.path || path.parent() == Some(&self.path)
        }
    }
}

/// `path` as Tauri's fs scope sees it: `.` and `..` resolved, then symlinks followed as far as the path exists.
pub fn canonical(path: &Path) -> PathBuf {
    let mut lexical = PathBuf::new();
    for component in path.components() {
        match component {
            Component::ParentDir => {
                lexical.pop();
            }
            Component::CurDir => {}
            other => lexical.push(other),
        }
    }
    let mut existing = lexical.as_path();
    let mut rest = Vec::new();
    loop {
        if let Ok(real) = dunce::canonicalize(existing) {
            return rest.iter().rev().fold(real, |p, part| p.join(part));
        }
        match (existing.parent(), existing.file_name()) {
            (Some(parent), Some(name)) => {
                rest.push(name.to_owned());
                existing = parent;
            }
            _ => return lexical,
        }
    }
}

/// What's added to a window's reach as it runs.
#[derive(Clone)]
struct Added {
    entry: Entry,
    /// Picked in a dialog (else the clipboard's).
    picked: bool,
}

#[derive(Default)]
pub(crate) struct Reaches {
    /// A session window's root, fixed when it's first granted: its session's root could change in `sessions.json`.
    roots: Mutex<HashMap<String, Entry>>,
    added: Mutex<HashMap<String, Vec<Added>>>,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The root of the session window `label`, fixed at its first call: a workspace's folder, or a single file's folder.
pub(crate) fn session_root<R: Runtime>(app: &AppHandle<R>, label: &str) -> Option<Entry> {
    let uuid = label.strip_prefix(SESSION_WINDOW_PREFIX)?;
    let state = app.state::<Reaches>();
    let mut roots = lock(&state.roots);
    if let Some(entry) = roots.get(label) {
        return Some(entry.clone());
    }
    let (root, workspace) = app.state::<AppState>().session_root(app, uuid)?;
    let entry = if workspace {
        Entry { path: canonical(Path::new(&root)), recursive: true }
    } else {
        Entry { path: canonical(Path::new(&root).parent()?), recursive: false }
    };
    roots.insert(label.to_owned(), entry.clone());
    Some(entry)
}

/// Everything the window `label` reaches, but what `files-outside-workspace` adds.
pub(crate) fn entries<R: Runtime>(app: &AppHandle<R>, label: &str) -> Vec<Entry> {
    let mut out: Vec<Entry> = lock(&app.state::<Reaches>().added).get(label).into_iter().flatten().map(|a| a.entry.clone()).collect();
    out.extend(session_root(app, label));
    if label == SETTINGS_WINDOW {
        let roots = app.state::<AppState>().workspace_roots(app);
        out.extend(roots.iter().map(|root| Entry { path: canonical(Path::new(root)), recursive: true }));
    }
    out
}

/// Whether the window `label` may reach `path` (absolute).
pub fn reaches<R: Runtime>(app: &AppHandle<R>, label: &str, path: &str) -> bool {
    let path = Path::new(path);
    if !path.is_absolute() {
        return false;
    }
    let path = canonical(path);
    entries(app, label).iter().any(|e| e.covers(&path)) || crate::grants::everywhere(app, label)
}

/// Adds `path` (and everything under it) to the window `label`'s reach: a dialog's pick, or a file on the clipboard.
pub(crate) fn add<R: Runtime>(app: &AppHandle<R>, label: &str, path: &str, picked: bool) {
    let entry = Entry { path: canonical(Path::new(path)), recursive: true };
    lock(&app.state::<Reaches>().added).entry(label.to_owned()).or_default().push(Added { entry, picked });
}

/// Whether the user picked `path` itself in a dialog of the window `label`.
pub(crate) fn picked<R: Runtime>(app: &AppHandle<R>, label: &str, path: &str) -> bool {
    let path = canonical(Path::new(path));
    lock(&app.state::<Reaches>().added).get(label).into_iter().flatten().any(|a| a.picked && a.entry.path == path)
}

/// Every string in `value`: itself, or those of a list.
fn strings(value: Option<&Value>) -> Vec<&str> {
    match value {
        Some(Value::String(s)) => vec![s],
        Some(Value::Array(list)) => list.iter().filter_map(Value::as_str).collect(),
        _ => Vec::new(),
    }
}

/// `handler`, refusing a call whose path arguments (`path_args(command)`, their names as the webview sends them) aren't
/// all in the calling window's reach. One gate per plugin: a path command added later is checked once it's listed.
pub fn gate<R: Runtime>(
    path_args: fn(&str) -> &'static [&'static str],
    handler: impl Fn(Invoke<R>) -> bool + Send + Sync + 'static,
) -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    move |invoke: Invoke<R>| {
        let refused = match invoke.message.payload() {
            InvokeBody::Json(args) => {
                let webview = invoke.message.webview();
                path_args(invoke.message.command())
                    .iter()
                    .flat_map(|name| strings(args.get(*name)))
                    .find(|path| !reaches(webview.app_handle(), webview.label(), path))
                    .map(|path| format!("{path:?} is outside what this window may reach"))
            }
            _ => None,
        };
        match refused {
            Some(error) => {
                invoke.resolver.reject(error);
                true
            }
            None => handler(invoke),
        }
    }
}

/// The kernel's commands whose arguments are paths, by those arguments' names.
pub(crate) fn kernel_path_args(command: &str) -> &'static [&'static str] {
    match command {
        "read_text_files_batch" | "clipboard_files_set" | "reveal_paths" => &["paths"],
        "scan_directory_recursive" => &["rootPath"],
        "trash_item" | "trust_set" | "trust_follow_edit" => &["path"],
        "trust_move" => &["from", "to"],
        "trust_pin" => &["folder", "path"],
        "search_notes" | "data_get" | "data_set" | "workspace_settings_get" | "workspace_settings_update" | "workspace_settings_reload" => &["root"],
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_folder_covers_what_is_under_it_and_a_flat_one_only_its_children() {
        let deep = Entry { path: PathBuf::from("/v/notes"), recursive: true };
        let flat = Entry { path: PathBuf::from("/v/notes"), recursive: false };
        assert!(deep.covers(Path::new("/v/notes/a/b.md")));
        assert!(!deep.covers(Path::new("/v/notes-2/b.md")));
        assert!(flat.covers(Path::new("/v/notes/b.md")));
        assert!(flat.covers(Path::new("/v/notes")));
        assert!(!flat.covers(Path::new("/v/notes/a/b.md")));
    }

    #[test]
    fn canonical_resolves_dot_dot_and_symlinks_of_what_exists() {
        let dir = std::env::temp_dir().join(format!("vertex-reach-{}", std::process::id()));
        let (inside, outside) = (dir.join("vault"), dir.join("secrets"));
        std::fs::create_dir_all(&inside).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        let real = |p: &Path| dunce::canonicalize(p).unwrap();
        assert_eq!(canonical(&inside.join("../secrets/key")), real(&outside).join("key"));
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&outside, inside.join("link")).unwrap();
            let root = Entry { path: real(&inside), recursive: true };
            assert!(!root.covers(&canonical(&inside.join("link/key"))), "a link out of the vault leads outside");
            assert!(root.covers(&canonical(&inside.join("new/note.md"))));
        }
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
