//! Host services every plugin gets, each named by the plugin's id: secrets in the OS keychain (account
//! `plugin:<id>:<name>`) and one JSON document per plugin, global in the app data dir or per workspace in
//! `<root>/.vertex/plugins-data/`.

use crate::api::{blocking, keychain_delete, keychain_get, keychain_set};
use crate::state::{workspace_root, write_atomic};
use serde_json::Value;
use std::io::ErrorKind;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const EVENT_PLUGIN_DATA_CHANGED: &str = "vertex://plugin-data-changed";
const PLUGINS_DATA: &str = "plugins-data";

/// `id` as a manifest names a plugin (`PLUGIN_ID` in `shared/plugin/manifest.ts`: `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, at
/// most 50), so it can't reach outside its file or keychain namespace.
pub(crate) fn check_plugin(id: &str) -> Result<(), String> {
    let b = id.as_bytes();
    let ok = (1..=50).contains(&b.len())
        && b[0].is_ascii_lowercase()
        && b.iter().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == b'-')
        && b[b.len() - 1] != b'-'
        && !id.contains("--");
    ok.then_some(()).ok_or_else(|| format!("invalid plugin id {id:?}"))
}

fn secret_account(plugin: &str, name: &str) -> Result<String, String> {
    check_plugin(plugin)?;
    Ok(format!("plugin:{plugin}:{name}"))
}

/// A plugin's secret, `None` when it has none by that name.
#[tauri::command]
pub async fn secret_get(plugin: String, name: String) -> Result<Option<String>, String> {
    let account = secret_account(&plugin, &name)?;
    blocking(move || keychain_get(&account)).await
}

#[tauri::command]
pub async fn secret_set(plugin: String, name: String, value: String) -> Result<(), String> {
    let account = secret_account(&plugin, &name)?;
    blocking(move || keychain_set(&account, &value)).await
}

/// A missing secret is fine.
#[tauri::command]
pub async fn secret_delete(plugin: String, name: String) -> Result<(), String> {
    let account = secret_account(&plugin, &name)?;
    blocking(move || keychain_delete(&account)).await
}

/// `<app data>/plugins-data/<plugin>.json`, or with `root` (a workspace folder) `<root>/.vertex/plugins-data/<plugin>.json`.
fn data_file<R: Runtime>(app: &AppHandle<R>, plugin: &str, root: Option<&str>) -> Result<PathBuf, String> {
    check_plugin(plugin)?;
    let dir = match root {
        Some(root) => workspace_root(root)?.join(".vertex"),
        None => app.path().app_data_dir().map_err(|e| e.to_string())?,
    };
    Ok(dir.join(PLUGINS_DATA).join(format!("{plugin}.json")))
}

/// The plugin's document, `null` when it has none.
#[tauri::command]
pub fn data_get<R: Runtime>(app: AppHandle<R>, plugin: String, root: Option<String>) -> Result<Value, String> {
    let path = data_file(&app, &plugin, root.as_deref())?;
    match std::fs::read(&path) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|e| format!("{path:?}: {e}")),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Value::Null),
        Err(e) => Err(e.to_string()),
    }
}

/// Replaces the plugin's document, then tells every window (`{plugin, root}`, `root` null for the global one).
#[tauri::command]
pub fn data_set<R: Runtime>(app: AppHandle<R>, plugin: String, root: Option<String>, value: Value) -> Result<(), String> {
    let path = data_file(&app, &plugin, root.as_deref())?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    write_atomic(&path, &value)?;
    app.emit(EVENT_PLUGIN_DATA_CHANGED, serde_json::json!({"plugin": plugin, "root": root}))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::check_plugin;

    #[test]
    fn plugin_ids_follow_the_manifest_rule() {
        for ok in ["a", "git", "vertex-ai", "x1", &"a".repeat(50)] {
            assert!(check_plugin(ok).is_ok(), "{ok}");
        }
        for bad in ["", "-a", "a-", "1a", "a--b", "A", "a_b", "a.b", "../a", "a:b", "a/b", &"a".repeat(51)] {
            assert!(check_plugin(bad).is_err(), "{bad}");
        }
    }
}
