//! AI chat store (see `app/utils/chatClient.ts`). A workspace's chats live either in the app data dir as plain JSON
//! (`<app_data>/chats/<workspaceId>/`) or in the workspace (`<root>/.vertex/chats/`), age-encrypted to a per-workspace
//! X25519 identity. That identity sits in `key.age`, encrypted with the user's password (scrypt), and once unlocked it
//! stays in memory here (optionally in the OS keychain); it never reaches the webview.

use crate::ai::{blocking, KEYRING_SERVICE};
use crate::state::{workspace_root, write_atomic, write_bytes_atomic};
use age::secrecy::{ExposeSecret, SecretString};
use age::{scrypt, x25519};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, Runtime};

const WORKSPACE_META: [&str; 2] = [".vertex", "workspace.json"];
const WORKSPACE_CHATS: [&str; 2] = [".vertex", "chats"];
const KEY_FILE: &str = "key.age";
const FOLDERS: &str = "folders";
const EXT: &str = ".chat";
const AGE_MAGIC: &[u8] = b"age-encryption.org/";
const MAX_FOLDER_LEN: usize = 512;
const SEARCH_LIMIT: usize = 50;
/// Characters of context kept before and after a search match.
const SNIPPET_BEFORE: usize = 40;
const SNIPPET_AFTER: usize = 80;

type Keys = HashMap<String, x25519::Identity>;

/// Unlocked identities by workspace id. The mutex is held for a whole command, so it also serialises every chat
/// file operation (and the creation of `workspace.json`).
/// ponytail: one lock for all workspaces; per-workspace locks if chat I/O ever contends.
#[derive(Default)]
pub struct ChatVaults(Mutex<Keys>);

#[derive(Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Storage {
    App,
    Workspace,
}

#[derive(Serialize, PartialEq, Debug)]
#[serde(rename_all = "lowercase")]
pub enum VaultState {
    None,
    Locked,
    Unlocked,
    Open,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatSummary {
    id: String,
    title: String,
    folder: String,
    created: i64,
    updated: i64,
}

#[derive(Serialize, Deserialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChatFile {
    version: u8,
    #[serde(flatten)]
    summary: ChatSummary,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    profile_id: Option<String>,
    messages: Value,
}

#[derive(Serialize, PartialEq, Debug)]
pub struct ChatIndex {
    chats: Vec<ChatSummary>,
    folders: Vec<String>,
}

/// A chat whose messages contain the search text, with the text around the first match.
#[derive(Serialize, PartialEq, Debug)]
pub struct ChatHit {
    id: String,
    snippet: String,
}

/// The `text` parts of every message (`messages` is the frontend's opaque UIMessage list).
fn message_texts(messages: &Value) -> impl Iterator<Item = &str> {
    messages.as_array().into_iter().flatten()
        .filter_map(|m| m.get("parts")?.as_array())
        .flatten()
        .filter(|p| p.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|p| p.get("text")?.as_str())
}

/// `text` around the first case-insensitive match of `needle` (already lowercased), on one line; `None` without one.
/// Counts characters, not bytes, so the cut never splits one.
fn snippet(text: &str, needle: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let at = lower[..lower.find(needle)?].chars().count();
    let chars: Vec<char> = text.chars().collect();
    let start = at.saturating_sub(SNIPPET_BEFORE);
    let end = (at + needle.chars().count() + SNIPPET_AFTER).min(chars.len());
    let body: String = chars[start.min(end)..end].iter().collect();
    let body = body.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(format!("{}{body}{}", if start > 0 { "…" } else { "" }, if end < chars.len() { "…" } else { "" }))
}

fn join(root: &Path, parts: &[&str]) -> PathBuf {
    parts.iter().fold(root.to_path_buf(), |p, part| p.join(part))
}

fn check_id(id: &str) -> Result<(), String> {
    let ok = (1..=64).contains(&id.len())
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
        && id != FOLDERS;
    ok.then_some(()).ok_or_else(|| format!("invalid chat id {id:?}"))
}

