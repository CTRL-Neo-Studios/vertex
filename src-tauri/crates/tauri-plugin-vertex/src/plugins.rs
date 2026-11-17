//! Community plugins (Plugin Architecture Plan, C2, C2b, C3): installed for every workspace in `<app_data>/plugins/<id>/`,
//! or for one in `<root>/.vertex/plugins/<id>/`. Each folder holds the plugin's `plugin.json`, `main.js`, `styles.css`,
//! assets, and `.install.json` (where it was fetched from). Installing is two steps: [`plugin_stage`] fetches a source
//! (a Git repository's release or ref, a `.zip` URL: `sources.rs`) or copies a picked folder or `.zip` into
//! `<app_data>/plugins-staging/`, and the Settings window validates its manifest (the frontend's `validateManifest`, the
//! one validator) and asks before [`plugin_install`] moves it into place. An update is a stage of the same source;
//! [`plugin_updates`] says which sources have something newer, only when asked or while `plugins.checkUpdates` is on. A
//! plugin installed from a folder is copied again when that folder changes, for development. A workspace's plugin runs
//! only in its session windows, once its folder is trusted and it's accepted: its files hash to the pin trust keeps
//! for it ([`bundle_hash`]), checked here whenever its manifest is granted, its code read or its assets served. The
//! kernel's catalog of manifests (`grants.rs`) follows every install and removal.

use crate::api::blocking;
use crate::grants::PluginManifest;
use crate::host::check_plugin;
use crate::sources::{Source, MAX_BYTES};
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::http::header::{ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_TYPE, ORIGIN};
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

const PLUGINS: &str = "plugins";
const STAGING: &str = "plugins-staging";
/// Where an installed plugin came from, written into its folder by [`plugin_install`].
const RECORD: &str = ".install.json";
/// A plugin's folder as the webview loads it: `vertex-plugin://localhost/<id>/<path>` (`convertFileSrc`).
pub const SCHEME: &str = "vertex-plugin";
/// The windows list the installed plugins again (an install, a removal, a development copy).
const EVENT_PLUGINS_CHANGED: &str = "vertex://plugins-changed";
/// A plugin's files were copied again from its folder: the windows running it reload.
const EVENT_PLUGIN_UPDATED: &str = "vertex://plugin-updated";
/// A check found what [`plugin_updates`] returns.
const EVENT_PLUGIN_UPDATES: &str = "vertex://plugin-updates";
/// While `plugins.checkUpdates` is on: how often the sources are checked.
const CHECK_EVERY: Duration = Duration::from_secs(24 * 60 * 60);

/// Where an installed plugin was fetched from (`.install.json`), and the stage's before it's installed: its source,
/// that source's origin (the repository, the URL, the path), what it resolved to, and the fetched file's SHA-256.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    source: String,
    origin: String,
    /// `release`, `branch`, `tag`, `commit`, `zip` (a URL), `file` or `folder`.
    kind: String,
    name: Option<String>,
    commit: Option<String>,
    sha256: Option<String>,
    version: Option<String>,
    /// Seconds since 1970.
    installed_at: Option<u64>,
}

fn read_record(folder: &Path) -> Option<Record> {
    serde_json::from_slice(&std::fs::read(folder.join(RECORD)).ok()?).ok()
}

fn dir<R: Runtime>(app: &AppHandle<R>, name: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join(name);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// The installed plugin `id`'s folder (which may not exist).
fn plugin_dir<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<PathBuf, String> {
    check_plugin(id)?;
    Ok(dir(app, PLUGINS)?.join(id))
}

/// Workspace `root`'s plugins folder, `.vertex/plugins` (which may not exist).
fn workspace_plugins(root: &str) -> Result<PathBuf, String> {
    Ok(crate::state::workspace_root(root)?.join(".vertex").join(PLUGINS))
}

/// Plugin `id`'s folder: in workspace `root`, else the installed one.
fn folder_of<R: Runtime>(app: &AppHandle<R>, id: &str, root: Option<&str>) -> Result<PathBuf, String> {
    match root {
        Some(root) => {
            check_plugin(id)?;
            Ok(workspace_plugins(root)?.join(id))
        }
        None => plugin_dir(app, id),
    }
}

/// What a pin covers, read once: `plugin.json`, `main.js`, `styles.css` and the strings, and their hash.
struct Bundle {
    code: String,
    styles: Option<String>,
    locales: Vec<(String, Vec<u8>)>,
    hash: String,
}

/// SHA-256 over each part's length and bytes, so no part's bytes can pass for another's.
fn bundle_hash<'a>(parts: impl IntoIterator<Item = &'a [u8]>) -> String {
    let mut hash = Sha256::new();
    for part in parts {
        hash.update((part.len() as u64).to_le_bytes());
        hash.update(part);
    }
    hash.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

/// A plugin's strings, `locales/<locale>.json` (`en`, `zh-CN`), by locale, sorted; other files there are skipped.
fn read_locales(folder: &Path) -> Vec<(String, Vec<u8>)> {
    let is_locale = |s: &str| !s.is_empty() && s.split('-').all(|p| !p.is_empty() && p.chars().all(|c| c.is_ascii_alphanumeric()));
    let mut out: Vec<(String, Vec<u8>)> = std::fs::read_dir(folder.join("locales"))
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let locale = entry.file_name().to_str()?.strip_suffix(".json")?.to_owned();
            is_locale(&locale).then_some(())?;
            Some((locale, std::fs::read(entry.path()).ok()?))
        })
        .collect();
    out.sort();
    out
}

