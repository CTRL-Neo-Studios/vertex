//! Single writer for state shared by every window.
//!
//! Webviews never write `sessions.json` / `settings.json` / `trust.json` / a workspace's `.vertex/settings.json`
//! themselves: they call these commands, Rust mutates the in-memory copy under a mutex, persists it, and
//! broadcasts the new value. That removes the read-modify-write races that existed when each window kept its own copy.

use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};

pub const SESSIONS_FILE: &str = "sessions.json";
pub const SETTINGS_FILE: &str = "settings.json";
pub const TRUST_FILE: &str = "trust.json";
pub const EVENT_SESSIONS_CHANGED: &str = "vertex://sessions-changed";
pub const EVENT_SETTINGS_CHANGED: &str = "vertex://settings-changed";
pub const EVENT_TRUST_CHANGED: &str = "vertex://trust-changed";
pub const EVENT_WORKSPACE_SETTINGS_CHANGED: &str = "vertex://workspace-settings-changed";
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
    trust: Mutex<Option<Value>>,
    /// Workspace root → its `.vertex/settings.json` as last read or written, to tell real changes from echoes.
    workspace: Mutex<HashMap<String, Value>>,
    open_queue: Mutex<VecDeque<String>>,
    /// Set once the app starts quitting: windows destroyed from then on keep their session's `open`.
    quitting: AtomicBool,
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
pub(crate) fn write_atomic(path: &Path, value: &Value) -> Result<(), String> {
    write_bytes_atomic(path, &serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
}

/// `write_atomic` for raw bytes: `<path>.tmp` + rename.
pub(crate) fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    std::fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

fn write_json<R: Runtime>(app: &AppHandle<R>, file: &str, value: &Value) -> Result<(), String> {
    write_atomic(&store_path(app, file)?, value)
}

fn session_uuid(v: &Value) -> Option<&str> {
    v.get("uuid").and_then(Value::as_str)
}

/// Recents kept past these counts only while open or pinned; the oldest go first.
const RECENT_WORKSPACES: usize = 50;
const RECENT_FILES: usize = 20;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// `YYYY-MM-DDTHH:MM:SS[.sss]Z` (a JS `Date` as JSON) as Unix milliseconds.
fn iso_millis(s: &str) -> Option<u64> {
    let n = |at: std::ops::Range<usize>| s.get(at)?.parse::<i64>().ok();
    let (y, m, d) = (n(0..4)?, n(5..7)?, n(8..10)?);
    let (hh, mm, ss) = (n(11..13)?, n(14..16)?, n(17..19)?);
    let ms = if s.as_bytes().get(19) == Some(&b'.') { n(20..23).unwrap_or(0) } else { 0 };
    // Days since 1970-01-01 from a civil date (Howard Hinnant's `days_from_civil`).
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + d - 1;
    let days = era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468;
    u64::try_from((((days * 24 + hh) * 60 + mm) * 60 + ss) * 1000 + ms).ok()
}

fn flag(s: &Value, key: &str) -> bool {
    s.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn last_opened(s: &Value) -> u64 {
    s.get("lastOpened").and_then(Value::as_u64).unwrap_or(0)
}

/// Run once, when `sessions.json` is read at launch:
/// - drop entries missing required fields, and all but the first per (type, root path);
/// - migrate old entries (`lastUpdated` becomes `lastOpened`; `trustedDeviceIds` goes);
/// - turn `open` (left set by the last quit or a crash) into `reopen`, for recovery; nothing is open yet;
/// - keep open and pinned ones, and the newest [`RECENT_WORKSPACES`] / [`RECENT_FILES`] of the rest.
///
/// Old entries have no `open`, so the first launch after this reopens nothing.
pub fn sanitize_sessions(list: Vec<Value>) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut list: Vec<Value> = list
        .into_iter()
        .filter(|s| {
            let (Some(uuid), Some(kind), Some(root)) = (
                session_uuid(s),
                s.get("sessionType").and_then(Value::as_str),
                s.get("rootFileOrFolderAbsolutePath")
                    .and_then(Value::as_str),
            ) else {
                return false;
            };
            !uuid.is_empty() && !root.is_empty() && seen.insert(format!("{kind}:{root}"))
        })
        .map(|mut s| {
            let o = s.as_object_mut().unwrap();
            if !o.get("lastOpened").is_some_and(Value::is_u64) {
                let at = o.get("lastUpdated").and_then(Value::as_str).and_then(iso_millis).unwrap_or(0);
                o.insert("lastOpened".into(), at.into());
            }
            o.remove("lastUpdated");
            o.remove("trustedDeviceIds");
            let reopen = o.get("open").and_then(Value::as_bool).unwrap_or(false);
            o.insert("reopen".into(), reopen.into());
            o.insert("open".into(), false.into());
            s
        })
        .collect();
    list.sort_by_key(|s| std::cmp::Reverse(last_opened(s)));
    let mut kept: HashMap<String, usize> = HashMap::new();
    list.retain(|s| {
        if flag(s, "reopen") || flag(s, "pinned") {
            return true;
        }
        let kind = s.get("sessionType").and_then(Value::as_str).unwrap_or_default();
        let count = kept.entry(kind.to_owned()).or_default();
        *count += 1;
        *count <= if kind == "workspace" { RECENT_WORKSPACES } else { RECENT_FILES }
    });
    list
}

/// Insert or merge one session by uuid. Returns the merged session. `open` and `reopen` are Rust's (see
/// [`mark_session_window`]): a webview's copy is ignored, and a new session starts closed.
pub fn upsert_session(list: &mut Vec<Value>, mut session: Value) -> Result<Value, String> {
    let uuid = session_uuid(&session)
        .ok_or("session has no uuid")?
        .to_owned();
    if let Some(o) = session.as_object_mut() {
        o.remove("open");
        o.remove("reopen");
    }
    match list
        .iter_mut()
        .find(|s| session_uuid(s) == Some(uuid.as_str()))
    {
        Some(existing) => {
            merge(existing, session);
            Ok(existing.clone())
        }
        None => {
            session["open"] = false.into();
            list.push(session.clone());
            Ok(session)
        }
    }
}

/// A session window opened (`open`) or closed: its session's `open`, and `lastOpened` = `now`.
/// Returns whether a session matched.
pub fn mark_session_window(list: &mut [Value], uuid: &str, open: bool, now: u64) -> bool {
    let Some(s) = list.iter_mut().find(|s| session_uuid(s) == Some(uuid)) else {
        return false;
    };
    s["open"] = open.into();
    s["lastOpened"] = now.into();
    true
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

/// Trusted workflow folders and files (§11), `{"folders": {path: record}, "files": {path: record}}`. Kept out of
/// settings so a stale settings save from another window can't bring back a revoked entry, and so a workspace's
/// own settings can never touch it. Records are opaque here; the frontend sanitizes them.
const TRUST_KINDS: [&str; 2] = ["folders", "files"];

/// The first trust store: `settings.workflowConfig.trustedWorkspaces` become folders trusted with their
/// subfolders. Per-program (hash) records are dropped; they name no path.
pub fn migrate_trust(settings: &Value) -> Value {
    let folders: Map<String, Value> = settings
        .pointer("/workflowConfig/trustedWorkspaces")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter_map(|(root, r)| {
            let at = r.get("trustedAt")?.as_str()?;
            Some((root.clone(), serde_json::json!({"trustedAt": at, "nested": true})))
        })
        .collect();
    serde_json::json!({"folders": folders, "files": {}})
}

/// Sets one entry (`record` = null removes it), so concurrent changes from different windows never overwrite
/// each other.
pub fn set_trust_entry(trust: &mut Value, kind: &str, path: String, record: Value) -> Result<(), String> {
    if !TRUST_KINDS.contains(&kind) {
        return Err(format!("unknown trust kind {kind:?}"));
    }
    if !std::path::Path::new(&path).is_absolute() {
        return Err(format!("{path:?} is not an absolute path"));
    }
    if !trust.is_object() {
        *trust = serde_json::json!({});
    }
    let list = trust
        .as_object_mut()
        .unwrap()
        .entry(kind)
        .or_insert_with(|| Value::Object(Map::new()));
    if !list.is_object() {
        *list = Value::Object(Map::new());
    }
    let list = list.as_object_mut().unwrap();
    if record.is_null() {
        list.remove(&path);
    } else {
        list.insert(path, record);
    }
    Ok(())
}

fn under(path: &str, base: &str) -> bool {
    path.strip_prefix(base).is_some_and(|rest| rest.is_empty() || rest.starts_with('/'))
}

fn rename_keys(list: &mut Map<String, Value>, from: &str, to: &str) {
    let moved: Vec<String> = list.keys().filter(|k| under(k, from)).cloned().collect();
    for key in moved {
        let record = list.remove(&key).unwrap();
        list.insert(format!("{to}{}", &key[from.len()..]), record);
    }
}

/// A rename or move inside an open workspace: every trusted path at or under `from` moves to the same place
/// under `to`, so trust follows the file (or folder) instead of pointing at nothing. A folder's pinned programs
/// (`files`) move too; one moved out of its folder isn't covered by it any more and is dropped.
pub fn move_trust_paths(trust: &mut Value, from: &str, to: &str) {
    for kind in TRUST_KINDS {
        if let Some(list) = trust.get_mut(kind).and_then(Value::as_object_mut) {
            rename_keys(list, from, to);
        }
    }
    let Some(folders) = trust.get_mut("folders").and_then(Value::as_object_mut) else {
        return;
    };
    for (folder, record) in folders.iter_mut() {
        if let Some(pins) = record.get_mut("files").and_then(Value::as_object_mut) {
            rename_keys(pins, from, to);
            pins.retain(|path, _| under(path, folder) && path != folder);
        }
    }
}

/// An edit made in Vertex: a file trusted with program `from`, on its own or pinned by a folder, now holds `to`.
/// One trusted with another program was changed outside Vertex (sync, git, another app, a workflow), so it's left
/// for the next run to catch.
pub fn follow_trust_edit(trust: &mut Value, path: &str, from: &str, to: &str) {
    let to = Value::String(to.to_owned());
    let record = trust.get_mut("files").and_then(|f| f.get_mut(path));
    if let Some(record) = record.filter(|r| r.get("hash").and_then(Value::as_str) == Some(from)) {
        record["hash"] = to.clone();
    }
    let pins = trust
        .get_mut("folders")
        .and_then(Value::as_object_mut)
        .into_iter()
        .flat_map(|folders| folders.values_mut())
        .filter_map(|r| r.get_mut("files").and_then(|p| p.get_mut(path)));
    for pin in pins.filter(|p| p.as_str() == Some(from)) {
        *pin = to.clone();
    }
}

/// Pins (or, for `None`, unpins) `path`'s program in a trusted folder's record; nothing when the folder isn't trusted.
pub fn pin_trust(trust: &mut Value, folder: &str, path: &str, hash: Option<String>) -> Result<(), String> {
    if !under(path, folder) || path == folder {
        return Err(format!("{path:?} is not in {folder:?}"));
    }
    let Some(record) = trust.get_mut("folders").and_then(|f| f.get_mut(folder)).filter(|r| r.is_object()) else {
        return Ok(());
    };
    let pins = record
        .as_object_mut()
        .unwrap()
        .entry("files")
        .or_insert_with(|| Value::Object(Map::new()));
    if !pins.is_object() {
        *pins = Value::Object(Map::new());
    }
    let pins = pins.as_object_mut().unwrap();
    match hash {
        Some(hash) => pins.insert(path.to_owned(), Value::String(hash)),
        None => pins.remove(path),
    };
    Ok(())
}

const WORKSPACE_SETTINGS: [&str; 2] = [".vertex", "settings.json"];

/// `root` as a workspace folder: absolute and an existing directory.
pub(crate) fn workspace_root(root: &str) -> Result<&Path, String> {
    let root = Path::new(root);
    if !root.is_absolute() || !root.is_dir() {
        return Err(format!("{root:?} is not a workspace folder"));
    }
    Ok(root)
}

fn workspace_settings_file(root: &str) -> Result<PathBuf, String> {
    Ok(WORKSPACE_SETTINGS.iter().fold(workspace_root(root)?.to_path_buf(), |p, part| p.join(part)))
}

/// The file's object; anything else (missing, unreadable, not an object) is no overrides.
fn read_object(path: &Path) -> Value {
    std::fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
        .filter(Value::is_object)
        .unwrap_or_else(|| Value::Object(Map::new()))
}

/// Sets one dotted path (`themeConfig.primaryColor`), or removes it for `null`, dropping objects that end up
/// empty, so the file only ever holds what the workspace changes.
pub fn set_setting_path(target: &mut Value, path: &str, value: Value) -> Result<(), String> {
    fn go(node: &mut Map<String, Value>, keys: &[&str], value: Value) {
        let (key, rest) = keys.split_first().unwrap();
        if rest.is_empty() {
            if value.is_null() {
                node.remove(*key);
            } else {
                node.insert((*key).to_owned(), value);
            }
            return;
        }
        if value.is_null() && !node.get(*key).is_some_and(Value::is_object) {
            return;
        }
        let child = node
            .entry((*key).to_owned())
            .or_insert_with(|| Value::Object(Map::new()));
        if !child.is_object() {
            *child = Value::Object(Map::new());
        }
        let obj = child.as_object_mut().unwrap();
        go(obj, rest, value);
        if obj.is_empty() {
            node.remove(*key);
        }
    }
    let keys: Vec<&str> = path.split('.').collect();
    if keys.iter().any(|k| k.is_empty()) {
        return Err(format!("{path:?} is not a setting path"));
    }
    if !target.is_object() {
        *target = Value::Object(Map::new());
    }
    go(target.as_object_mut().unwrap(), &keys, value);
    Ok(())
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
            app.emit(EVENT_SESSIONS_CHANGED, list.clone())
                .map_err(|e| e.to_string())?;
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
            read_json(app, SETTINGS_FILE)
                .get(SETTINGS_ROOT)
                .cloned()
                .unwrap_or(Value::Null)
        });
        let out = f(settings);
        if persist {
            let mut root = Map::new();
            root.insert(SETTINGS_ROOT.into(), settings.clone());
            write_json(app, SETTINGS_FILE, &Value::Object(root))?;
            app.emit(EVENT_SETTINGS_CHANGED, settings.clone())
                .map_err(|e| e.to_string())?;
        }
        Ok(out)
    }

    fn with_trust<R: Runtime, T>(
        &self,
        app: &AppHandle<R>,
        f: impl FnOnce(&mut Value) -> Result<T, String>,
        persist: bool,
    ) -> Result<T, String> {
        let mut guard = self.trust.lock().map_err(|e| e.to_string())?;
        if guard.is_none() {
            let stored = read_json(app, TRUST_FILE);
            let trust = if stored.is_null() {
                let settings = read_json(app, SETTINGS_FILE);
                let migrated = migrate_trust(settings.get(SETTINGS_ROOT).unwrap_or(&Value::Null));
                // Written now: the settings that held the old records drop them on their next save.
                write_json(app, TRUST_FILE, &migrated)?;
                migrated
            } else {
                stored
            };
            *guard = Some(trust);
        }
        let trust = guard.as_mut().unwrap();
        let before = persist.then(|| trust.clone());
        let out = f(trust)?;
        if before.is_some_and(|b| b != *trust) {
            write_json(app, TRUST_FILE, trust)?;
            app.emit(EVENT_TRUST_CHANGED, trust.clone())
                .map_err(|e| e.to_string())?;
        }
        Ok(out)
    }

    /// Reads (or first creates, migrating old settings) `trust.json`, so it exists from launch.
    pub fn ensure_trust<R: Runtime>(&self, app: &AppHandle<R>) -> Result<(), String> {
        self.with_trust(app, |_| Ok(()), false)
    }

    /// `settings.aiConfig.providers[id].baseURL`, the only origin `ai_request` may call for that provider.
    pub fn ai_provider_base_url<R: Runtime>(&self, app: &AppHandle<R>, id: &str) -> Result<Option<String>, String> {
        self.with_settings(
            app,
            |s| ai_providers(s).and_then(|p| p.get(id).map(|url| url.to_string())),
            false,
        )
    }

    /// From now on, a destroyed session window is the app quitting, not the user closing it.
    pub fn set_quitting(&self) {
        self.quitting.store(true, Ordering::SeqCst);
    }

    /// A `session-{uuid}` window was created (`open`) or destroyed; a destroy while quitting changes nothing,
    /// so the session stays `open` and the next launch reopens it.
    pub fn session_window<R: Runtime>(&self, app: &AppHandle<R>, uuid: &str, open: bool) {
        if !open && self.quitting.load(Ordering::SeqCst) {
            return;
        }
        if let Err(e) = self.with_sessions(app, |l| Ok(mark_session_window(l, uuid, open, now_ms())), true) {
            eprintln!("[state] could not mark session {uuid} {}: {e}", if open { "open" } else { "closed" });
        }
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
pub fn sessions_list<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<Vec<Value>, String> {
    state.with_sessions(&app, |l| Ok(l.clone()), false)
}

#[tauri::command]
pub fn sessions_upsert<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    session: Value,
) -> Result<Value, String> {
    state.with_sessions(&app, |l| upsert_session(l, session), true)
}