/// A non-empty `A/B` path: no empty, `.` or `..` segments, no control characters, at most 512 bytes.
fn check_folder(path: &str) -> Result<(), String> {
    let ok = path.len() <= MAX_FOLDER_LEN
        && !path.chars().any(char::is_control)
        && path.split('/').all(|s| !s.is_empty() && s != "." && s != "..");
    ok.then_some(()).ok_or_else(|| format!("invalid folder {path:?}"))
}

/// A chat's folder: `''` (top level) or a folder path.
fn check_chat_folder(path: &str) -> Result<(), String> {
    if path.is_empty() { Ok(()) } else { check_folder(path) }
}

/// `path` is `base` or inside it; returns the rest (`''` or `/…`).
fn under<'a>(path: &'a str, base: &str) -> Option<&'a str> {
    path.strip_prefix(base).filter(|rest| rest.is_empty() || rest.starts_with('/'))
}

fn not_found_ok<T: Default>(r: std::io::Result<T>) -> Result<T, String> {
    match r {
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(T::default()),
        r => r.map_err(|e| e.to_string()),
    }
}

/// Gets or creates the workspace's id in `.vertex/workspace.json`, keeping any other keys in the file.
fn workspace_id(root: &Path) -> Result<String, String> {
    let path = join(root, &WORKSPACE_META);
    let bytes = not_found_ok(fs::read(&path))?;
    let mut meta: Map<String, Value> = if bytes.is_empty() {
        Map::new()
    } else {
        serde_json::from_slice(&bytes).map_err(|e| format!("{path:?}: {e}"))?
    };
    if let Some(id) = meta.get("id").and_then(Value::as_str).filter(|id| check_id(id).is_ok()) {
        return Ok(id.to_owned());
    }
    let id = uuid::Uuid::new_v4().to_string();
    meta.insert("id".into(), Value::String(id.clone()));
    fs::create_dir_all(path.parent().unwrap_or(root)).map_err(|e| e.to_string())?;
    write_atomic(&path, &Value::Object(meta))?;
    Ok(id)
}

fn key_path(root: &Path) -> PathBuf {
    join(root, &WORKSPACE_CHATS).join(KEY_FILE)
}

fn keychain(id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, &format!("chat-key:{id}"))
        .map_err(|e| format!("system keychain unavailable: {e}"))
}

fn keychain_load(id: &str) -> Option<x25519::Identity> {
    let stored = keychain(id).and_then(|entry| match entry.get_password() {
        Ok(key) => Ok(Some(key)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("system keychain unavailable: {e}")),
    });
    match stored {
        Ok(key) => key?.parse().map_err(|e| log::warn!("[chats] bad keychain key for {id}: {e}")).ok(),
        Err(e) => {
            log::warn!("[chats] keychain read for {id}: {e}");
            None
        }
    }
}

fn keychain_save(id: &str, key: &x25519::Identity) -> Result<(), String> {
    keychain(id)?
        .set_password(key.to_string().expose_secret())
        .map_err(|e| format!("system keychain unavailable: {e}"))
}

fn keychain_delete(id: &str) -> Result<(), String> {
    match keychain(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("system keychain unavailable: {e}")),
    }
}

/// The workspace's identity from memory, else from the keychain (then cached).
fn identity<'a>(keys: &'a mut Keys, id: &str) -> Option<&'a x25519::Identity> {
    if !keys.contains_key(id) {
        if let Some(key) = keychain_load(id) {
            keys.insert(id.to_owned(), key);
        }
    }
    keys.get(id)
}

fn vault_state(keys: &mut Keys, root: &Path, storage: Storage) -> Result<VaultState, String> {
    if storage == Storage::App {
        return Ok(VaultState::Open);
    }
    if !key_path(root).exists() {
        return Ok(VaultState::None);
    }
    let id = workspace_id(root)?;
    Ok(if identity(keys, &id).is_some() { VaultState::Unlocked } else { VaultState::Locked })
}

fn remember_key(keys: &mut Keys, id: String, key: x25519::Identity, remember: bool) -> Result<(), String> {
    let saved = if remember { keychain_save(&id, &key) } else { Ok(()) };
    keys.insert(id, key);
    saved
}

