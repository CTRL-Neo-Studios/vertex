//! The kernel's Rust API, for plugin crates (`tauri-plugin-vertex-*`) and the app crate's startup: files, the
//! keychain, the global settings and what changes them, the windows at launch and what they may call, and the events
//! the app reports to the kernel. Everything that takes an `AppHandle` needs the kernel plugin ([`crate::init`])
//! registered first.

use crate::state::AppState;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

pub use crate::notes::snippet;
pub use crate::state::{workspace_root, write_atomic, write_bytes_atomic};
pub use crate::grants::{capabilities, plugins_on, Grants, PluginManifest, WindowKind};
pub use crate::reach::{gate, Entry};
pub use crate::windows::{open_launch_windows, show_main, MAIN_WINDOW};

/// Lets the windows where plugin `plugin` is on call the crate's commands, per kind (`grants`). Call it in the crate's
/// setup, before any window opens. A plugin with no manifest is never on.
pub fn grant<R: Runtime>(app: &AppHandle<R>, plugin: &'static str, grants: Grants) {
    crate::grants::register(app, plugin, grants);
}

/// The plugins' manifests (the app crate embeds them at build time: each `plugin.json`, or the built-ins' list),
/// before [`open_launch_windows`]: which windows each runs in, whether it's on by default, and what its `permissions`
/// grant there.
pub fn set_plugins<R: Runtime>(app: &AppHandle<R>, manifests: &[&str]) -> Result<(), String> {
    crate::grants::set_catalog(app, manifests)
}

/// What the app does to each window the kernel builds (its title bar style): set once, before [`open_launch_windows`].
pub fn set_window_style<R: Runtime>(app: &AppHandle<R>, style: impl Fn(&tauri::WebviewWindow<R>) + Send + Sync + 'static) {
    app.manage(crate::windows::WindowStyle(Box::new(style)));
}

/// The service every keychain entry of the app is saved under; entries differ by account.
pub const KEYRING_SERVICE: &str = "dev.ctrl-neo.vertex";
/// Session windows are labelled `session-{uuid}`, stable per session.
pub const SESSION_WINDOW_PREFIX: &str = "session-";

/// `f` on a blocking thread, for file, process and keychain work called from async commands.
pub async fn blocking<T: Send + 'static>(f: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f).await.map_err(|e| e.to_string())?
}

/// reqwest is built without a bundled crypto provider (same setup as tauri-plugin-updater): install ring's once.
pub fn install_crypto() {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        let _ = rustls::crypto::ring::default_provider().install_default();
    }
}

fn keychain_entry(account: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYRING_SERVICE, account).map_err(|e| format!("system keychain unavailable: {e}"))
}

/// The secret saved for `account`, `None` when there is none. Blocking: call it through [`blocking`].
pub fn keychain_get(account: &str) -> Result<Option<String>, String> {
    match keychain_entry(account)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("system keychain unavailable: {e}")),
    }
}

/// Saves `secret` for `account`, replacing any. Blocking.
pub fn keychain_set(account: &str, secret: &str) -> Result<(), String> {
    keychain_entry(account)?
        .set_password(secret)
        .map_err(|e| format!("system keychain unavailable: {e}"))
}

/// Removes `account`'s secret; a missing one is fine. Blocking.
pub fn keychain_delete(account: &str) -> Result<(), String> {
    match keychain_entry(account)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("system keychain unavailable: {e}")),
    }
}

/// The current global settings (`settings.json`'s `settings`), `null` before any were saved.
pub fn settings<R: Runtime>(app: &AppHandle<R>) -> Value {
    app.state::<AppState>().read_settings(app, Value::clone)
}

/// A plugin's global config, `plugins.config.<id>`; `null` when it has none.
pub fn plugin_config<R: Runtime>(app: &AppHandle<R>, id: &str) -> Value {
    app.state::<AppState>().read_settings(app, |s| {
        s.get("plugins")
            .and_then(|p| p.get("config"))
            .and_then(|c| c.get(id))
            .cloned()
            .unwrap_or(Value::Null)
    })
}

/// Runs `f(old, new)` after every save of the global settings, before `settings_set` returns. `f` may read the
/// settings, but must not register another callback.
pub fn on_settings_change<R: Runtime>(app: &AppHandle<R>, f: impl Fn(&Value, &Value) + Send + Sync + 'static) {
    app.state::<AppState>().on_settings_change(Box::new(f));
}

/// Names `plugins.config.<plugin>.<key>` as a program Rust runs (git's `path`): `settings_set` refuses a new value
/// there that the saving window didn't pick in its dialog, so a script in a webview can't point it elsewhere.
pub fn program_setting<R: Runtime>(app: &AppHandle<R>, plugin: &str, key: &str) {
    app.state::<AppState>().add_program_setting(format!("/plugins/config/{plugin}/{key}"));
}

/// Ensures `trust.json` exists (migrating old settings into it), so it does from launch.
pub fn ensure_trust<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    app.state::<AppState>().ensure_trust(app)
}

/// Queues a path the OS asked the app to open and wakes the windows (`vertex://open-requested`).
pub fn push_open_request<R: Runtime>(app: &AppHandle<R>, path: String) {
    app.state::<AppState>().push_open_request(app, path);
}

/// The app is quitting: session windows destroyed from now on keep their session `open`, for recovery.
pub fn set_quitting<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>().set_quitting();
}
