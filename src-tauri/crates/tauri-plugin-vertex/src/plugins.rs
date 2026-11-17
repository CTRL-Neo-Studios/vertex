//! Community plugins installed for every workspace (Plugin Architecture Plan, C2): `<app_data>/plugins/<id>/` holds each
//! one's `plugin.json`, `main.js`, `styles.css` and assets. Installing is two steps: [`plugin_stage`] unpacks a folder,
//! a `.zip` or a URL to one into `<app_data>/plugins-staging/`, and the Settings window validates its manifest (the
//! frontend's `validateManifest`, the one validator) and asks before [`plugin_install`] moves it into place. A plugin
//! installed from a folder (`plugins.sources.<id>` is a folder) is copied again when that folder changes, for
//! development. The kernel's catalog of manifests (`grants.rs`) follows every install and removal.

use crate::api::blocking;
use crate::grants::PluginManifest;
use crate::host::check_plugin;
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, RecommendedCache};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::http::header::{ACCESS_CONTROL_ALLOW_ORIGIN, CONTENT_TYPE, ORIGIN};
use tauri::http::{Request, Response, StatusCode};
use tauri::{AppHandle, Emitter, Manager, Runtime, UriSchemeContext, UriSchemeResponder};

const PLUGINS: &str = "plugins";
const STAGING: &str = "plugins-staging";
/// A plugin's folder as the webview loads it: `vertex-plugin://localhost/<id>/<path>` (`convertFileSrc`).
pub const SCHEME: &str = "vertex-plugin";
/// The windows list the installed plugins again (an install, a removal, a development copy).
const EVENT_PLUGINS_CHANGED: &str = "vertex://plugins-changed";
/// A plugin's files were copied again from its folder: the windows running it reload.
const EVENT_PLUGIN_UPDATED: &str = "vertex://plugin-updated";
/// A download or an unpacked `.zip` larger than this is refused.
const MAX_BYTES: u64 = 128 * 1024 * 1024;

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

fn read_manifest(folder: &Path) -> Result<Value, String> {
    let text = std::fs::read_to_string(folder.join("plugin.json")).map_err(|e| format!("plugin.json: {e}"))?;
    serde_json::from_str(&text).map_err(|e| format!("plugin.json: {e}"))
}