#[tauri::command]
pub fn sessions_remove<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    uuid: String,
) -> Result<(), String> {
    state.with_sessions(
        &app,
        |l| {
            l.retain(|s| session_uuid(s) != Some(uuid.as_str()));
            Ok(())
        },
        true,
    )
}

#[tauri::command]
pub fn settings_get<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<Value, String> {
    state.with_settings(&app, |s| s.clone(), false)
}

/// `aiConfig.providers` as id → baseURL; `None` when the settings have no provider list at all.
fn ai_providers(settings: &Value) -> Option<HashMap<&str, &str>> {
    let list = settings.get("aiConfig")?.get("providers")?.as_array()?;
    Some(
        list.iter()
            .filter_map(|p| Some((p.get("id")?.as_str()?, p.get("baseURL").and_then(Value::as_str).unwrap_or(""))))
            .collect(),
    )
}

/// Providers whose saved API key must go: removed, or pointed at another baseURL (a key is bound to its host, so it
/// is never sent somewhere the user didn't save it for). New settings without a provider list remove nothing.
pub fn stale_ai_providers(old: &Value, new: &Value) -> Vec<String> {
    let (Some(old), Some(new)) = (ai_providers(old), ai_providers(new)) else {
        return Vec::new();
    };
    old.into_iter()
        .filter(|(id, url)| new.get(id) != Some(url))
        .map(|(id, _)| id.to_owned())
        .collect()
}