/// Locale → its strings as JSON, for the frontend to merge (`null` for a file that doesn't parse).
fn parse_locales(locales: &[(String, Vec<u8>)]) -> serde_json::Map<String, Value> {
    locales.iter().map(|(locale, bytes)| (locale.clone(), serde_json::from_slice(bytes).unwrap_or(Value::Null))).collect()
}

fn read_bundle(folder: &Path) -> Result<Bundle, String> {
    let manifest = std::fs::read(folder.join("plugin.json")).map_err(|e| format!("plugin.json: {e}"))?;
    let code = std::fs::read_to_string(folder.join("main.js")).map_err(|e| format!("main.js: {e}"))?;
    let styles = std::fs::read_to_string(folder.join("styles.css")).ok();
    let locales = read_locales(folder);
    let fixed = [manifest.as_slice(), code.as_bytes(), styles.as_deref().unwrap_or_default().as_bytes()];
    let hash = bundle_hash(fixed.into_iter().chain(locales.iter().flat_map(|(locale, bytes)| [locale.as_bytes(), bytes.as_slice()])));
    Ok(Bundle { code, styles, locales, hash })
}

/// Workspace `root`'s plugin `id`, when it's accepted: `root` is trusted and the plugin's files hash to its pin now.
fn accepted<R: Runtime>(app: &AppHandle<R>, root: &str, id: &str) -> Option<PathBuf> {
    let folder = folder_of(app, id, Some(root)).ok()?;
    let pin = app.state::<crate::state::AppState>().plugin_pin(app, root, id)?;
    (read_bundle(&folder).ok()?.hash == pin).then_some(folder)
}

/// Plugin `id`'s folder for the window `label`: its workspace's copy when that one is accepted, else the installed one.
fn folder_for<R: Runtime>(app: &AppHandle<R>, label: &str, id: &str) -> Result<PathBuf, String> {
    match crate::grants::workspace_of(app, label).and_then(|root| accepted(app, &root, id)) {
        Some(folder) => Ok(folder),
        None => plugin_dir(app, id),
    }
}

fn read_manifest(folder: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(folder.join("plugin.json")).map_err(|e| format!("plugin.json: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("plugin.json: {e}"))
}

/// The manifests Rust can grant in a plugins folder: a folder named by a valid id, whose `plugin.json` parses and
/// names that id. Off unless turned on (`enabledByDefault` is a core plugin's). The frontend validates them in full;
/// one that fails there never loads.
fn manifests_in(plugins: &Path) -> Vec<PluginManifest> {
    let mut found: Vec<PluginManifest> = std::fs::read_dir(plugins)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|entry| {
            let id = entry.file_name().to_str()?.to_owned();
            check_plugin(&id).ok()?;
            let mut manifest = PluginManifest::parse(&std::fs::read_to_string(entry.path().join("plugin.json")).ok()?).ok()?;
            manifest.enabled_by_default = false;
            (manifest.id == id).then_some(manifest)
        })
        .collect();
    found.sort_by(|a, b| a.id.cmp(&b.id));
    found
}

/// The installed plugins' manifests ([`manifests_in`]).
pub(crate) fn installed_manifests<R: Runtime>(app: &AppHandle<R>) -> Vec<PluginManifest> {
    dir(app, PLUGINS).map(|plugins| manifests_in(&plugins)).unwrap_or_default()
}

/// Workspace `root`'s accepted plugins' manifests ([`manifests_in`]), none with a core plugin's id.
pub(crate) fn workspace_manifests<R: Runtime>(app: &AppHandle<R>, root: &str) -> Vec<PluginManifest> {
    let Ok(plugins) = workspace_plugins(root) else { return Vec::new() };
    manifests_in(&plugins).into_iter().filter(|m| !crate::grants::is_core(app, &m.id) && accepted(app, root, &m.id).is_some()).collect()
}

/// Rust's catalog follows the installed plugins, the open windows are granted what's newly on, then every window lists
/// them again.
fn changed<R: Runtime>(app: &AppHandle<R>) {
    crate::grants::set_installed(app, installed_manifests(app));
    crate::grants::regrant(app);
    let _ = app.emit(EVENT_PLUGINS_CHANGED, ());
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Installed {
    /// The folder's name.
    id: String,
    /// `global`, or `workspace`: in the listed workspace's `.vertex/plugins/`.
    scope: &'static str,
    /// `plugin.json` as it is, `null` when it can't be read.
    manifest: Value,
    error: Option<String>,
    /// Where it was fetched from; none for one installed before C2b, or copied into a workspace by hand.
    record: Option<Record>,
    /// The origin of the repository its manifest names (`repository`), to compare with the record's.
    claimed: Option<String>,
    /// A workspace's plugin: the hash of its files now ([`bundle_hash`]), what accepting it pins, and where.
    hash: Option<String>,
    pin_path: Option<String>,
    /// A workspace's plugin: its folder is trusted and it's pinned with `hash`.
    accepted: bool,
    /// Its strings by locale (`locales/*.json`), as read with `hash`.
    locales: serde_json::Map<String, Value>,
}

/// The origin of the repository a manifest names: what it says of itself, not where it was fetched from.
fn claimed(manifest: &Value) -> Option<String> {
    manifest.get("repository")?.as_str().map(crate::sources::origin_of_repo)
}

/// The plugins in a plugins folder, by folder name, with their manifests unchecked (the frontend validates them).
fn list_in<R: Runtime>(app: &AppHandle<R>, plugins: &Path, root: Option<&str>) -> Vec<Installed> {
    let mut out: Vec<Installed> = std::fs::read_dir(plugins)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let id = entry.file_name().to_str()?.to_owned();
            check_plugin(&id).ok()?;
            let folder = entry.path();
            let record = read_record(&folder);
            let (manifest, error) = match read_manifest(&folder) {
                Ok(manifest) => (manifest, None),
                Err(error) => (Value::Null, Some(error)),
            };
            let (hash, pin_path, accepted, locales) = match root {
                Some(root) => {
                    let bundle = read_bundle(&folder).ok();
                    let hash = bundle.as_ref().map(|b| b.hash.clone());
                    let pin = app.state::<crate::state::AppState>().plugin_pin(app, root, &id);
                    let accepted = hash.is_some() && pin == hash;
                    let locales = bundle.map(|b| parse_locales(&b.locales)).unwrap_or_default();
                    (hash, Some(crate::state::plugin_pin_path(root, &id)), accepted, locales)
                }
                None => (None, None, false, parse_locales(&read_locales(&folder))),
            };
            Some(Installed { scope: if root.is_some() { "workspace" } else { "global" }, claimed: claimed(&manifest), id, manifest, error, record, hash, pin_path, accepted, locales })
        })
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    out
}