/// The installed plugins' manifests that Rust can grant: a folder named by a valid id, whose `plugin.json` parses and
/// names that id. Off unless turned on (`enabledByDefault` is a core plugin's). The frontend validates them in full;
/// one that fails there never loads.
pub(crate) fn installed_manifests<R: Runtime>(app: &AppHandle<R>) -> Vec<PluginManifest> {
    let Ok(plugins) = dir(app, PLUGINS) else { return Vec::new() };
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

/// Rust's catalog follows the installed plugins, the open windows are granted what's newly on, then every window lists
/// them again.
fn changed<R: Runtime>(app: &AppHandle<R>) {
    crate::grants::set_installed(app, installed_manifests(app));
    crate::grants::regrant(app);
    let _ = app.emit(EVENT_PLUGINS_CHANGED, ());
}

#[derive(Serialize)]
pub struct Installed {
    /// The folder's name.
    id: String,
    /// `plugin.json` as it is, `null` when it can't be read.
    manifest: Value,
    error: Option<String>,
}

/// Every installed plugin, by folder name, with its manifest unchecked: the frontend validates it.
#[tauri::command]
pub fn plugins_list<R: Runtime>(app: AppHandle<R>) -> Result<Vec<Installed>, String> {
    let mut out: Vec<Installed> = std::fs::read_dir(dir(&app, PLUGINS)?)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter(|entry| entry.path().is_dir())
        .filter_map(|entry| {
            let id = entry.file_name().to_str()?.to_owned();
            check_plugin(&id).ok()?;
            Some(match read_manifest(&entry.path()) {
                Ok(manifest) => Installed { id, manifest, error: None },
                Err(error) => Installed { id, manifest: Value::Null, error: Some(error) },
            })
        })
        .collect();
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

#[derive(Serialize)]
pub struct PluginCode {
    code: String,
    styles: Option<String>,
    /// SHA-256 of `code`, hex: what runs is what was hashed.
    hash: String,
}

/// An installed plugin's `main.js` (with its hash) and `styles.css`.
#[tauri::command]
pub async fn plugin_read<R: Runtime>(app: AppHandle<R>, id: String) -> Result<PluginCode, String> {
    let folder = plugin_dir(&app, &id)?;
    blocking(move || {
        let code = std::fs::read_to_string(folder.join("main.js")).map_err(|e| format!("main.js: {e}"))?;
        let styles = std::fs::read_to_string(folder.join("styles.css")).ok();
        let hash = Sha256::digest(code.as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
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

async fn download(url: &str, to: &Path) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) URLs".into());
    }
    crate::api::install_crypto();
    let client = reqwest::Client::builder().timeout(Duration::from_secs(120)).build().map_err(|e| e.to_string())?;
    let mut response = client.get(url).send().await.and_then(reqwest::Response::error_for_status).map_err(|e| e.to_string())?;
    let mut out = std::fs::File::create(to).map_err(|e| e.to_string())?;
    let mut total = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        total += chunk.len() as u64;
        if total > MAX_BYTES {
            return Err(format!("the download is larger than {} MB", MAX_BYTES / 1024 / 1024));
        }
        out.write_all(&chunk).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The folder holding `plugin.json` in what was unpacked: its top, or its one top folder (a `.zip` of the folder).
fn package_root(stage: &Path) -> Result<PathBuf, String> {
    if stage.join("plugin.json").is_file() {
        return Ok(stage.to_owned());
    }
    let entries: Vec<PathBuf> = std::fs::read_dir(stage).map_err(|e| e.to_string())?.flatten().map(|e| e.path()).collect();
    match entries.as_slice() {
        [only] if only.join("plugin.json").is_file() => Ok(only.clone()),
        _ => Err("there's no plugin.json at its top or in its one folder".into()),
    }
}

/// A stage named by [`plugin_stage`]: a uuid, so it can't name another path.
fn stage_dir<R: Runtime>(app: &AppHandle<R>, stage: &str) -> Result<PathBuf, String> {
    uuid::Uuid::parse_str(stage).map_err(|_| format!("no stage {stage:?}"))?;
    Ok(dir(app, STAGING)?.join(stage))
}

#[derive(Serialize)]
pub struct Staged {
    stage: String,
    manifest: Value,
}

/// Unpacks a plugin into a stage: from `path` (a folder, or a `.zip` file; picked in this window) or `url` (a `.zip`).
/// Returns the stage and the raw manifest, for the window to validate and ask about.
#[tauri::command]
pub async fn plugin_stage<R: Runtime>(app: AppHandle<R>, path: Option<String>, url: Option<String>) -> Result<Staged, String> {
    let stage = uuid::Uuid::new_v4().to_string();
    let folder = stage_dir(&app, &stage)?;
    let result = async {
        match (path, url) {
            (Some(path), None) => {
                let folder = folder.clone();
                blocking(move || {
                    let source = Path::new(&path);
                    if source.is_dir() { copy_dir(source, &folder) } else { unzip(source, &folder) }
                })
                .await?
            }
            (None, Some(url)) => {
                let file = folder.with_extension("zip");
                let downloaded = download(&url, &file).await;
                let unzipped = match downloaded {
                    Ok(()) => {
                        let (file, folder) = (file.clone(), folder.clone());
                        blocking(move || unzip(&file, &folder)).await
                    }
                    Err(e) => Err(e),
                };
                let _ = std::fs::remove_file(&file);
                unzipped?
            }
            _ => return Err("give a path or a URL".to_owned()),
        }
        read_manifest(&package_root(&folder)?)
    }
    .await;
    match result {
        Ok(manifest) => Ok(Staged { stage, manifest }),
        Err(e) => {
            let _ = std::fs::remove_dir_all(&folder);
            Err(e)
        }
    }
}

#[tauri::command]
pub fn plugin_discard<R: Runtime>(app: AppHandle<R>, stage: String) -> Result<(), String> {
    match std::fs::remove_dir_all(stage_dir(&app, &stage)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Moves `root` (a package: `plugin.json`, `main.js`…) to the installed plugin's folder, replacing what was there.
/// Checks what Rust's own work needs: the id rule, not a core plugin, `main.js`, a manifest it can grant.
fn put_in_place<R: Runtime>(app: &AppHandle<R>, root: &Path, expected: Option<&str>) -> Result<String, String> {
    let manifest = PluginManifest::parse(&std::fs::read_to_string(root.join("plugin.json")).map_err(|e| format!("plugin.json: {e}"))?)?;
    let id = manifest.id.clone();
    check_plugin(&id)?;
    if expected.is_some_and(|expected| expected != id) {
        return Err(format!("its id changed to {id:?}"));
    }
    if crate::grants::is_core(app, &id) {
        return Err(format!("{id:?} is a core plugin's id"));
    }
    if !root.join("main.js").is_file() {
        return Err("there's no main.js".into());
    }
    crate::grants::check_permissions(&manifest)?;
    let target = plugin_dir(app, &id)?;
    // The old copy goes aside first, so a failed move leaves something to put back.
    let old = dir(app, STAGING)?.join(format!("{}-old", uuid::Uuid::new_v4()));
    let had = target.exists();
    if had {
        std::fs::rename(&target, &old).map_err(|e| e.to_string())?;
    }
    if let Err(e) = std::fs::rename(root, &target).or_else(|_| copy_dir(root, &target).map_err(std::io::Error::other)) {
        if had {
            let _ = std::fs::rename(&old, &target);
        }
        return Err(e.to_string());
    }
    let _ = std::fs::remove_dir_all(&old);
    Ok(id)
}

/// Installs a stage (replacing the plugin's older copy) and returns the plugin's id.
#[tauri::command]
pub async fn plugin_install<R: Runtime>(app: AppHandle<R>, stage: String) -> Result<String, String> {
    let folder = stage_dir(&app, &stage)?;
    let handle = app.clone();
    let id = blocking(move || {
        let installed = package_root(&folder).and_then(|root| put_in_place(&handle, &root, None));
        let _ = std::fs::remove_dir_all(&folder);
        installed
    })
    .await?;
    changed(&app);
    Ok(id)
}

/// Deletes an installed plugin's folder. Its config and data stay; a window running it runs it until Vertex restarts.
#[tauri::command]
pub async fn plugin_remove<R: Runtime>(app: AppHandle<R>, id: String) -> Result<(), String> {
    let folder = plugin_dir(&app, &id)?;
    blocking(move || std::fs::remove_dir_all(&folder).map_err(|e| e.to_string())).await?;
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
        let copied = copy_dir(source, &stage).and_then(|()| package_root(&stage)).and_then(|root| put_in_place(app, &root, Some(id)));
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

/// Serves `<id>/<path>` from the installed plugin's folder, nothing outside it.
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
        inside(path).then(|| plugin_dir(ctx.app_handle(), id).ok().map(|dir| dir.join(path))).flatten()
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

    #[test]
    fn a_package_is_its_top_or_its_one_folder() {
        let flat = temp("flat");
        std::fs::write(flat.join("plugin.json"), "{}").unwrap();
        assert_eq!(package_root(&flat).unwrap(), flat);

        let nested = temp("nested");
        std::fs::create_dir_all(nested.join("my-plugin")).unwrap();
        std::fs::write(nested.join("my-plugin/plugin.json"), "{}").unwrap();
        assert_eq!(package_root(&nested).unwrap(), nested.join("my-plugin"));

        std::fs::create_dir_all(nested.join("other")).unwrap();
        assert!(package_root(&nested).is_err(), "two folders: which one?");
        for dir in [flat, nested] {
            std::fs::remove_dir_all(dir).unwrap();
        }
    }

    #[test]
    fn a_zip_unpacks_inside_its_folder_only() {
        let dir = temp("zip");
        let file = dir.join("p.zip");
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&file).unwrap());
        let options = zip::write::SimpleFileOptions::default();
        zip.start_file("p/plugin.json", options).unwrap();
        zip.write_all(br#"{"id":"p"}"#).unwrap();
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
}
