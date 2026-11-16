//! What each window may call (Window Permissions Plan, W2 and W3). There's no capability file: before the kernel builds
//! a window it adds that window's grants, its kind's base ([`SHARED`], [`SCOPED`], the kernel's commands) and one per
//! plugin on for it: what its manifest's `permissions` stand for (the permission table, `shared/plugin/permissions.json`)
//! and its crate's commands ([`crate::api::grant`]). A plugin turned on later is granted to the open windows at once
//! ([`regrant`]). Tauri can't take a grant back: a label keeps its grants after its window closes, and a plugin turned
//! off keeps its grants until the app restarts ([`plugins_waiting_restart`]).

use crate::api::SESSION_WINDOW_PREFIX;
use crate::state::AppState;
use crate::windows::{ABOUT_WINDOW, MAIN_WINDOW, SETTINGS_WINDOW};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::{LazyLock, Mutex, PoisonError};
use tauri::ipc::CapabilityBuilder;
use tauri::{AppHandle, Manager, Runtime};

/// The kinds of window, each with its own grant.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WindowKind {
    Main,
    Session,
    Settings,
    About,
}

impl WindowKind {
    /// The kind of the window `label`; `None` for a label the kernel doesn't make.
    pub fn of(label: &str) -> Option<Self> {
        match label {
            MAIN_WINDOW => Some(Self::Main),
            SETTINGS_WINDOW => Some(Self::Settings),
            ABOUT_WINDOW => Some(Self::About),
            _ if label.starts_with(SESSION_WINDOW_PREFIX) => Some(Self::Session),
            _ => None,
        }
    }
}

/// Tauri permission identifiers, per window kind: a crate's commands each kind may call.
pub type Grants = &'static [(WindowKind, &'static [&'static str])];

/// What the kernel reads of a plugin's `plugin.json` (validated when it's built or installed).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    #[serde(default = "session_only")]
    pub windows: Vec<WindowKind>,
    #[serde(default)]
    pub permissions: Vec<String>,
    #[serde(default = "on")]
    pub enabled_by_default: bool,
}

fn session_only() -> Vec<WindowKind> {
    vec![WindowKind::Session]
}

fn on() -> bool {
    true
}

impl PluginManifest {
    pub fn parse(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("a plugin.json: {e}"))
    }
}

/// A manifest's permission names → Tauri permissions. `files-outside-workspace` stands for nothing until W4 holds a
/// session window to its workspace's files.
static PERMISSION_TABLE: LazyLock<BTreeMap<String, Vec<String>>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../../shared/plugin/permissions.json")).expect("shared/plugin/permissions.json")
});