#[tauri::command]
pub fn settings_set<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    settings: Value,
) -> Result<(), String> {
    let stale = state.with_settings(
        &app,
        |s| {
            let stale = stale_ai_providers(s, &settings);
            *s = settings;
            stale
        },
        true,
    )?;
    // Deleted before returning, so an `ai_key_set` issued after this resolves can't be undone by it.
    for id in stale {
        if let Err(e) = crate::ai::delete_key(&id) {
            eprintln!("[ai] could not delete the key of provider {id}: {e}");
        }
    }
    Ok(())
}

#[tauri::command]
pub fn trust_get<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<Value, String> {
    state.with_trust(&app, |t| Ok(t.clone()), false)
}

/// `record: null` revokes. `kind` is `folders` or `files`; `path` must be absolute.
#[tauri::command]
pub fn trust_set<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    kind: String,
    path: String,
    record: Value,
) -> Result<(), String> {
    state.with_trust(&app, |t| set_trust_entry(t, &kind, path, record), true)
}

#[tauri::command]
pub fn trust_clear<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    state.with_trust(
        &app,
        |t| {
            *t = serde_json::json!({"folders": {}, "files": {}});
            Ok(())
        },
        true,
    )
}

/// See `move_trust_paths`. Paths are absolute.
#[tauri::command]
pub fn trust_move<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<(), String> {
    state.with_trust(
        &app,
        |t| {
            move_trust_paths(t, &from, &to);
            Ok(())
        },
        true,
    )
}

