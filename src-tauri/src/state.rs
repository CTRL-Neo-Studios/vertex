//! Single writer for state shared by every window.
//!
//! Webviews never write `sessions.json` / `settings.json` themselves: they call these commands,
//! Rust mutates the in-memory copy under a mutex, persists it, and broadcasts the new value.
//! That removes the read-modify-write races that existed when each window kept its own copy.

use serde_json::{Map, Value};
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const SESSIONS_FILE: &str = "sessions.json";
pub const SETTINGS_FILE: &str = "settings.json";
pub const EVENT_SESSIONS_CHANGED: &str = "vertex://sessions-changed";
pub const EVENT_SETTINGS_CHANGED: &str = "vertex://settings-changed";
pub const EVENT_OPEN_REQUESTED: &str = "vertex://open-requested";
pub const EVENT_FLUSH_REQUESTED: &str = "vertex://flush-requested";
pub const EVENT_FLUSH_DONE: &str = "vertex://flush-done";

/// On-disk layout is kept identical to the previous tauri-plugin-store files
/// (`{"data": {"openedSessions": [...]}}` and `{"settings": {...}}`) so existing users keep their state.
const SESSIONS_ROOT: &str = "data";
const SESSIONS_LIST: &str = "openedSessions";
const SETTINGS_ROOT: &str = "settings";

#[derive(Default)]
pub struct AppState {
    sessions: Mutex<Option<Vec<Value>>>,
    settings: Mutex<Option<Value>>,
    open_queue: Mutex<VecDeque<String>>,
}

fn store_path<R: Runtime>(app: &AppHandle<R>, file: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(file))
}

fn read_json<R: Runtime>(app: &AppHandle<R>, file: &str) -> Value {
    store_path(app, file)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or(Value::Null)
}

/// Write via temp file + rename so a crash mid-write never leaves a truncated store.
fn write_json<R: Runtime>(app: &AppHandle<R>, file: &str, value: &Value) -> Result<(), String> {
    let path = store_path(app, file)?;
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?;
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

fn session_uuid(v: &Value) -> Option<&str> {
    v.get("uuid").and_then(Value::as_str)
}

/// Same rules the frontend used to apply on every load: drop entries missing required
/// fields and keep only the first session per (type, root path).
pub fn sanitize_sessions(list: Vec<Value>) -> Vec<Value> {
    let mut seen = std::collections::HashSet::new();
    list.into_iter()
        .filter(|s| {
            let (Some(uuid), Some(kind), Some(root)) = (
                session_uuid(s),
                s.get("sessionType").and_then(Value::as_str),
                s.get("rootFileOrFolderAbsolutePath").and_then(Value::as_str),
            ) else {
                return false;
            };
            !uuid.is_empty() && !root.is_empty() && seen.insert(format!("{kind}:{root}"))
        })
        .collect()
}

/// Insert or merge one session by uuid. Returns the merged session.
pub fn upsert_session(list: &mut Vec<Value>, session: Value) -> Result<Value, String> {
    let uuid = session_uuid(&session).ok_or("session has no uuid")?.to_owned();
    match list.iter_mut().find(|s| session_uuid(s) == Some(uuid.as_str())) {
        Some(existing) => {
            merge(existing, session);
            Ok(existing.clone())
        }
        None => {
            list.push(session.clone());
            Ok(session)
        }
    }
}

/// Shallow-merge `patch` into `target` (objects only); nested objects are replaced, not merged,
/// so a session's `context` is always written as one consistent snapshot.
fn merge(target: &mut Value, patch: Value) {
    match (target.as_object_mut(), patch) {
        (Some(t), Value::Object(p)) => {
            for (k, v) in p {
                t.insert(k, v);
            }
        }
        (_, p) => *target = p,
    }
}

impl AppState {
    fn with_sessions<R: Runtime, T>(
        &self,
        app: &AppHandle<R>,
        f: impl FnOnce(&mut Vec<Value>) -> Result<T, String>,
        persist: bool,
    ) -> Result<T, String> {
        let mut guard = self.sessions.lock().map_err(|e| e.to_string())?;
        let list = guard.get_or_insert_with(|| {
            let raw = read_json(app, SESSIONS_FILE);
            let list = raw
                .get(SESSIONS_ROOT)
                .and_then(|d| d.get(SESSIONS_LIST))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            sanitize_sessions(list)
        });
        let out = f(list)?;
        if persist {
            let mut root = Map::new();
            let mut data = Map::new();
            data.insert(SESSIONS_LIST.into(), Value::Array(list.clone()));
            root.insert(SESSIONS_ROOT.into(), Value::Object(data));
            write_json(app, SESSIONS_FILE, &Value::Object(root))?;
            app.emit(EVENT_SESSIONS_CHANGED, list.clone()).map_err(|e| e.to_string())?;
        }
        Ok(out)
    }

    fn with_settings<R: Runtime, T>(
        &self,
        app: &AppHandle<R>,
        f: impl FnOnce(&mut Value) -> T,
        persist: bool,
    ) -> Result<T, String> {
        let mut guard = self.settings.lock().map_err(|e| e.to_string())?;
        let settings = guard.get_or_insert_with(|| {
            read_json(app, SETTINGS_FILE).get(SETTINGS_ROOT).cloned().unwrap_or(Value::Null)
        });
        let out = f(settings);
        if persist {
            let mut root = Map::new();
            root.insert(SETTINGS_ROOT.into(), settings.clone());
            write_json(app, SETTINGS_FILE, &Value::Object(root))?;
            app.emit(EVENT_SETTINGS_CHANGED, settings.clone()).map_err(|e| e.to_string())?;
        }
        Ok(out)
    }

    pub fn push_open_request<R: Runtime>(&self, app: &AppHandle<R>, path: String) {
        if let Ok(mut q) = self.open_queue.lock() {
            q.push_back(path);
        }
        // Wake the frontend; it drains the queue, so a missed event loses nothing.
        let _ = app.emit(EVENT_OPEN_REQUESTED, ());
    }
}

#[tauri::command]
pub fn sessions_list<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<Vec<Value>, String> {
    state.with_sessions(&app, |l| Ok(l.clone()), false)
}

#[tauri::command]
pub fn sessions_upsert<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>, session: Value) -> Result<Value, String> {
    state.with_sessions(&app, |l| upsert_session(l, session), true)
}