/// Every window, whatever its kind: Tauri's own and the third-party plugins' (which the app crate registers).
const SHARED: &[&str] = &[
    "core:default",
    "core:window:default",
    "core:window:allow-center",
    "core:window:allow-close",
    "core:window:allow-destroy",
    "core:window:allow-hide",
    "core:window:allow-maximize",
    "core:window:allow-minimize",
    "core:window:allow-request-user-attention",
    "core:window:allow-set-always-on-bottom",
    "core:window:allow-set-always-on-top",
    "core:window:allow-set-background-color",
    "core:window:allow-set-badge-count",
    "core:window:allow-set-badge-label",
    "core:window:allow-set-closable",
    "core:window:allow-set-content-protected",
    "core:window:allow-set-cursor-grab",
    "core:window:allow-set-cursor-icon",
    "core:window:allow-set-cursor-position",
    "core:window:allow-set-cursor-visible",
    "core:window:allow-set-decorations",
    "core:window:allow-set-effects",
    "core:window:allow-set-enabled",
    "core:window:allow-set-focus",
    "core:window:allow-set-focusable",
    "core:window:allow-set-fullscreen",
    "core:window:allow-set-icon",
    "core:window:allow-set-ignore-cursor-events",
    "core:window:allow-set-max-size",
    "core:window:allow-set-maximizable",
    "core:window:allow-set-min-size",
    "core:window:allow-set-minimizable",
    "core:window:allow-set-overlay-icon",
    "core:window:allow-set-position",
    "core:window:allow-set-progress-bar",
    "core:window:allow-set-resizable",
    "core:window:allow-set-shadow",
    "core:window:allow-set-simple-fullscreen",
    "core:window:allow-set-size",
    "core:window:allow-set-size-constraints",
    "core:window:allow-set-skip-taskbar",
    "core:window:allow-set-theme",
    "core:window:allow-set-title",
    "core:window:allow-set-title-bar-style",
    "core:window:allow-set-visible-on-all-workspaces",
    "core:window:allow-show",
    "core:window:allow-start-dragging",
    "core:window:allow-start-resize-dragging",
    "core:window:allow-toggle-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-unminimize",
    "core:webview:default",
    "core:webview:allow-clear-all-browsing-data",
    "core:webview:allow-print",
    "core:webview:allow-reparent",
    "core:webview:allow-set-webview-auto-resize",
    "core:webview:allow-set-webview-background-color",
    "core:webview:allow-set-webview-focus",
    "core:webview:allow-set-webview-position",
    "core:webview:allow-set-webview-size",
    "core:webview:allow-set-webview-zoom",
    "core:webview:allow-webview-close",
    "core:webview:allow-webview-hide",
    "core:webview:allow-webview-show",
    "decorum:allow-show-snap-overlay",
    "dialog:default",
    "clipboard-manager:allow-write-text",
    "clipboard-manager:allow-write-image",
    "clipboard-manager:allow-read-text",
    "clipboard-manager:allow-read-image",
    "opener:default",
    "os:default",
    "process:default",
    "notification:default",
    "updater:default",
    "drag:default",
    // `fs:default`'s denies only (the webview's own data on Linux and Windows): its allows are global scopes, which
    // Tauri merges across every window.
    "fs:deny-webview-data-linux",
    "fs:deny-webview-data-windows",
];

/// What the file commands reach. `**/*` doesn't match a dot path (Tauri wants a literal leading dot on Unix), so the
/// app's own dot folders are named.
const READ: &[&str] = &["**/*", "**/.trash", "**/.trash/**", "**/.vertex/types.json", "**/.obsidian/types.json"];
const WRITE: &[&str] = &["**/*", "**/.vertex", "**/.vertex/**", "**/.trash", "**/.trash/**"];

/// File access, scoped on each command and so on this window only. Never a global `fs:scope`: Tauri merges those
/// across every window, whoever was granted them.
const SCOPED: &[(&str, &[&str])] = &[
    ("fs:read-all", READ),
    ("fs:write-all", WRITE),
    ("fs:allow-exists", WRITE),
    ("opener:allow-open-path", &["**/*"]),
    ("opener:allow-reveal-item-in-dir", &["**/*"]),
];