fn vault_create(keys: &mut Keys, root: &Path, password: String, remember: bool) -> Result<(), String> {
    let path = key_path(root);
    if path.exists() {
        return Err("exists".into());
    }
    let id = workspace_id(root)?;
    let key = x25519::Identity::generate();
    let recipient = scrypt::Recipient::new(SecretString::from(password));
    let sealed = age::encrypt(&recipient, key.to_string().expose_secret().as_bytes()).map_err(|e| e.to_string())?;
    fs::create_dir_all(path.parent().unwrap_or(root)).map_err(|e| e.to_string())?;
    write_bytes_atomic(&path, &sealed)?;
    remember_key(keys, id, key, remember)
}

fn vault_unlock(keys: &mut Keys, root: &Path, password: String, remember: bool) -> Result<(), String> {
    let sealed = fs::read(key_path(root)).map_err(|e| e.to_string())?;
    let id = workspace_id(root)?;
    let plain = age::decrypt(&scrypt::Identity::new(SecretString::from(password)), &sealed).map_err(|e| match e {
        age::DecryptError::DecryptionFailed => "wrong-password".to_owned(),
        e => e.to_string(),
    })?;
    let key = std::str::from_utf8(&plain)
        .map_err(|e| e.to_string())?
        .trim()
        .parse::<x25519::Identity>()
        .map_err(|e| format!("{KEY_FILE}: {e}"))?;
    remember_key(keys, id, key, remember)
}

fn vault_lock(keys: &mut Keys, root: &Path) -> Result<(), String> {
    let id = workspace_id(root)?;
    keys.remove(&id);
    keychain_delete(&id)
}

/// One resolved store: its directory and, for workspace storage, the identity its files are encrypted to.
struct Store<'a> {
    dir: PathBuf,
    key: Option<&'a x25519::Identity>,
}

fn open<'a>(keys: &'a mut Keys, app_data: &Path, root: &Path, storage: Storage) -> Result<Store<'a>, String> {
    let id = workspace_id(root)?;
    Ok(match storage {
        Storage::App => Store { dir: app_data.join("chats").join(id), key: None },
        Storage::Workspace => Store {
            dir: join(root, &WORKSPACE_CHATS),
            key: Some(identity(keys, &id).ok_or("locked")?),
        },
    })
}