#[tauri::command]
pub fn sessions_remove<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>, uuid: String) -> Result<(), String> {
    state.with_sessions(&app, |l| {
        l.retain(|s| session_uuid(s) != Some(uuid.as_str()));
        Ok(())
    }, true)
}

#[tauri::command]
pub fn settings_get<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>) -> Result<Value, String> {
    state.with_settings(&app, |s| s.clone(), false)
}

#[tauri::command]
pub fn settings_set<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, AppState>, settings: Value) -> Result<(), String> {
    state.with_settings(&app, |s| *s = settings, true)
}

/// Returns and clears every path the OS asked us to open (file associations, second launches).
#[tauri::command]
pub fn take_open_requests(state: tauri::State<'_, AppState>) -> Vec<String> {
    state.open_queue.lock().map(|mut q| q.drain(..).collect()).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn open_queue_keeps_every_path_in_order_and_drains_once() {
        let state = AppState::default();
        state.open_queue.lock().unwrap().extend(["/a.md".to_string(), "/b.md".to_string()]);
        let first: Vec<String> = state.open_queue.lock().unwrap().drain(..).collect();
        assert_eq!(first, ["/a.md", "/b.md"]);
        assert!(state.open_queue.lock().unwrap().is_empty());
    }

    #[test]
    fn sanitize_drops_invalid_and_duplicates() {
        let out = sanitize_sessions(vec![
            json!({"uuid": "a", "sessionType": "workspace", "rootFileOrFolderAbsolutePath": "/v"}),
            json!({"uuid": "b", "sessionType": "workspace", "rootFileOrFolderAbsolutePath": "/v"}),
            json!({"uuid": "c", "sessionType": "singlespace", "rootFileOrFolderAbsolutePath": "/v"}),
            json!({"uuid": "", "sessionType": "workspace", "rootFileOrFolderAbsolutePath": "/w"}),
            json!({"uuid": "d", "sessionType": "workspace"}),
        ]);
        let ids: Vec<_> = out.iter().map(|s| s["uuid"].as_str().unwrap()).collect();
        assert_eq!(ids, ["a", "c"]);
    }

    #[test]
    fn upsert_merges_top_level_and_replaces_nested() {
        let mut list = vec![json!({"uuid": "a", "sessionType": "workspace", "context": {"openedAbsoluteFilePaths": ["/x"], "openedAbsoluteFolderPaths": ["/f"]}})];
        let merged = upsert_session(&mut list, json!({"uuid": "a", "context": {"openedAbsoluteFilePaths": []}})).unwrap();
        assert_eq!(merged["sessionType"], "workspace");
        assert_eq!(merged["context"], json!({"openedAbsoluteFilePaths": []}));
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn upsert_inserts_new_and_rejects_missing_uuid() {
        let mut list = vec![];
        upsert_session(&mut list, json!({"uuid": "n"})).unwrap();
        assert_eq!(list.len(), 1);
        assert!(upsert_session(&mut list, json!({"x": 1})).is_err());
    }
}