/// The kernel's own commands, per kind: what the kernel and the built-ins call in each. A plugin gets `http_fetch` and
/// the secret commands through its `network` and `secrets`.
const KERNEL: Grants = &[
    (
        WindowKind::Main,
        &[
            "vertex:allow-window-open",
            "vertex:allow-sessions-list",
            "vertex:allow-sessions-upsert",
            "vertex:allow-sessions-remove",
            "vertex:allow-settings-get",
            "vertex:allow-settings-set",
            "vertex:allow-take-open-requests",
            "vertex:allow-quit-app",
            "vertex:allow-update-token-get",
            "vertex:allow-data-get",
            "vertex:allow-data-set",
        ],
    ),
    (
        WindowKind::Session,
        &[
            "vertex:allow-window-open",
            "vertex:allow-sessions-list",
            "vertex:allow-sessions-upsert",
            "vertex:allow-sessions-remove",
            "vertex:allow-settings-get",
            "vertex:allow-settings-set",
            "vertex:allow-trust-get",
            "vertex:allow-trust-set",
            "vertex:allow-trust-move",
            "vertex:allow-trust-follow-edit",
            "vertex:allow-trust-pin",
            "vertex:allow-workspace-settings-get",
            "vertex:allow-workspace-settings-update",
            "vertex:allow-workspace-settings-reload",
            "vertex:allow-quit-app",
            "vertex:allow-read-text-files-batch",
            "vertex:allow-scan-directory-recursive",
            "vertex:allow-clipboard-files-get",
            "vertex:allow-clipboard-files-set",
            "vertex:allow-trash-item",
            "vertex:allow-trash-restore",
            "vertex:allow-update-token-get",
            // The chat built-in's web fetch tool (`webPage.ts`); X8 moves it to chat's manifest as `network`.
            "vertex:allow-http-fetch",
            "vertex:allow-search-notes",
            "vertex:allow-data-get",
            "vertex:allow-data-set",
        ],
    ),
    (
        WindowKind::Settings,
        &[
            "vertex:allow-window-open",
            "vertex:allow-sessions-list",
            "vertex:allow-settings-get",
            "vertex:allow-settings-set",
            "vertex:allow-trust-get",
            "vertex:allow-trust-set",
            "vertex:allow-trust-clear",
            "vertex:allow-trust-follow-edit",
            "vertex:allow-trust-pin",
            "vertex:allow-workspace-settings-get",
            "vertex:allow-workspace-settings-update",
            "vertex:allow-quit-app",
            "vertex:allow-restart-app",
            "vertex:allow-plugins-waiting-restart",
            "vertex:allow-read-text-files-batch",
            "vertex:allow-scan-directory-recursive",
            "vertex:allow-update-token-get",
            "vertex:allow-update-token-set",
            "vertex:allow-update-channels",
            "vertex:allow-system-fonts",
            "vertex:allow-data-get",
            "vertex:allow-data-set",
        ],
    ),
    (
        WindowKind::About,
        &[
            "vertex:allow-window-open",
            "vertex:allow-sessions-list",
            "vertex:allow-settings-get",
            "vertex:allow-settings-set",
            "vertex:allow-quit-app",
            "vertex:allow-update-token-get",
        ],
    ),
];

/// Whether plugin `manifest` is on in a window of `kind`: the global `plugins.enabled`, and in a workspace's window
/// (`workspace`: its `.vertex/settings.json`, whether its folder is trusted) that file's, which may turn a plugin off
/// and, only when trusted, on (`applicableOverrides`). Else the manifest's default.
pub fn plugin_on(manifest: &PluginManifest, kind: WindowKind, global: &Value, workspace: Option<(&Value, bool)>) -> bool {
    if !manifest.windows.contains(&kind) {
        return false;
    }
    let pointer = format!("/plugins/enabled/{}", manifest.id);
    if let Some((local, trusted)) = workspace {
        match local.pointer(&pointer).and_then(Value::as_bool) {
            Some(false) => return false,
            Some(true) if trusted => return true,
            _ => {}
        }
    }
    global.pointer(&pointer).and_then(Value::as_bool).unwrap_or(manifest.enabled_by_default)
}

/// The plugins on in a window: those of `catalog` [`plugin_on`] says are, and every crate's plugin without a manifest
/// (a built-in, not extracted yet, so always on).
pub fn plugins_on(kind: WindowKind, catalog: &[PluginManifest], crates: &[(&str, Grants)], global: &Value, workspace: Option<(&Value, bool)>) -> BTreeSet<String> {
    let builtins = crates.iter().map(|(id, _)| *id).filter(|id| !catalog.iter().any(|m| m.id == *id));
    catalog
        .iter()
        .filter(|m| plugin_on(m, kind, global, workspace))
        .map(|m| m.id.as_str())
        .chain(builtins)
        .map(str::to_owned)
        .collect()
}