impl Store<'_> {
    fn file(&self, name: &str) -> PathBuf {
        self.dir.join(format!("{name}{EXT}"))
    }

    fn decode<T: DeserializeOwned>(&self, bytes: &[u8]) -> Result<T, String> {
        if bytes.starts_with(AGE_MAGIC) {
            let key = self.key.ok_or("encrypted chat outside workspace storage")?;
            let plain = age::decrypt(key, bytes).map_err(|e| e.to_string())?;
            serde_json::from_slice(&plain).map_err(|e| e.to_string())
        } else {
            serde_json::from_slice(bytes).map_err(|e| e.to_string())
        }
    }

    fn write<T: Serialize>(&self, name: &str, value: &T) -> Result<(), String> {
        fs::create_dir_all(&self.dir).map_err(|e| e.to_string())?;
        let path = self.file(name);
        match self.key {
            None => write_atomic(&path, &serde_json::to_value(value).map_err(|e| e.to_string())?),
            Some(key) => {
                let json = serde_json::to_vec(value).map_err(|e| e.to_string())?;
                write_bytes_atomic(&path, &age::encrypt(&key.to_public(), &json).map_err(|e| e.to_string())?)
            }
        }
    }

    /// Every `<id>.chat` in the store.
    fn ids(&self) -> Result<Vec<String>, String> {
        let Some(entries) = not_found_ok(fs::read_dir(&self.dir).map(Some))? else {
            return Ok(vec![]);
        };
        Ok(entries
            .flatten()
            .filter_map(|e| e.file_name().to_str()?.strip_suffix(EXT).map(str::to_owned))
            .filter(|id| check_id(id).is_ok())
            .collect())
    }

    /// A chat as `T` (`ChatFile` or just its `ChatSummary`), its id taken from the file name.
    fn load<T: DeserializeOwned>(&self, id: &str) -> Result<T, String> {
        self.decode(&fs::read(self.file(id)).map_err(|e| e.to_string())?)
    }

    /// Every chat that can be read; the others are logged and skipped.
    fn all<T: DeserializeOwned>(&self) -> Result<Vec<(String, T)>, String> {
        Ok(self
            .ids()?
            .into_iter()
            .filter_map(|id| match self.load(&id) {
                Ok(chat) => Some((id, chat)),
                Err(e) => {
                    log::warn!("[chats] skipping {:?}: {e}", self.file(&id));
                    None
                }
            })
            .collect())
    }

    fn folders(&self) -> Result<Vec<String>, String> {
        let bytes = not_found_ok(fs::read(self.file(FOLDERS)))?;
        if bytes.is_empty() { Ok(vec![]) } else { self.decode(&bytes) }
    }

    fn index(&self) -> Result<ChatIndex, String> {
        let chats: Vec<ChatSummary> = self
            .all::<ChatSummary>()?
            .into_iter()
            .map(|(id, summary)| ChatSummary { id, ..summary })
            .collect();
        let mut folders = BTreeSet::new();
        for folder in self.folders()?.iter().chain(chats.iter().map(|c| &c.folder)) {
            let mut end = folder.len();
            while end > 0 {
                folders.insert(folder[..end].to_owned());
                end = folder[..end].rfind('/').unwrap_or(0);
            }
        }
        Ok(ChatIndex { chats, folders: folders.into_iter().collect() })
    }

    fn read(&self, id: &str) -> Result<ChatFile, String> {
        check_id(id)?;
        let chat: ChatFile = self.load(id)?;
        Ok(ChatFile { summary: ChatSummary { id: id.to_owned(), ..chat.summary }, ..chat })
    }

    fn write_chat(&self, chat: &ChatFile) -> Result<(), String> {
        check_id(&chat.summary.id)?;
        check_chat_folder(&chat.summary.folder)?;
        self.write(&chat.summary.id, chat)
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        check_id(id)?;
        not_found_ok(fs::remove_file(self.file(id)))
    }

    /// Chats whose message text contains `query` (case-insensitive), newest first, at most `SEARCH_LIMIT`.
    fn search(&self, query: &str) -> Result<Vec<ChatHit>, String> {
        let needle = query.trim().to_lowercase();
        if needle.is_empty() {
            return Ok(vec![]);
        }
        let mut hits: Vec<(i64, ChatHit)> = self
            .all::<ChatFile>()?
            .into_iter()
            .filter_map(|(id, chat)| {
                let snippet = message_texts(&chat.messages).find_map(|t| snippet(t, &needle))?;
                Some((chat.summary.updated, ChatHit { id, snippet }))
            })
            .collect();
        hits.sort_by(|a, b| b.0.cmp(&a.0));
        Ok(hits.into_iter().take(SEARCH_LIMIT).map(|(_, hit)| hit).collect())
    }

    fn set_folders(&self, folders: Vec<String>) -> Result<(), String> {
        folders.iter().try_for_each(|f| check_folder(f))?;
        self.write(FOLDERS, &folders.into_iter().collect::<BTreeSet<_>>())
    }

    fn rename_folder(&self, from: &str, to: &str) -> Result<(), String> {
        check_folder(from)?;
        check_folder(to)?;
        if from == to {
            return Ok(());
        }
        let moved = |f: &str| under(f, from).map(|rest| format!("{to}{rest}"));
        for (id, mut chat) in self.all::<ChatFile>()? {
            if let Some(folder) = moved(&chat.summary.folder) {
                chat.summary = ChatSummary { id, folder, ..chat.summary };
                self.write_chat(&chat)?;
            }
        }
        let folders = self.folders()?.into_iter().map(|f| moved(&f).unwrap_or(f)).collect();
        self.set_folders(folders)
    }

    fn delete_folder(&self, path: &str) -> Result<(), String> {
        check_folder(path)?;
        for (id, chat) in self.all::<ChatSummary>()? {
            if under(&chat.folder, path).is_some() {
                self.delete(&id)?;
            }
        }
        let folders = self.folders()?.into_iter().filter(|f| under(f, path).is_none()).collect();
        self.set_folders(folders)
    }
}

