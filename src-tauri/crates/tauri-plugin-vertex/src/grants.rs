//! What each window may call (Window Permissions Plan, W2). There's no capability file: before the kernel builds a
//! window it adds that window's capability, made of its kind's base ([`SHARED`], [`SCOPED`], the kernel's commands) and
//! what each core crate registered for the kind ([`crate::api::grant`]). Tauri can't take a grant back, so a label keeps
//! its grant after its window closes, and a reopened window isn't granted twice.

use crate::api::SESSION_WINDOW_PREFIX;
use crate::windows::{ABOUT_WINDOW, MAIN_WINDOW, SETTINGS_WINDOW};
use std::collections::HashSet;
use std::sync::{Mutex, PoisonError};
use tauri::ipc::CapabilityBuilder;
use tauri::{AppHandle, Manager, Runtime};

/// The kinds of window, each with its own grant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
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

/// The kernel's own commands, per kind (what each kind's frontend calls).
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
            "vertex:allow-http-fetch",
            "vertex:allow-secret-get",
            "vertex:allow-secret-set",
            "vertex:allow-secret-delete",
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
            "vertex:allow-http-fetch",
            "vertex:allow-search-notes",
            "vertex:allow-secret-get",
            "vertex:allow-secret-set",
            "vertex:allow-secret-delete",
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
            "vertex:allow-read-text-files-batch",
            "vertex:allow-scan-directory-recursive",
            "vertex:allow-update-token-get",
            "vertex:allow-update-token-set",
            "vertex:allow-update-channels",
            "vertex:allow-system-fonts",
            "vertex:allow-http-fetch",
            "vertex:allow-secret-get",
            "vertex:allow-secret-set",
            "vertex:allow-secret-delete",
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

/// The capability of the window `label`, of kind `kind`: the shared and file grants, and the kernel's and each of
/// `crates`' commands for `kind`. Tauri panics on an identifier it doesn't know, so the app crate's test resolves every
/// kind against the real ACL.
pub fn capability(label: &str, kind: WindowKind, crates: &[Grants]) -> CapabilityBuilder {
    let mut capability = CapabilityBuilder::new(format!("window-{label}")).window(label);
    for permission in SHARED {
        capability = capability.permission(*permission);
    }
    for (permission, paths) in SCOPED {
        let allow = paths.iter().map(|path| serde_json::json!({ "path": path })).collect();
        capability = capability.permission_scoped(*permission, allow, Vec::new());
    }
    let commands = std::iter::once(&KERNEL).chain(crates).flat_map(|grants| grants.iter());
    for (_, permissions) in commands.filter(|(k, _)| *k == kind) {
        for permission in *permissions {
            capability = capability.permission(*permission);
        }
    }
    capability
}

/// The core crates' grants, and the labels granted so far.
#[derive(Default)]
pub(crate) struct WindowGrants {
    crates: Mutex<Vec<Grants>>,
    granted: Mutex<HashSet<String>>,
}

pub(crate) fn register<R: Runtime>(app: &AppHandle<R>, grants: Grants) {
    app.state::<WindowGrants>().crates.lock().unwrap_or_else(PoisonError::into_inner).push(grants);
}

/// Adds `label`'s capability, before its window is built; once per label.
pub(crate) fn grant_window<R: Runtime>(app: &AppHandle<R>, label: &str) -> Result<(), String> {
    let kind = WindowKind::of(label).ok_or_else(|| format!("no grant for a window labelled {label:?}"))?;
    let state = app.state::<WindowGrants>();
    if !state.granted.lock().unwrap_or_else(PoisonError::into_inner).insert(label.to_owned()) {
        return Ok(());
    }
    let crates = state.crates.lock().unwrap_or_else(PoisonError::into_inner).clone();
    app.add_capability(capability(label, kind, &crates)).map_err(|e| e.to_string())
}