/// What a window's grants are made of: its kind's base (when `base`), and one capability per plugin in `plugins` with
/// anything to grant. Tauri panics on an identifier it doesn't know, so the app crate's test resolves these against the
/// real ACL; a permission name outside the table is an error here.
pub fn capabilities<'a>(
    label: &str,
    kind: WindowKind,
    base: bool,
    plugins: impl IntoIterator<Item = &'a str>,
    catalog: &[PluginManifest],
    crates: &[(&str, Grants)],
) -> Result<Vec<CapabilityBuilder>, String> {
    let mut out = Vec::new();
    if base {
        let mut capability = CapabilityBuilder::new(format!("window-{label}")).window(label);
        for permission in SHARED {
            capability = capability.permission(*permission);
        }
        for (permission, paths) in SCOPED {
            let allow = paths.iter().map(|path| serde_json::json!({ "path": path })).collect();
            capability = capability.permission_scoped(*permission, allow, Vec::new());
        }
        for (_, permissions) in KERNEL.iter().filter(|(k, _)| *k == kind) {
            for permission in *permissions {
                capability = capability.permission(*permission);
            }
        }
        out.push(capability);
    }
    for plugin in plugins {
        let mut permissions = Vec::new();
        for name in catalog.iter().filter(|m| m.id == plugin).flat_map(|m| &m.permissions) {
            let granted = PERMISSION_TABLE.get(name).ok_or_else(|| format!("plugin {plugin:?} asks for an unknown permission {name:?}"))?;
            permissions.extend(granted.iter().cloned());
        }
        for (_, commands) in crates.iter().filter(|(id, _)| *id == plugin).flat_map(|(_, grants)| grants.iter()).filter(|(k, _)| *k == kind) {
            permissions.extend(commands.iter().map(|c| c.to_string()));
        }
        if permissions.is_empty() {
            continue;
        }
        let capability = permissions.into_iter().fold(CapabilityBuilder::new(format!("window-{label}-plugin-{plugin}")).window(label), |c, p| c.permission(p));
        out.push(capability);
    }
    Ok(out)
}

/// The core plugins' manifests, the core crates' grants, and what each label was granted.
#[derive(Default)]
pub(crate) struct WindowGrants {
    catalog: Mutex<Vec<PluginManifest>>,
    crates: Mutex<Vec<(&'static str, Grants)>>,
    /// Label → the plugins granted to it. A label is here once its base is granted.
    granted: Mutex<HashMap<String, BTreeSet<String>>>,
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(crate) fn register<R: Runtime>(app: &AppHandle<R>, plugin: &'static str, grants: Grants) {
    lock(&app.state::<WindowGrants>().crates).push((plugin, grants));
}

pub(crate) fn set_catalog<R: Runtime>(app: &AppHandle<R>, manifests: &[&str]) -> Result<(), String> {
    let catalog = manifests.iter().map(|json| PluginManifest::parse(json)).collect::<Result<Vec<_>, _>>()?;
    *lock(&app.state::<WindowGrants>().catalog) = catalog;
    Ok(())
}

/// The plugins on in the window `label` now, from what Rust owns: the settings, a workspace window's
/// `.vertex/settings.json` and whether its folder is trusted.
fn on_for<R: Runtime>(app: &AppHandle<R>, label: &str, kind: WindowKind, catalog: &[PluginManifest], crates: &[(&str, Grants)]) -> BTreeSet<String> {
    let state = app.state::<AppState>();
    let global = state.read_settings(app, Value::clone);
    let root = label.strip_prefix(SESSION_WINDOW_PREFIX).and_then(|uuid| state.workspace_of(app, uuid));
    let workspace = root.map(|root| (crate::state::workspace_settings(&root), state.folder_trusted(app, &root)));
    plugins_on(kind, catalog, crates, &global, workspace.as_ref().map(|(local, trusted)| (local, *trusted)))
}

/// Adds what the window `label` isn't granted yet: its base, before it's first built, and the plugins on for it.
pub(crate) fn grant_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    let kind = WindowKind::of(label).ok_or_else(|| format!("no grant for a window labelled {label:?}"))?;
    let state = app.state::<WindowGrants>();
    let catalog = lock(&state.catalog);
    let crates = lock(&state.crates);
    // Held throughout, so two callers can't add the same grant twice.
    let mut granted = lock(&state.granted);
    let base = !granted.contains_key(label);
    let on = on_for(app, label, kind, &catalog, &crates);
    let had = granted.entry(label.to_owned()).or_default();
    let new: Vec<&str> = on.iter().filter(|id| !had.contains(*id)).map(String::as_str).collect();
    for capability in capabilities(label, kind, base, new.iter().copied(), &catalog, &crates)? {
        app.add_capability(capability).map_err(|e| e.to_string())?;
    }
    had.extend(new.into_iter().map(str::to_owned));
    Ok(())
}

/// After a change to what's on (the settings, a workspace's, trust): grants every open window the plugins newly on for
/// it, before the windows hear of the change.
pub(crate) fn regrant<R: Runtime>(app: &AppHandle<R>) {
    for label in app.webview_windows().into_keys() {
        if let Err(e) = grant_window(app, &label) {
            eprintln!("[grants] {label}: {e}");
        }
    }
}

/// The plugins some window was granted but which are off for it now: on until the app restarts.
#[tauri::command]
pub(crate) fn plugins_waiting_restart<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
    let state = app.state::<WindowGrants>();
    let (catalog, crates) = (lock(&state.catalog), lock(&state.crates));
    let granted = lock(&state.granted).clone();
    let mut waiting = BTreeSet::new();
    for (label, had) in granted {
        let Some(kind) = WindowKind::of(&label) else { continue };
        let on = on_for(&app, &label, kind, &catalog, &crates);
        waiting.extend(had.into_iter().filter(|id| !on.contains(id)));
    }
    waiting.into_iter().collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn manifest(json: Value) -> PluginManifest {
        PluginManifest::parse(&json.to_string()).unwrap()
    }