/// Runs `f` off the async runtime with the vault lock held.
async fn run<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    root: String,
    f: impl FnOnce(&mut Keys, &Path, &Path) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    blocking(move || {
        let root = workspace_root(&root)?;
        let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
        let vaults = app.state::<ChatVaults>();
        let mut keys = vaults.0.lock().map_err(|e| e.to_string())?;
        f(&mut keys, &app_data, root)
    })
    .await
}

/// `run` with the store opened.
async fn with_store<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    root: String,
    storage: Storage,
    f: impl FnOnce(&Store<'_>) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    run(app, root, move |keys, app_data, root| f(&open(keys, app_data, root, storage)?)).await
}

#[tauri::command]
pub async fn chat_vault_state<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage) -> Result<VaultState, String> {
    run(app, root, move |keys, _, root| vault_state(keys, root, storage)).await
}

#[tauri::command]
pub async fn chat_vault_create<R: Runtime>(app: AppHandle<R>, root: String, password: String, remember: bool) -> Result<(), String> {
    run(app, root, move |keys, _, root| vault_create(keys, root, password, remember)).await
}

#[tauri::command]
pub async fn chat_vault_unlock<R: Runtime>(app: AppHandle<R>, root: String, password: String, remember: bool) -> Result<(), String> {
    run(app, root, move |keys, _, root| vault_unlock(keys, root, password, remember)).await
}

#[tauri::command]
pub async fn chat_vault_lock<R: Runtime>(app: AppHandle<R>, root: String) -> Result<(), String> {
    run(app, root, |keys, _, root| vault_lock(keys, root)).await
}

#[tauri::command]
pub async fn chat_index<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage) -> Result<ChatIndex, String> {
    with_store(app, root, storage, |s| s.index()).await
}

#[tauri::command]
pub async fn chat_read<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, id: String) -> Result<ChatFile, String> {
    with_store(app, root, storage, move |s| s.read(&id)).await
}

#[tauri::command]
pub async fn chat_write<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, chat: ChatFile) -> Result<(), String> {
    with_store(app, root, storage, move |s| s.write_chat(&chat)).await
}

#[tauri::command]
pub async fn chat_delete<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, id: String) -> Result<(), String> {
    with_store(app, root, storage, move |s| s.delete(&id)).await
}

#[tauri::command]
pub async fn chat_folders_set<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, folders: Vec<String>) -> Result<(), String> {
    with_store(app, root, storage, move |s| s.set_folders(folders)).await
}

#[tauri::command]
pub async fn chat_folder_rename<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, from: String, to: String) -> Result<(), String> {
    with_store(app, root, storage, move |s| s.rename_folder(&from, &to)).await
}

#[tauri::command]
pub async fn chat_folder_delete<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, path: String) -> Result<(), String> {
    with_store(app, root, storage, move |s| s.delete_folder(&path)).await
}