/// See `follow_trust_edit`. Compare-and-swap in Rust, so edits in quick succession can't race each other.
#[tauri::command]
pub fn trust_follow_edit<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    path: String,
    from: String,
    to: String,
) -> Result<(), String> {
    state.with_trust(
        &app,
        |t| {
            follow_trust_edit(t, &path, &from, &to);
            Ok(())
        },
        true,
    )
}

/// See `pin_trust`: an empty workflow file in a trusted folder gets its first program in Vertex, or a pin that no
/// longer matches is dropped (`hash: null`).
#[tauri::command]
pub fn trust_pin<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    folder: String,
    path: String,
    hash: Option<String>,
) -> Result<(), String> {
    state.with_trust(&app, |t| pin_trust(t, &folder, &path, hash), true)
}

/// A workspace's overrides, `{}` when it has none. Always read from disk: the file travels with the folder.
#[tauri::command]
pub fn workspace_settings_get(state: tauri::State<'_, AppState>, root: String) -> Result<Value, String> {
    let settings = read_object(&workspace_settings_file(&root)?);
    state
        .workspace
        .lock()
        .map_err(|e| e.to_string())?
        .insert(root, settings.clone());
    Ok(settings)
}

/// Applies `[path, value]` pairs (`null` removes) to the file as it is on disk, then broadcasts it.
#[tauri::command]
pub fn workspace_settings_update<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    root: String,
    updates: Vec<(String, Value)>,
) -> Result<(), String> {
    let file = workspace_settings_file(&root)?;
    let mut cache = state.workspace.lock().map_err(|e| e.to_string())?;
    let before = read_object(&file);
    let mut settings = before.clone();
    for (path, value) in updates {
        set_setting_path(&mut settings, &path, value)?;
    }
    if settings != before {
        std::fs::create_dir_all(file.parent().unwrap()).map_err(|e| e.to_string())?;
        write_atomic(&file, &settings)?;
    }
    cache.insert(root.clone(), settings.clone());
    app.emit(EVENT_WORKSPACE_SETTINGS_CHANGED, serde_json::json!({"root": root, "settings": settings}))
        .map_err(|e| e.to_string())
}