/// Every installed plugin, and with `root` that workspace's plugins, each with its record (and whether it's accepted).
#[tauri::command]
pub fn plugins_list<R: Runtime>(app: AppHandle<R>, root: Option<String>) -> Result<Vec<Installed>, String> {
    let mut out = list_in(&app, &dir(&app, PLUGINS)?, None);
    if let Some(root) = root {
        out.extend(list_in(&app, &workspace_plugins(&root)?, Some(&root)));
    }
    Ok(out)
}

#[derive(Serialize)]
pub struct PluginCode {
    code: String,
    styles: Option<String>,
    /// [`bundle_hash`] of what was read: what runs is what was hashed.
    hash: String,
}

/// A plugin's `main.js` and `styles.css` (with the hash of its three files as read): the installed copy, or with
/// `workspace` the calling window's workspace's, refused unless that one is accepted as read now.
#[tauri::command]
pub async fn plugin_read<R: Runtime>(app: AppHandle<R>, window: tauri::Window<R>, id: String, workspace: Option<bool>) -> Result<PluginCode, String> {
    let root = match workspace {
        Some(true) => Some(crate::grants::workspace_of(&app, window.label()).ok_or("this window has no workspace")?),
        _ => None,
    };
    let folder = folder_of(&app, &id, root.as_deref())?;
    let pin = root.as_deref().map(|root| app.state::<crate::state::AppState>().plugin_pin(&app, root, &id));
    blocking(move || {
        let Bundle { code, styles, hash, .. } = read_bundle(&folder)?;
        if pin.is_some_and(|pin| pin.as_deref() != Some(hash.as_str())) {
            return Err(format!("{id} changed since it was accepted in this workspace"));
        }
        Ok(PluginCode { code, styles, hash })
    })
    .await
}

/// A path inside a folder: relative, with no `..`, root or prefix.
fn inside(relative: &Path) -> bool {
    relative.components().all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|e| format!("{from:?}: {e}"))?.flatten() {
        let (source, target) = (entry.path(), to.join(entry.file_name()));
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_dir() {
            copy_dir(&source, &target)?;
        } else if kind.is_file() {
            std::fs::copy(&source, &target).map_err(|e| format!("{source:?}: {e}"))?;
        }
    }
    Ok(())
}