#[tauri::command]
pub async fn chat_search<R: Runtime>(app: AppHandle<R>, root: String, storage: Storage, query: String) -> Result<Vec<ChatHit>, String> {
    with_store(app, root, storage, move |s| s.search(&query)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh `(workspace root, app data)` pair under the temp dir.
    fn dirs() -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("vertex-chats-{}", uuid::Uuid::new_v4()));
        let (root, data) = (base.join("ws"), base.join("data"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&data).unwrap();
        (root, data)
    }

    fn chat(id: &str, folder: &str) -> ChatFile {
        ChatFile {
            version: 1,
            summary: ChatSummary { id: id.into(), title: format!("t-{id}"), folder: folder.into(), created: 1, updated: 2 },
            profile_id: None,
            messages: serde_json::json!([{"id": "m1", "role": "user", "parts": [{"type": "text", "text": "hi"}]}]),
        }
    }

    fn ids(store: &Store) -> Vec<String> {
        let mut ids: Vec<String> = store.index().unwrap().chats.into_iter().map(|c| c.id).collect();
        ids.sort();
        ids
    }

    #[test]
    fn app_round_trip_is_plain_json() {
        let (root, data) = dirs();
        let mut keys = Keys::new();
        assert_eq!(vault_state(&mut keys, &root, Storage::App).unwrap(), VaultState::Open);
        let store = open(&mut keys, &data, &root, Storage::App).unwrap();
        let c = ChatFile { profile_id: Some("p".into()), ..chat("a1", "A/B") };
        store.write_chat(&c).unwrap();
        assert_eq!(store.read("a1").unwrap(), c);

        let id = workspace_id(&root).unwrap();
        let raw: Value = serde_json::from_slice(&fs::read(data.join("chats").join(&id).join("a1.chat")).unwrap()).unwrap();
        assert_eq!(raw["profileId"], "p");
        assert_eq!(raw["folder"], "A/B");

        store.set_folders(vec!["Z".into()]).unwrap();
        let index = store.index().unwrap();
        assert_eq!(index.chats, vec![c.summary.clone()]);
        assert_eq!(index.folders, vec!["A", "A/B", "Z"]);

        store.delete("a1").unwrap();
        store.delete("a1").unwrap();
        assert!(store.read("a1").is_err());
    }

    #[test]
    fn search_matches_message_text_case_insensitively_newest_first() {
        let (root, data) = dirs();
        let mut keys = Keys::new();
        let store = open(&mut keys, &data, &root, Storage::App).unwrap();
        let with = |id: &str, updated: i64, text: &str| ChatFile {
            summary: ChatSummary { updated, ..chat(id, "").summary },
            messages: serde_json::json!([{"id": "m", "role": "assistant", "parts": [{"type": "reasoning", "text": "dragon"}, {"type": "text", "text": text}]}]),
            ..chat(id, "")
        };
        store.write_chat(&with("old", 1, "The Dragon sleeps.")).unwrap();
        store.write_chat(&with("new", 5, &format!("{}then the dragon woke{}", "x ".repeat(40), " y".repeat(60)))).unwrap();
        store.write_chat(&with("none", 9, "nothing here")).unwrap();

        let hits = store.search("  DRAGON ").unwrap();
        assert_eq!(hits.iter().map(|h| h.id.as_str()).collect::<Vec<_>>(), ["new", "old"]);
        assert_eq!(hits[1].snippet, "The Dragon sleeps.");
        assert!(hits[0].snippet.starts_with('…') && hits[0].snippet.ends_with('…') && hits[0].snippet.contains("the dragon woke"));
        // Only text parts count: every chat above has "dragon" in a reasoning part, yet "none" isn't a hit.
        store.write_chat(&ChatFile { messages: serde_json::json!([{"parts": [{"type": "reasoning", "text": "unicorn"}]}]), ..chat("r", "") }).unwrap();
        assert!(store.search("unicorn").unwrap().is_empty());
        assert!(store.search("   ").unwrap().is_empty());
        // Multi-byte text around the match stays whole.
        assert_eq!(snippet("café ☕ dragon", "dragon").as_deref(), Some("café ☕ dragon"));
    }

    #[test]
    fn workspace_vault_round_trip_wrong_password_and_locked() {
        let (root, data) = dirs();
        let mut keys = Keys::new();
        assert_eq!(vault_state(&mut keys, &root, Storage::Workspace).unwrap(), VaultState::None);
        assert_eq!(open(&mut keys, &data, &root, Storage::Workspace).err().as_deref(), Some("locked"));

        vault_create(&mut keys, &root, "pw".into(), false).unwrap();
        assert_eq!(vault_create(&mut keys, &root, "pw".into(), false).err().as_deref(), Some("exists"));
        assert_eq!(vault_state(&mut keys, &root, Storage::Workspace).unwrap(), VaultState::Unlocked);
        {
            let store = open(&mut keys, &data, &root, Storage::Workspace).unwrap();
            store.write_chat(&chat("w1", "")).unwrap();
            store.set_folders(vec!["F".into()]).unwrap();
        }
        let dir = join(&root, &WORKSPACE_CHATS);
        for file in ["key.age", "w1.chat", "folders.chat"] {
            assert!(fs::read(dir.join(file)).unwrap().starts_with(AGE_MAGIC), "{file} not encrypted");
        }

        // A restart: nothing in memory.
        let mut keys = Keys::new();
        assert_eq!(vault_state(&mut keys, &root, Storage::Workspace).unwrap(), VaultState::Locked);
        assert_eq!(open(&mut keys, &data, &root, Storage::Workspace).err().as_deref(), Some("locked"));
        assert_eq!(vault_unlock(&mut keys, &root, "nope".into(), false).err().as_deref(), Some("wrong-password"));
        vault_unlock(&mut keys, &root, "pw".into(), false).unwrap();

        let store = open(&mut keys, &data, &root, Storage::Workspace).unwrap();
        assert_eq!(store.read("w1").unwrap(), chat("w1", ""));
        assert_eq!(store.index().unwrap().folders, vec!["F"]);
        // The two storages are separate.
        assert!(open(&mut keys, &data, &root, Storage::App).unwrap().index().unwrap().chats.is_empty());
    }

    #[test]
    fn validation() {
        for bad in ["", "../x", "a/b", "a.chat", "folders", "x".repeat(65).as_str()] {
            assert!(check_id(bad).is_err(), "{bad:?}");
        }
        assert!(check_id("0b6c-A9").is_ok());
        for bad in ["", "../x", "a//b", "/a", "a/", "a/./b", "a\nb", "x".repeat(513).as_str()] {
            assert!(check_folder(bad).is_err(), "{bad:?}");
        }
        assert!(check_folder("A/B c/é").is_ok());
        assert!(check_chat_folder("").is_ok());

        let (root, data) = dirs();
        let mut keys = Keys::new();
        let store = open(&mut keys, &data, &root, Storage::App).unwrap();
        assert!(store.write_chat(&chat("ok", "/a")).is_err());
        assert!(store.read("../x").is_err());
        assert!(store.set_folders(vec!["a//b".into()]).is_err());
        assert!(store.rename_folder("a", "/a").is_err());
    }

    #[test]
    fn folder_rename_and_delete() {
        let (root, data) = dirs();
        let mut keys = Keys::new();
        let store = open(&mut keys, &data, &root, Storage::App).unwrap();
        for (id, folder) in [("c1", "A"), ("c2", "A/B"), ("c3", "AB"), ("c4", "")] {
            store.write_chat(&chat(id, folder)).unwrap();
        }
        store.set_folders(vec!["A/Empty".into(), "AB".into(), "Other".into()]).unwrap();

        store.rename_folder("A", "X/Y").unwrap();
        let folder = |id: &str| store.read(id).unwrap().summary.folder;
        assert_eq!([folder("c1"), folder("c2"), folder("c3"), folder("c4")], ["X/Y", "X/Y/B", "AB", ""]);
        assert_eq!(store.read("c2").unwrap().messages, chat("c2", "").messages);
        assert_eq!(store.index().unwrap().folders, vec!["AB", "Other", "X", "X/Y", "X/Y/B", "X/Y/Empty"]);

        store.delete_folder("X").unwrap();
        assert_eq!(ids(&store), vec!["c3", "c4"]);
        assert_eq!(store.index().unwrap().folders, vec!["AB", "Other"]);
    }

    #[test]
    fn workspace_meta_keeps_unknown_keys() {
        let (root, _) = dirs();
        let path = join(&root, &WORKSPACE_META);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"name": "mine", "nested": {"a": 1}}"#).unwrap();

        let id = workspace_id(&root).unwrap();
        assert!(uuid::Uuid::parse_str(&id).is_ok());
        assert_eq!(workspace_id(&root).unwrap(), id);
        let meta: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_eq!(meta, serde_json::json!({"id": id, "name": "mine", "nested": {"a": 1}}));
    }
}