    #[test]
    fn a_plugin_is_on_by_its_settings_and_only_in_its_windows() {
        let graph = manifest(json!({"id": "graph", "name": "Graph", "version": "1", "apiVersion": 1}));
        let off_by_default = manifest(json!({"id": "quiet", "windows": ["main", "session"], "enabledByDefault": false}));
        let none = json!({});
        assert!(plugin_on(&graph, WindowKind::Session, &none, None));
        assert!(!plugin_on(&graph, WindowKind::Main, &none, None));
        assert!(!plugin_on(&off_by_default, WindowKind::Main, &none, None));
        assert!(plugin_on(&off_by_default, WindowKind::Main, &json!({"plugins": {"enabled": {"quiet": true}}}), None));
        assert!(!plugin_on(&graph, WindowKind::Session, &json!({"plugins": {"enabled": {"graph": false}}}), None));
    }

    #[test]
    fn a_workspace_turns_a_plugin_off_always_and_on_only_when_trusted() {
        let graph = manifest(json!({"id": "graph"}));
        let global_off = json!({"plugins": {"enabled": {"graph": false}}});
        let local_on = json!({"plugins": {"enabled": {"graph": true}}});
        let local_off = json!({"plugins": {"enabled": {"graph": false}}});
        assert!(!plugin_on(&graph, WindowKind::Session, &json!({}), Some((&local_off, false))));
        assert!(!plugin_on(&graph, WindowKind::Session, &global_off, Some((&local_on, false))));
        assert!(plugin_on(&graph, WindowKind::Session, &global_off, Some((&local_on, true))));
        assert!(!plugin_on(&graph, WindowKind::Session, &json!({}), Some((&local_off, true))));
    }

    #[test]
    fn a_plugins_grant_is_its_permissions_and_its_crates_commands() {
        const GIT: Grants = &[(WindowKind::Session, &["vertex-git:allow-git-status"]), (WindowKind::Main, &["vertex-git:allow-git-clone"])];
        let crates: &[(&str, Grants)] = &[("git", GIT)];
        let catalog = [manifest(json!({"id": "fetcher", "windows": ["main"], "permissions": ["network", "secrets"]}))];
        let on = plugins_on(WindowKind::Main, &catalog, crates, &json!({}), None);
        assert_eq!(on, BTreeSet::from(["fetcher".to_owned(), "git".to_owned()]), "git has no manifest: a built-in, always on");
        assert_eq!(capabilities("main", WindowKind::Main, false, on.iter().map(String::as_str), &catalog, crates).unwrap().len(), 2);

        let unknown = [manifest(json!({"id": "odd", "permissions": ["camera"]}))];
        let Err(error) = capabilities("session-a", WindowKind::Session, false, ["odd"], &unknown, &[]) else { panic!("an unknown permission was granted") };
        assert!(error.contains("camera"), "{error}");
        assert!(capabilities("session-a", WindowKind::Session, false, ["plain"], &[manifest(json!({"id": "plain"}))], &[]).unwrap().is_empty());
    }

    #[test]
    fn the_table_names_what_manifests_may_ask_for() {
        let names: Vec<&str> = PERMISSION_TABLE.keys().map(String::as_str).collect();
        assert_eq!(names, ["files-outside-workspace", "network", "secrets"]);
    }
}