/// The workspace's watcher saw the file change (an external edit, git, sync): re-reads it and broadcasts it when
/// it differs from what Rust last read or wrote.
#[tauri::command]
pub fn workspace_settings_reload<R: Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, AppState>,
    root: String,
) -> Result<(), String> {
    let settings = read_object(&workspace_settings_file(&root)?);
    let mut cache = state.workspace.lock().map_err(|e| e.to_string())?;
    if cache.get(&root) == Some(&settings) {
        return Ok(());
    }
    cache.insert(root.clone(), settings.clone());
    app.emit(EVENT_WORKSPACE_SETTINGS_CHANGED, serde_json::json!({"root": root, "settings": settings}))
        .map_err(|e| e.to_string())
}

/// Returns and clears every path the OS asked us to open (file associations, second launches).
#[tauri::command]
pub fn take_open_requests(state: tauri::State<'_, AppState>) -> Vec<String> {
    state
        .open_queue
        .lock()
        .map(|mut q| q.drain(..).collect())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn open_queue_keeps_every_path_in_order_and_drains_once() {
        let state = AppState::default();
        state
            .open_queue
            .lock()
            .unwrap()
            .extend(["/a.md".to_string(), "/b.md".to_string()]);
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
        let mut list = vec![
            json!({"uuid": "a", "sessionType": "workspace", "context": {"openedAbsoluteFilePaths": ["/x"], "openedAbsoluteFolderPaths": ["/f"]}}),
        ];
        let merged = upsert_session(
            &mut list,
            json!({"uuid": "a", "context": {"openedAbsoluteFilePaths": []}}),
        )
        .unwrap();
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

    #[test]
    fn upsert_ignores_the_webviews_open_flags() {
        let mut list = vec![json!({"uuid": "a", "open": true})];
        upsert_session(&mut list, json!({"uuid": "a", "open": false, "reopen": true, "pinned": true})).unwrap();
        assert_eq!(list[0], json!({"uuid": "a", "open": true, "pinned": true}));
        upsert_session(&mut list, json!({"uuid": "n", "open": true})).unwrap();
        assert_eq!(list[1]["open"], false);
    }

    #[test]
    fn sanitize_turns_open_into_reopen_and_migrates_old_entries() {
        let ws = |uuid: &str, extra: Value| {
            let mut s = json!({"uuid": uuid, "sessionType": "workspace", "rootFileOrFolderAbsolutePath": format!("/{uuid}")});
            s.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
            s
        };
        let out = sanitize_sessions(vec![
            ws("old", json!({"lastUpdated": "2026-11-05T10:20:30.456Z", "trustedDeviceIds": []})),
            ws("quit", json!({"open": true, "lastOpened": 5})),
        ]);
        assert_eq!(out[0], ws("old", json!({"lastOpened": 1_793_874_030_456u64, "open": false, "reopen": false})));
        assert_eq!(out[1], ws("quit", json!({"lastOpened": 5, "open": false, "reopen": true})));
    }

    #[test]
    fn sanitize_caps_recents_but_keeps_reopened_and_pinned() {
        let mut list: Vec<Value> = (0..25)
            .map(|i| json!({"uuid": format!("f{i}"), "sessionType": "singlespace", "rootFileOrFolderAbsolutePath": format!("/f{i}.md"), "lastOpened": i}))
            .collect();
        list[0]["pinned"] = true.into();
        list[1]["open"] = true.into();
        let out = sanitize_sessions(list);
        let ids: Vec<_> = out.iter().map(|s| s["uuid"].as_str().unwrap()).collect();
        // Newest first: f24..f5 (20), then the old pinned and reopened ones.
        assert_eq!(ids.len(), 22);
        assert_eq!((ids[0], ids[19]), ("f24", "f5"));
        assert!(ids.contains(&"f0") && ids.contains(&"f1") && !ids.contains(&"f2"));
    }

    #[test]
    fn mark_session_window_sets_open_and_time() {
        let mut list = vec![json!({"uuid": "a", "open": false, "lastOpened": 1})];
        assert!(mark_session_window(&mut list, "a", true, 9));
        assert_eq!(list[0], json!({"uuid": "a", "open": true, "lastOpened": 9}));
        assert!(!mark_session_window(&mut list, "b", true, 9));
    }

    #[test]
    fn migrate_trust_keeps_workspaces_as_nested_folders_and_drops_programs() {
        let settings = json!({"workflowConfig": {
            "trustedPrograms": {"ab": {"name": "x", "trustedAt": "t0"}},
            "trustedWorkspaces": {"/v": {"trustedAt": "t1"}, "/bad": {}},
        }});
        assert_eq!(
            migrate_trust(&settings),
            json!({"folders": {"/v": {"trustedAt": "t1", "nested": true}}, "files": {}})
        );
        assert_eq!(migrate_trust(&Value::Null), json!({"folders": {}, "files": {}}));
    }

    #[test]
    fn set_trust_entry_adds_and_removes_one_entry() {
        let mut trust = json!({"folders": {"/a": {"trustedAt": "t"}}, "files": {}});
        set_trust_entry(&mut trust, "files", "/a/x.workflow".into(), json!({"trustedAt": "t"})).unwrap();
        set_trust_entry(&mut trust, "folders", "/a".into(), Value::Null).unwrap();
        assert_eq!(trust, json!({"folders": {}, "files": {"/a/x.workflow": {"trustedAt": "t"}}}));
        assert!(set_trust_entry(&mut trust, "programs", "/a".into(), json!({})).is_err());
        assert!(set_trust_entry(&mut trust, "files", "a/x".into(), json!({})).is_err());
    }

    #[test]
    fn move_trust_paths_moves_the_entry_and_everything_under_it_only() {
        let mut trust = json!({
            "folders": {"/v/A": {"n": 1}, "/v/A/B": {"n": 2}, "/v/AB": {"n": 3}},
            "files": {"/v/A/x.workflow": {"n": 4}},
        });
        move_trust_paths(&mut trust, "/v/A", "/v/C");
        assert_eq!(trust, json!({
            "folders": {"/v/C": {"n": 1}, "/v/C/B": {"n": 2}, "/v/AB": {"n": 3}},
            "files": {"/v/C/x.workflow": {"n": 4}},
        }));
    }

    #[test]
    fn follow_trust_edit_swaps_only_from_the_trusted_program() {
        let mut trust = json!({"files": {"/v/x.workflow": {"trustedAt": "t", "hash": "h1"}}});
        follow_trust_edit(&mut trust, "/v/x.workflow", "h0", "h9");
        assert_eq!(trust["files"]["/v/x.workflow"]["hash"], "h1");
        follow_trust_edit(&mut trust, "/v/x.workflow", "h1", "h2");
        assert_eq!(trust["files"]["/v/x.workflow"], json!({"trustedAt": "t", "hash": "h2"}));
        follow_trust_edit(&mut trust, "/v/missing.workflow", "h1", "h2");
        assert_eq!(trust["files"].as_object().unwrap().len(), 1);
    }

    #[test]
    fn set_setting_path_sets_removes_and_prunes_empty_objects() {
        let mut s = json!({});
        set_setting_path(&mut s, "themeConfig.primaryColor", json!("red")).unwrap();
        set_setting_path(&mut s, "viewConfig.fileTree.showFoldArrows", json!(true)).unwrap();
        assert_eq!(s, json!({"themeConfig": {"primaryColor": "red"}, "viewConfig": {"fileTree": {"showFoldArrows": true}}}));
        set_setting_path(&mut s, "viewConfig.fileTree.showFoldArrows", Value::Null).unwrap();
        set_setting_path(&mut s, "missing.key", Value::Null).unwrap();
        assert_eq!(s, json!({"themeConfig": {"primaryColor": "red"}}));
        assert!(set_setting_path(&mut s, "a..b", json!(1)).is_err());
    }

    #[test]
    fn folder_pins_follow_edits_and_moves_and_drop_when_moved_out() {
        let mut trust = json!({"folders": {"/v/A": {"trustedAt": "t", "nested": true, "files": {"/v/A/x.workflow": "h1"}}}, "files": {}});
        pin_trust(&mut trust, "/v/A", "/v/A/B/new.workflow", Some("n1".into())).unwrap();
        pin_trust(&mut trust, "/v/Other", "/v/Other/y.workflow", Some("h".into())).unwrap();
        assert!(pin_trust(&mut trust, "/v/A", "/v/AB/z.workflow", Some("h".into())).is_err());
        follow_trust_edit(&mut trust, "/v/A/x.workflow", "h0", "h9");
        follow_trust_edit(&mut trust, "/v/A/B/new.workflow", "n1", "n2");
        assert_eq!(trust["folders"]["/v/A"]["files"], json!({"/v/A/x.workflow": "h1", "/v/A/B/new.workflow": "n2"}));
        move_trust_paths(&mut trust, "/v/A/B", "/v/A/C");
        move_trust_paths(&mut trust, "/v/A/x.workflow", "/v/elsewhere.workflow");
        assert_eq!(trust["folders"], json!({"/v/A": {"trustedAt": "t", "nested": true, "files": {"/v/A/C/new.workflow": "n2"}}}));
        move_trust_paths(&mut trust, "/v/A", "/v/Z");
        assert_eq!(trust["folders"]["/v/Z"]["files"], json!({"/v/Z/C/new.workflow": "n2"}));
        pin_trust(&mut trust, "/v/Z", "/v/Z/C/new.workflow", None).unwrap();
        assert_eq!(trust["folders"]["/v/Z"]["files"], json!({}));
    }

    #[test]
    fn ai_keys_go_with_removed_or_moved_providers() {
        let cfg = |providers: Value| json!({"aiConfig": {"providers": providers}});
        let old = cfg(json!([
            {"id": "a", "baseURL": "https://a.dev/v1"},
            {"id": "b", "baseURL": "https://b.dev/v1"},
            {"id": "c", "baseURL": "https://c.dev/v1"}
        ]));
        let new = cfg(json!([
            {"id": "a", "baseURL": "https://a.dev/v1", "name": "renamed"},
            {"id": "b", "baseURL": "https://evil.dev/v1"},
            {"id": "d", "baseURL": "https://d.dev/v1"}
        ]));
        let mut stale = stale_ai_providers(&old, &new);
        stale.sort();
        assert_eq!(stale, ["b", "c"]);
        assert!(stale_ai_providers(&old, &json!({})).is_empty());
        assert_eq!(stale_ai_providers(&old, &cfg(json!([]))).len(), 3);
    }
}