fn unzip(file: &Path, to: &Path) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(file).map_err(|e| e.to_string())?).map_err(|e| format!("not a .zip: {e}"))?;
    let mut total = 0u64;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        // `enclosed_name` drops entries that would land outside `to` (`../`, absolute).
        let Some(name) = entry.enclosed_name() else { continue };
        let target = to.join(name);
        if entry.is_dir() {
            std::fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            continue;
        }
        total += entry.size();
        if total > MAX_BYTES {
            return Err(format!("the .zip unpacks to more than {} MB", MAX_BYTES / 1024 / 1024));
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = std::fs::File::create(&target).map_err(|e| e.to_string())?;
        std::io::copy(&mut (&mut entry).take(MAX_BYTES), &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The built plugin in what was unpacked: `plugin.json` and `main.js` together, at its top or in `dist/` (a repository
/// with its build in `dist/`); a `.zip` of the folder or a forge's archive add one top folder. A `plugin.json` without
/// `main.js` beside it is a plugin's source, which Vertex can't build.
fn package_root(stage: &Path) -> Result<PathBuf, String> {
    let entries: Vec<PathBuf> = std::fs::read_dir(stage).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).collect();
    let top = match entries.as_slice() {
        [only] if only.is_dir() && !stage.join("plugin.json").is_file() => only.clone(),
        _ => stage.to_owned(),
    };
    let candidates = [top.clone(), top.join("dist")];
    if let Some(root) = candidates.iter().find(|c| c.join("plugin.json").is_file() && c.join("main.js").is_file()) {
        return Ok(root.clone());
    }
    if candidates.iter().any(|c| c.join("plugin.json").is_file()) {
        return Err("it holds the plugin's source, not its build (no main.js beside plugin.json, nor in dist/): install its release, or a branch with the built files".into());
    }
    Err("there's no plugin.json at its top, in its one folder, or in dist/".into())
}

/// A stage named by [`plugin_stage`]: a uuid, so it can't name another path. Its record is beside it (`<stage>.json`),
/// so what was unpacked keeps its own top folder.
fn stage_dir<R: Runtime>(app: &AppHandle<R>, stage: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(stage).map_err(|_| format!("no stage {stage:?}"))?;
    Ok(dir(app, STAGING)?.join(stage))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolution {
    /// The link as a source string, with what it named (a repository alone: its releases).
    source: String,
    origin: String,
    /// For a repository: its default branch, branches, tags, and the newest release with a `plugin.zip`.
    repository: Option<String>,
    default_branch: Option<String>,
    branches: Vec<String>,
    tags: Vec<String>,
    release: Option<String>,
}

/// Reads a link (a repository, a branch or release page, `owner/repo`, a `.zip` URL) for the install dialog: the
/// repository's refs (one request, and one per release tag tried), so the user can pick what to install.
#[tauri::command]
pub async fn plugin_source_resolve(link: String) -> Result<Resolution, String> {
    let source = crate::sources::from_link(&link)?;
    let (source_string, origin) = (source.to_source_string(), source.origin());
    let Source::Git { repo, .. } = &source else {
        return Ok(Resolution { source: source_string, origin, repository: None, default_branch: None, branches: vec![], tags: vec![], release: None });
    };
    let client = crate::sources::client()?;
    let refs = crate::sources::fetch_refs(&client, repo).await?;
    let release = crate::sources::newest_release(&client, repo, &refs).await.map(|(tag, ..)| tag);
    Ok(Resolution {
        source: source_string,
        origin,
        repository: Some(repo.clone()),
        default_branch: refs.default_branch,
        branches: refs.branches.into_iter().map(|(b, _)| b).collect(),
        tags: refs.tags.into_iter().map(|(t, _)| t).collect(),
        release,
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Staged {
    stage: String,
    manifest: Value,
    /// Where it's from and what that resolved to.
    resolved: Record,
    /// The record of the installed plugin with the same id, which installing for every workspace replaces.
    installed: Option<Record>,
    /// With `root`: the record of that workspace's plugin with the same id, which installing there replaces.
    workspace_installed: Option<Record>,
    claimed: Option<String>,
}

/// Fetches a source into `folder`, or copies `path` (a folder or `.zip` this window picked); returns where it's from
/// and what that resolved to.
async fn stage_into(folder: &Path, path: Option<String>, source: Option<String>) -> Result<Record, String> {
    match (path, source) {
        (Some(path), None) => {
            let (from, to) = (PathBuf::from(&path), folder.to_owned());
            let kind = if from.is_dir() { "folder" } else { "file" };
            blocking(move || if from.is_dir() { copy_dir(&from, &to) } else { unzip(&from, &to) }).await?;
            Ok(Record { source: path.clone(), origin: path, kind: kind.to_owned(), ..Record::default() })
        }
        (None, Some(source)) => {
            let source = Source::parse(&source)?;
            let client = crate::sources::client()?;
            let resolved = crate::sources::resolve(&client, &source).await?;
            let file = folder.with_extension("zip");
            let fetched = crate::sources::download(&client, &resolved.urls, &file).await;
            let unzipped = match fetched {
                Ok((_, sha256)) => {
                    let (file, to) = (file.clone(), folder.to_owned());
                    blocking(move || unzip(&file, &to)).await.map(|()| sha256)
                }
                Err(e) => Err(e),
            };
            let _ = std::fs::remove_file(&file);
            let sha256 = unzipped?;
            Ok(Record {
                source: resolved.source,
                origin: resolved.origin,
                kind: resolved.kind.to_owned(),
                name: resolved.name,
                commit: resolved.commit,
                sha256: Some(sha256),
                ..Record::default()
            })
        }
        _ => Err("give a path or a source".to_owned()),
    }
}

#[tauri::command]
pub async fn plugin_stage<R: Runtime>(app: AppHandle<R>, path: Option<String>, source: Option<String>, root: Option<String>) -> Result<Staged, String> {
    let stage = uuid::Uuid::new_v4().to_string();
    let folder = stage_dir(&app, &stage)?;
    let result = async {
        let resolved = stage_into(&folder, path, source).await?;
        let manifest = read_manifest(&package_root(&folder)?)?;
        std::fs::write(folder.with_extension("json"), serde_json::to_vec(&resolved).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
        let id = manifest.get("id").and_then(Value::as_str);
        let record_in = |root: Option<&str>| id.and_then(|id| folder_of(&app, id, root).ok()).and_then(|dir| read_record(&dir));
        let (installed, workspace_installed) = (record_in(None), root.as_deref().and_then(|root| record_in(Some(root))));
        Ok::<_, String>(Staged { stage: stage.clone(), claimed: claimed(&manifest), manifest, resolved, installed, workspace_installed })
    }
    .await;
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&folder);
    }
    result
}

#[tauri::command]
pub fn plugin_discard<R: Runtime>(app: AppHandle<R>, stage: String) -> Result<(), String> {
    let folder = stage_dir(&app, &stage)?;
    let _ = std::fs::remove_file(folder.with_extension("json"));
    match std::fs::remove_dir_all(folder) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Moves `package` (`plugin.json`, `main.js`…) to the plugin's folder (in workspace `root`, else the installed one) with
/// its `record`, replacing what was there. Checks what Rust's own work needs: the id rule, not a core plugin, `main.js`,
/// a manifest it can grant.
fn put_in_place<R: Runtime>(app: &AppHandle<R>, package: &Path, expected: Option<&str>, mut record: Record, root: Option<&str>) -> Result<String, String> {
    let text = std::fs::read_to_string(package.join("plugin.json")).map_err(|e| format!("plugin.json: {e}"))?;
    let manifest = PluginManifest::parse(&text)?;
    let id = manifest.id.clone();
    check_plugin(&id)?;
    if expected.is_some_and(|expected| expected != id) {
        return Err(format!("its id changed to {id:?}"));
    }
    if crate::grants::is_core(app, &id) {
        return Err(format!("{id:?} is a core plugin's id"));
    }
    if !package.join("main.js").is_file() {
        return Err("there's no main.js".into());
    }
    crate::grants::check_permissions(&manifest)?;
    record.version = serde_json::from_str::<Value>(&text).ok().and_then(|m| m.get("version")?.as_str().map(str::to_owned));
    record.installed_at = SystemTime::now().duration_since(UNIX_EPOCH).ok().map(|d| d.as_secs());
    std::fs::write(package.join(RECORD), serde_json::to_vec_pretty(&record).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let target = folder_of(app, &id, root)?;
    let parent = target.parent().ok_or("no plugins folder")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    // The old copy goes aside first (beside it: a workspace may be on another volume), so a failed move leaves
    // something to put back. A name starting with `.` is no plugin's id.
    let old = parent.join(format!(".old-{}", uuid::Uuid::new_v4()));
    let had = target.exists();
    if had {
        std::fs::rename(&target, &old).map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(package, &target).or_else(|_| copy_dir(package, &target).map_err(std::io::Error::other)) {
        if had {
            let _ = std::fs::rename(&old, &target);
        }
        return Err(e.to_string());
    }
    let _ = std::fs::remove_dir_all(&old);
    Ok(id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFrom {
    id: String,
    source: String,
}

/// Installs a stage (replacing the plugin's older copy) with its record, for every workspace or, with `root`, into that
/// trusted workspace, accepted as installed; returns the plugin's id and source. Replacing one (an update) reloads the
/// windows running it, as a folder install's copy does.
#[tauri::command]
pub async fn plugin_install<R: Runtime>(app: AppHandle<R>, stage: String, root: Option<String>) -> Result<InstalledFrom, String> {
    if let Some(root) = &root {
        if !app.state::<crate::state::AppState>().folder_trusted(&app, root) {
            return Err(format!("{root:?} isn't trusted: trust it to install plugins into it"));
        }
    }
    let folder = stage_dir(&app, &stage)?;
    let (handle, target) = (app.clone(), root.clone());
    let (installed, replaced, hash) = blocking(move || {
        let meta = folder.with_extension("json");
        let installed = std::fs::read(&meta)
            .map_err(|_| format!("no stage {stage:?}"))
            .and_then(|bytes| serde_json::from_slice::<Record>(&bytes).map_err(|e| e.to_string()))
            .and_then(|record| {
                let source = record.source.clone();
                let package = package_root(&folder)?;
                let id = read_manifest(&package).ok().and_then(|m| m.get("id")?.as_str().map(str::to_owned));
                let replaced = id.is_some_and(|id| folder_of(&handle, &id, target.as_deref()).is_ok_and(|dir| dir.exists()));
                let id = put_in_place(&handle, &package, None, record, target.as_deref())?;
                let hash = read_bundle(&folder_of(&handle, &id, target.as_deref())?)?.hash;
                Ok((InstalledFrom { id, source }, replaced, hash))
            });
        let _ = std::fs::remove_dir_all(&folder);
        let _ = std::fs::remove_file(&meta);
        installed
    })
    .await?;
    if let Some(root) = &root {
        app.state::<crate::state::AppState>().pin_plugin(&app, root, &installed.id, Some(hash))?;
    }
    changed(&app);
    let _ = app.state::<Updates>().0.lock().map(|mut found| found.retain(|u| u.id != installed.id || u.root != root));
    if replaced {
        let _ = app.emit(EVENT_PLUGIN_UPDATED, serde_json::json!({ "id": installed.id, "root": root }));
    }
    Ok(installed)
}

/// An installed plugin whose source has something newer.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    id: String,
    /// The workspace whose copy it is; none for one installed for every workspace.
    root: Option<String>,
    source: String,
    /// The release tag or branch, and commit, installed now and available.
    installed: Record,
    available: Record,
}

/// The last check's updates (none before one), for the Settings page without asking the hosts again.
#[derive(Default)]
pub(crate) struct Updates(Mutex<Vec<Update>>, Mutex<Option<SystemTime>>);

/// Whether `record`'s source has something newer: a release with another tag, a branch at another commit, a `.zip`
/// URL with other bytes. A pinned tag or commit, a file and a folder (watched) never do. One request per repository
/// (and one per release tag tried); a `.zip` URL is downloaded to be hashed.
async fn newer(client: &reqwest::Client, record: &Record, staging: &Path) -> Result<Option<Record>, String> {
    let Ok(source) = Source::parse(&record.source) else { return Ok(None) };
    if let Source::Git { pick: crate::sources::Pick::Tag(_) | crate::sources::Pick::Commit(_), .. } = &source {
        return Ok(None);
    }
    let resolved = crate::sources::resolve(client, &source).await?;
    let changed = match resolved.kind {
        "release" => resolved.name != record.name,
        "zip" => {
            let file = staging.join(format!("{}.check", uuid::Uuid::new_v4()));
            let sha = crate::sources::download(client, &resolved.urls, &file).await.map(|(_, sha)| sha);
            let _ = std::fs::remove_file(&file);
            Some(sha?) != record.sha256
        }
        _ => resolved.commit != record.commit,
    };
    Ok(changed.then(|| Record { source: resolved.source, origin: resolved.origin, kind: resolved.kind.to_owned(), name: resolved.name, commit: resolved.commit, ..Record::default() }))
}

/// Checks the source of every installed plugin, and of workspace `root`'s plugins, keeps the result and tells the
/// windows (`vertex://plugin-updates`).
async fn check_updates<R: Runtime>(app: &AppHandle<R>, root: Option<String>) -> Result<Vec<Update>, String> {
    let client = crate::sources::client()?;
    let staging = dir(app, STAGING)?;
    let mut folders = vec![(None, dir(app, PLUGINS)?)];
    if let Some(root) = root {
        folders.push((Some(root.clone()), workspace_plugins(&root)?));
    }
    let mut found = Vec::new();
    for (root, plugins) in folders {
        for entry in std::fs::read_dir(plugins).into_iter().flatten().flatten() {
            let (Some(id), Some(record)) = (entry.file_name().to_str().map(str::to_owned), read_record(&entry.path())) else { continue };
            match newer(&client, &record, &staging).await {
                Ok(Some(available)) => found.push(Update { id, root: root.clone(), source: record.source.clone(), installed: record, available }),
                Ok(None) => {}
                Err(e) => eprintln!("[plugins] {id}: couldn't check {}: {e}", record.source),
            }
        }
    }
    found.sort_by(|a, b| (&a.root, &a.id).cmp(&(&b.root, &b.id)));
    let state = app.state::<Updates>();
    *state.0.lock().map_err(|e| e.to_string())? = found.clone();
    *state.1.lock().map_err(|e| e.to_string())? = Some(SystemTime::now());
    let _ = app.emit(EVENT_PLUGIN_UPDATES, &found);
    Ok(found)
}

/// The updates found: with `check`, by asking the source of each installed plugin (and of workspace `root`'s) now;
/// without, the last check's (nothing is sent).
#[tauri::command]
pub async fn plugin_updates<R: Runtime>(app: AppHandle<R>, check: bool, root: Option<String>) -> Result<Vec<Update>, String> {
    if check {
        return check_updates(&app, root).await;
    }
    Ok(app.state::<Updates>().0.lock().map_err(|e| e.to_string())?.clone())
}

/// While `plugins.checkUpdates` is on: checks the installed plugins a minute after launch, then daily. Off (the
/// default), nothing is sent.
pub(crate) fn start_update_checks<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        loop {
            let on = crate::api::settings(&app).pointer("/plugins/checkUpdates").and_then(Value::as_bool) == Some(true);
            let last = app.state::<Updates>().1.lock().ok().and_then(|l| *l);
            if on && last.is_none_or(|t| t.elapsed().unwrap_or_default() >= CHECK_EVERY) {
                if let Err(e) = check_updates(&app, None).await {
                    eprintln!("[plugins] update check: {e}");
                }
            }
            tokio::time::sleep(Duration::from_secs(60 * 60)).await;
        }
    });
}

/// Deletes a plugin's folder (with `root`, that workspace's copy, and its pin). Its config and data stay; a window
/// running it runs it until Vertex restarts.
#[tauri::command]
pub async fn plugin_remove<R: Runtime>(app: AppHandle<R>, id: String, root: Option<String>) -> Result<(), String> {
    let folder = folder_of(&app, &id, root.as_deref())?;
    blocking(move || std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())).await?;
    if let Some(root) = &root {
        // An untrusted workspace has no pins to forget.
        let _ = app.state::<crate::state::AppState>().pin_plugin(&app, root, &id, None);
    }
    changed(&app);
    Ok(())
}

/// Plugin id → the watch on the folder it was installed from.
#[derive(Default)]
pub(crate) struct Watches(Mutex<HashMap<String, (String, Debouncer<RecommendedWatcher, RecommendedCache>)>>);

/// Copies an installed plugin again from the folder it came from, then tells the windows.
fn recopy<R: Runtime>(app: &AppHandle<R>, id: &str, source: &Path) {
    let result = (|| {
        let stage = dir(app, STAGING)?.join(uuid::Uuid::new_v4().to_string());
        let record = Record { source: source.to_string_lossy().into_owned(), origin: source.to_string_lossy().into_owned(), kind: "folder".into(), ..Record::default() };
        let copied = copy_dir(source, &stage).and_then(|()| package_root(&stage)).and_then(|root| put_in_place(app, &root, Some(id), record, None));
        let _ = std::fs::remove_dir_all(&stage);
        copied
    })();
    match result {
        Ok(_) => {
            changed(app);
            let _ = app.emit(EVENT_PLUGIN_UPDATED, serde_json::json!({ "id": id }));
        }
        Err(e) => eprintln!("[plugins] {id}: couldn't copy it again from {source:?}: {e}"),
    }
}

/// A folder's files as a build leaves them (path, size, modified): what tells a change from an event that changed
/// nothing (macOS reports a file again when it's cloned, as copying the folder does).
fn fingerprint(dir: &Path) -> Vec<(PathBuf, u64, Option<std::time::SystemTime>)> {
    let mut out = Vec::new();
    let mut stack = vec![dir.to_owned()];
    while let Some(at) = stack.pop() {
        for entry in std::fs::read_dir(&at).into_iter().flatten().flatten() {
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                out.push((entry.path(), meta.len(), meta.modified().ok()));
            }
        }
    }
    out.sort();
    out
}

/// Watches the folder of each installed plugin whose `plugins.sources.<id>` is one, and only those.
pub(crate) fn sync_watches<R: Runtime>(app: &AppHandle<R>, settings: &Value) {
    let installed: Vec<String> = installed_manifests(app).into_iter().map(|m| m.id).collect();
    let wanted: HashMap<String, String> = settings
        .pointer("/plugins/sources")
        .and_then(Value::as_object)
        .into_iter()
        .flatten()
        .filter(|(id, _)| installed.contains(id))
        .filter_map(|(id, source)| Some((id.clone(), source.as_str()?.to_owned())))
        .filter(|(_, source)| Path::new(source).is_dir())
        .collect();
    let watches = app.state::<Watches>();
    let mut watches = watches.0.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
    watches.retain(|id, (source, _)| wanted.get(id) == Some(source));
    for (id, source) in wanted {
        if watches.contains_key(&id) {
            continue;
        }
        let (handle, plugin, folder) = (app.clone(), id.clone(), PathBuf::from(&source));
        let mut last = fingerprint(&folder);
        let debouncer = new_debouncer(Duration::from_millis(300), None, move |result: DebounceEventResult| {
            let now = fingerprint(&folder);
            if result.is_ok() && now != last {
                last = now;
                recopy(&handle, &plugin, &folder);
            }
        });
        match debouncer {
            Ok(mut debouncer) => match debouncer.watch(Path::new(&source), RecursiveMode::Recursive) {
                Ok(()) => {
                    watches.insert(id, (source, debouncer));
                }
                Err(e) => eprintln!("[plugins] {id}: can't watch {source:?}: {e}"),
            },
            Err(e) => eprintln!("[plugins] {id}: {e}"),
        }
    }
}

/// The type of what a plugin loads from its folder, by extension; anything else is plain bytes.
fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("js" | "mjs") => "text/javascript",
        Some("css") => "text/css",
        Some("json") => "application/json",
        Some("wasm") => "application/wasm",
        Some("html") => "text/html",
        Some("txt" | "md") => "text/plain",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("woff2") => "font/woff2",
        Some("woff") => "font/woff",
        _ => "application/octet-stream",
    }
}

/// Serves `<id>/<path>` from the plugin's folder for the requesting window ([`folder_for`]), nothing outside it.
pub fn handle<R: Runtime>(ctx: UriSchemeContext<'_, R>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let origin = request.headers().get(ORIGIN).and_then(|o| o.to_str().ok()).unwrap_or("null").to_owned();
    let respond = move |code: StatusCode, kind: Option<&str>, body: Vec<u8>| {
        let mut builder = Response::builder().status(code).header(ACCESS_CONTROL_ALLOW_ORIGIN, &origin);
        if let Some(kind) = kind {
            builder = builder.header(CONTENT_TYPE, kind);
        }
        builder.body(body).unwrap()
    };
    let decoded = percent_encoding::percent_decode_str(request.uri().path().trim_start_matches('/')).decode_utf8_lossy().into_owned();
    let file = decoded.split_once('/').and_then(|(id, path)| {
        let path = Path::new(path);
        inside(path).then(|| folder_for(ctx.app_handle(), ctx.webview_label(), id).ok().map(|dir| dir.join(path))).flatten()
    });
    let Some(file) = file else {
        return responder.respond(respond(StatusCode::FORBIDDEN, None, Vec::new()));
    };
    tauri::async_runtime::spawn_blocking(move || {
        responder.respond(match std::fs::read(&file) {
            Ok(bytes) => respond(StatusCode::OK, Some(content_type(&file)), bytes),
            Err(_) => respond(StatusCode::NOT_FOUND, None, Vec::new()),
        });
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vertex-plugins-{name}-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_path_inside_a_plugin_has_no_way_out() {
        assert!(inside(Path::new("assets/a.png")));
        assert!(inside(Path::new("./main.js")));
        assert!(!inside(Path::new("../other/main.js")));
        assert!(!inside(Path::new("assets/../../x")));
        assert!(!inside(Path::new("/etc/passwd")));
    }

    fn built(dir: &Path) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join("plugin.json"), "{}").unwrap();
        std::fs::write(dir.join("main.js"), "").unwrap();
    }

    #[test]
    fn a_package_is_its_built_files_at_its_top_in_its_one_folder_or_in_dist() {
        let flat = temp("flat");
        built(&flat);
        assert_eq!(package_root(&flat).unwrap(), flat);

        let nested = temp("nested");
        built(&nested.join("my-plugin"));
        assert_eq!(package_root(&nested).unwrap(), nested.join("my-plugin"));
        std::fs::create_dir_all(nested.join("other")).unwrap();
        assert!(package_root(&nested).is_err(), "two folders: which one?");

        // A forge's archive of a repository: one top folder, the source's plugin.json at its top, the build in dist/.
        let archive = temp("archive");
        std::fs::create_dir_all(archive.join("repo-abc/src")).unwrap();
        std::fs::write(archive.join("repo-abc/plugin.json"), "{}").unwrap();
        built(&archive.join("repo-abc/dist"));
        assert_eq!(package_root(&archive).unwrap(), archive.join("repo-abc/dist"));

        // Only the source: refused with what to install instead.
        std::fs::remove_dir_all(archive.join("repo-abc/dist")).unwrap();
        assert!(package_root(&archive).unwrap_err().contains("source, not its build"));
        for dir in [flat, nested, archive] {
            std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn a_pin_covers_the_manifest_the_code_the_styles_and_the_strings_as_read() {
        let dir = temp("bundle");
        let parts = |list: &[&str]| bundle_hash(list.iter().map(|s| s.as_bytes()));
        std::fs::write(dir.join("plugin.json"), r#"{"id":"p"}"#).unwrap();
        std::fs::write(dir.join("main.js"), "run()").unwrap();
        let bundle = read_bundle(&dir).unwrap();
        assert_eq!(bundle.hash, parts(&[r#"{"id":"p"}"#, "run()", ""]), "what's handed over is what's hashed");
        assert_ne!(parts(&["a", "bc", ""]), parts(&["ab", "c", ""]), "bytes can't move between parts");
        std::fs::create_dir(dir.join("locales")).unwrap();
        for (file, text) in [
            ("styles.css", "p{}"),
            ("plugin.json", r#"{"id":"p","permissions":["network"]}"#),
            ("main.js", "run(2)"),
            ("locales/en.json", "{}"),
            ("locales/en.json", r#"{"plugins":{"p":{"a":"A"}}}"#),
        ] {
            let before = read_bundle(&dir).unwrap().hash;
            std::fs::write(dir.join(file), text).unwrap();
            assert_ne!(read_bundle(&dir).unwrap().hash, before, "{file} is covered");
        }
        std::fs::write(dir.join("logo.svg"), "<svg/>").unwrap();
        std::fs::write(dir.join("locales/notes.txt"), "x").unwrap();
        let expected = parts(&[r#"{"id":"p","permissions":["network"]}"#, "run(2)", "p{}", "en", r#"{"plugins":{"p":{"a":"A"}}}"#]);
        assert_eq!(read_bundle(&dir).unwrap().hash, expected, "assets aren't, nor what in locales/ isn't a locale's");
        assert_eq!(parse_locales(&read_bundle(&dir).unwrap().locales)["en"]["plugins"]["p"]["a"], "A");
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_zip_unpacks_inside_its_folder_only() {
        use std::io::Write;
        let dir = temp("zip");
        let file = dir.join("p.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&file).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("p/plugin.json", options).unwrap();
        zip.write_all(br#"{"id":"p"}"#).unwrap();
        zip.start_file("p/main.js", options).unwrap();
        zip.start_file("../escape.txt", options).unwrap();
        zip.write_all(b"no").unwrap();
        zip.finish().unwrap();

        let out = dir.join("out");
        unzip(&file, &out).unwrap();
        assert!(out.join("p/plugin.json").is_file());
        assert!(!dir.join("escape.txt").exists());
        assert_eq!(package_root(&out).unwrap(), out.join("p"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn an_update_is_another_release_or_commit_and_never_a_pin() {
        let (base, log) = crate::sources::tests::local_forge();
        let client = crate::sources::client().unwrap();
        let staging = std::env::temp_dir();
        let (a, b) = ("a".repeat(40), "b".repeat(40));
        let at = |pick: &str, name: &str, commit: &str| Record {
            source: format!("git+{base}/gh/o/r#{pick}"),
            name: Some(name.to_owned()),
            commit: Some(commit.to_owned()),
            ..Record::default()
        };
        tauri::async_runtime::block_on(async {
            let found = newer(&client, &at("releases", "v0.1.0", &a), &staging).await.unwrap().unwrap();
            assert_eq!(found.name.as_deref(), Some("v0.2.0"));
            assert!(newer(&client, &at("releases", "v0.2.0", &b), &staging).await.unwrap().is_none());
            let found = newer(&client, &at("branch:dist", "dist", &a), &staging).await.unwrap().unwrap();
            assert_eq!(found.commit, Some(b.clone()));
            assert!(newer(&client, &at("branch:dist", "dist", &b), &staging).await.unwrap().is_none());

            let before = log.lock().unwrap().len();
            assert!(newer(&client, &at("tag:v0.1.0", "v0.1.0", &a), &staging).await.unwrap().is_none());
            assert!(newer(&client, &at(&format!("commit:{a}"), &a, &a), &staging).await.unwrap().is_none());
            assert_eq!(log.lock().unwrap().len(), before, "a pin asks nothing");
        });
    }
}
