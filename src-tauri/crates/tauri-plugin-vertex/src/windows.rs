//! The app's windows (Window Permissions Plan, W1). Only Rust creates them, so a window's label, and with it the
//! capability it gets, is the kernel's to give: a webview can ask for a session it knows, Settings, About, or (from a
//! session window) one of a plugin's own windows its manifest declares, never a label. Also the lifecycle around them:
//! the start window shown only while no session window is, each window's style, each session's `open` mark, and a
//! plugin's windows closing with their session window.

use crate::api::SESSION_WINDOW_PREFIX;
use crate::grants::OwnWindow;
use crate::state::AppState;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, Runtime, Webview, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// A plugin's own windows are labelled `plugin:{plugin}:{window id}:{session uuid}`: one per id and session window.
pub const PLUGIN_WINDOW_PREFIX: &str = "plugin:";
/// To a plugin's window, from its session window (`{message}`); to a session window, from a plugin's window
/// (`{plugin, id, message}`): the kernel names the sender, from its label.
pub const PLUGIN_WINDOW_MESSAGE: &str = "vertex://plugin-window-message";
/// To a session window, when one of its plugins' windows is gone (`{plugin, id}`).
pub const PLUGIN_WINDOW_CLOSED: &str = "vertex://plugin-window-closed";

/// A plugin window's label: its plugin, its window id and its session's uuid.
pub fn plugin_window_label(plugin: &str, id: &str, session: &str) -> String {
    format!("{PLUGIN_WINDOW_PREFIX}{plugin}:{id}:{session}")
}

/// What a plugin window's label names: `(plugin, window id, session uuid)`.
pub fn plugin_window_parts(label: &str) -> Option<(&str, &str, &str)> {
    let mut parts = label.strip_prefix(PLUGIN_WINDOW_PREFIX)?.splitn(3, ':');
    Some((parts.next()?, parts.next()?, parts.next().filter(|s| !s.is_empty())?))
}

/// What the app does to each window once it's built (its overlay title bar), given by the app crate, which knows the
/// runtime the styling plugin works with ([`crate::api::set_window_style`]).
pub struct WindowStyle<R: Runtime>(pub Box<dyn Fn(&WebviewWindow<R>) + Send + Sync>);

/// The start window. `tauri.conf.json` describes it (`create: false`); [`open_launch_windows`] builds it.
pub const MAIN_WINDOW: &str = "main";
pub const SETTINGS_WINDOW: &str = "settings";
pub const ABOUT_WINDOW: &str = "about";

/// The window a webview asks for (`window_open`).
#[derive(Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum WindowRequest {
    /// A session's window; `title` names its workspace or file.
    Session { uuid: String, title: String },
    /// Settings, on `path` (a page under `/settings`) and `scope` (a workspace root; none for the user's settings).
    Settings { path: Option<String>, scope: Option<String> },
    About,
    /// One of plugin `plugin`'s own windows (its manifest's `ownWindows`), from a session window where it's on, with
    /// `params` (a JSON object) for it to start from.
    Plugin { plugin: String, id: String, params: Option<Value> },
}

/// What a plugin's window is made from: its manifest's declaration and name, and its session's workspace (the window
/// loads that workspace's copy of the plugin when it has one).
#[derive(Debug, Clone, PartialEq)]
pub struct PluginWindowInfo {
    pub window: OwnWindow,
    pub name: String,
    pub root: Option<String>,
}

/// What [`window_open`] builds for a request.
#[derive(Debug, PartialEq)]
pub struct WindowPlan {
    pub label: String,
    /// The app route it loads.
    pub route: String,
    pub title: String,
    pub size: (f64, f64),
    pub min_size: Option<(f64, f64)>,
    pub resizable: bool,
    /// A plugin's `bare` window ([`crate::grants::OwnWindow::bare`]).
    pub bare: bool,
}

/// The longest `params` a plugin's window may start from, as JSON: they travel in its URL.
const PARAMS_MAX: usize = 16 * 1024;

fn encode(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

/// The window for `request`, asked for by the window `caller`. `known` says whether a session is in `sessions.json`: a
/// window for any other uuid would still carry a session window's label. `own(caller, plugin, id)` is what a plugin's
/// window is made from, `None` unless that plugin is on in `caller` and declares the id.
pub fn plan(
    request: WindowRequest,
    caller: &str,
    known: impl Fn(&str) -> bool,
    own: impl Fn(&str, &str, &str) -> Option<PluginWindowInfo>,
) -> Result<WindowPlan, String> {
    match request {
        WindowRequest::Session { uuid, title } => {
            if !known(&uuid) {
                return Err(format!("unknown session {uuid:?}"));
            }
            Ok(WindowPlan {
                label: format!("{SESSION_WINDOW_PREFIX}{uuid}"),
                route: "/loading".into(),
                title: format!("Vertex - {title}"),
                size: (900.0, 600.0),
                min_size: None,
                resizable: true,
                bare: false,
            })
        }
        WindowRequest::Settings { path, scope } => {
            let path = path.unwrap_or_else(|| "/settings".into());
            let page = path == "/settings" || path.starts_with("/settings/");
            if !page || path.contains(['?', '#']) || path.split('/').any(|part| part == "..") {
                return Err(format!("not a Settings page: {path:?}"));
            }
            let query = scope.map(|s| format!("?scope={}", url::form_urlencoded::byte_serialize(s.as_bytes()).collect::<String>()));
            Ok(WindowPlan {
                label: SETTINGS_WINDOW.into(),
                route: format!("{path}{}", query.unwrap_or_default()),
                title: "Vertex - Settings".into(),
                size: (900.0, 600.0),
                min_size: None,
                resizable: true,
                bare: false,
            })
        }
        WindowRequest::About => Ok(WindowPlan {
            label: ABOUT_WINDOW.into(),
            route: "/about".into(),
            title: "Vertex".into(),
            size: (420.0, 480.0),
            min_size: None,
            resizable: false,
            bare: false,
        }),
        WindowRequest::Plugin { plugin, id, params } => {
            let session = caller.strip_prefix(SESSION_WINDOW_PREFIX).ok_or("a plugin's window opens from a session window")?;
            let info = own(caller, &plugin, &id).ok_or_else(|| format!("{plugin:?} has no window {id:?} it may open here"))?;
            let params = params.unwrap_or_else(|| json!({}));
            if !params.is_object() {
                return Err("a plugin window's params must be an object".into());
            }
            let params = params.to_string();
            if params.len() > PARAMS_MAX {
                return Err(format!("a plugin window's params are over {PARAMS_MAX} bytes"));
            }
            let root = info.root.map(|r| format!("&root={}", encode(&r))).unwrap_or_default();
            let OwnWindow { width, height, min_width, min_height, resizable, bare, .. } = info.window;
            Ok(WindowPlan {
                label: plugin_window_label(&plugin, &id, session),
                route: format!("/plugin-window/{plugin}/{id}?params={}{root}{}", encode(&params), if bare { "&bare=1" } else { "" }),
                title: info.name,
                size: (width, height),
                min_size: (min_width.is_some() || min_height.is_some()).then(|| (min_width.unwrap_or(0.0), min_height.unwrap_or(0.0))),
                resizable,
                bare,
            })
        }
    }
}

/// Opens the window a webview asks for, or brings it forward (unminimized) when it's open already. `async` on purpose:
/// Tauri runs a synchronous command on the main thread, and building a window there waits on that same thread, so the
/// app froze (seen in W1's first run).
#[tauri::command]
pub async fn window_open<R: Runtime>(app: AppHandle<R>, webview: Webview<R>, request: WindowRequest) -> Result<(), String> {
    let caller = webview.label().to_owned();
    let plan = plan(request, &caller, |uuid| app.state::<AppState>().has_session(&app, uuid), |caller, plugin, id| crate::grants::own_window(&app, caller, plugin, id))?;
    if let Some(window) = app.get_webview_window(&plan.label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    build(&app, &plan)
}

/// Where a message goes from a session window: one of its plugins' windows.
#[derive(Debug, Deserialize)]
pub struct MessageTarget {
    plugin: String,
    id: String,
}

/// A message between a plugin's window and its session window, the only two that talk: from the plugin's window to its
/// session window (`to` ignored, the sender named from its label), or from the session window to one of its plugins'
/// windows (`to`). Any other caller is refused.
#[tauri::command]
pub async fn window_message<R: Runtime>(app: AppHandle<R>, webview: Webview<R>, to: Option<MessageTarget>, message: Value) -> Result<(), String> {
    let caller = webview.label();
    if let Some((plugin, id, session)) = plugin_window_parts(caller) {
        let target = format!("{SESSION_WINDOW_PREFIX}{session}");
        return app.emit_to(target.as_str(), PLUGIN_WINDOW_MESSAGE, json!({"plugin": plugin, "id": id, "message": message})).map_err(|e| e.to_string());
    }
    let session = caller.strip_prefix(SESSION_WINDOW_PREFIX).ok_or("only a session window and its plugins' windows message each other")?;
    let MessageTarget { plugin, id } = to.ok_or("a message from a session window names its plugin's window")?;
    let target = plugin_window_label(&plugin, &id, session);
    if app.get_webview_window(&target).is_none() {
        return Err(format!("{plugin:?}'s window {id:?} isn't open"));
    }
    app.emit_to(target.as_str(), PLUGIN_WINDOW_MESSAGE, json!({"message": message})).map_err(|e| e.to_string())
}

/// Builds the window `plan` describes, after granting what it may call.
fn build<R: Runtime>(app: &AppHandle<R>, plan: &WindowPlan) -> Result<(), String> {
    let mut builder = WebviewWindowBuilder::new(app, &plan.label, WebviewUrl::App(plan.route.clone().into()))
        .title(&plan.title)
        .inner_size(plan.size.0, plan.size.1)
        .resizable(plan.resizable)
        .center()
        // On macOS every window keeps its frame: decorum (the app's title bar plugin) places every window's traffic
        // lights, on opening and on each resize, and dereferences null on a window that has none. A bare window
        // hides them instead (`hide_window_buttons`), its title bar see-through like the rest.
        .decorations(!plan.bare || cfg!(target_os = "macos"))
        .transparent(true)
        // Tauri's own file-drop handler would take every drop, so the page's HTML5 drag and drop (Files, the
        // editor, chat) would never get one; `tauri.conf.json` says the same for `main`.
        .disable_drag_drop_handler();
    if let Some((width, height)) = plan.min_size {
        builder = builder.min_inner_size(width, height);
    }
    if plan.bare {
        builder = builder.shadow(false).skip_taskbar(true);
    }
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .traffic_light_position(tauri::LogicalPosition::new(14.0, 21.0))
            // A bare window is all the plugin's: its first click is the plugin's too, not only what brings Vertex
            // forward.
            .accept_first_mouse(plan.bare);
    }
    crate::grants::grant_window(app, &plan.label)?;
    let window = builder.build().map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    if plan.bare {
        hide_window_buttons(&window);
    }
    opened(app, &window);
    Ok(())
}

/// Hides a window's close, minimize and zoom buttons (on the main thread, where AppKit wants it).
#[cfg(target_os = "macos")]
fn hide_window_buttons<R: Runtime>(window: &WebviewWindow<R>) {
    let handle = window.clone();
    let _ = window.run_on_main_thread(move || {
        use objc2::{msg_send, runtime::AnyObject};
        let Ok(ns_window) = handle.ns_window() else { return };
        let ns_window = ns_window.cast::<AnyObject>();
        // NSWindowCloseButton, NSWindowMiniaturizeButton, NSWindowZoomButton.
        for kind in 0usize..3 {
            // SAFETY: `ns_window` is this window's live NSWindow, on the main thread; a missing button is nil.
            unsafe {
                let button: *mut AnyObject = msg_send![ns_window, standardWindowButton: kind];
                if let Some(button) = button.as_ref() {
                    let _: () = msg_send![button, setHidden: true];
                }
            }
        }
    });
}

/// The windows at launch: the start window, from its entry in `tauri.conf.json` (`create: false` there, so this is the
/// only way), and after `restart_app` every session window that was open, whatever the recovery setting.
pub fn open_launch_windows<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let config = app.config().app.windows.iter().find(|w| w.label == MAIN_WINDOW).ok_or("no `main` window in tauri.conf.json")?;
    crate::grants::grant_window(app, MAIN_WINDOW)?;
    let window = WebviewWindowBuilder::from_config(app, config).and_then(|b| b.build()).map_err(|e| e.to_string())?;
    opened(app, &window);
    if crate::state::take_restart(app) {
        for (uuid, root) in app.state::<AppState>().reopenable(app) {
            let title = std::path::Path::new(&root).file_name().map_or(root.clone(), |n| n.to_string_lossy().into_owned());
            if let Err(e) = plan(WindowRequest::Session { uuid, title }, MAIN_WINDOW, |_| true, |_, _, _| None).and_then(|plan| build(app, &plan)) {
                eprintln!("[windows] could not reopen {root} after the restart: {e}");
            }
        }
    }
    Ok(())
}

/// Shows and focuses the start window (a second launch with nothing to open).
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(main) = app.get_webview_window(MAIN_WINDOW) {
        let _ = main.unminimize();
        let _ = main.show();
        let _ = main.set_focus();
    }
}

/// After a window is built: the app's style, and for a session window, the start window hidden and the session marked
/// open.
fn opened<R: Runtime>(app: &AppHandle<R>, window: &WebviewWindow<R>) {
    if let Some(style) = app.try_state::<WindowStyle<R>>() {
        (style.0)(window);
    }
    if let Some(uuid) = window.label().strip_prefix(SESSION_WINDOW_PREFIX) {
        sync_main_visibility(app, None);
        app.state::<AppState>().session_window(app, uuid, true);
    }
}

/// A window is gone: for a session window, the start window back if it was the last, the session marked closed, and
/// its plugins' windows closed; for a plugin's window, its session window told.
pub(crate) fn destroyed<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(uuid) = label.strip_prefix(SESSION_WINDOW_PREFIX) {
        sync_main_visibility(app, Some(label));
        app.state::<AppState>().session_window(app, uuid, false);
        for (other, window) in app.webview_windows() {
            if plugin_window_parts(&other).is_some_and(|(_, _, session)| session == uuid) {
                let _ = window.destroy();
            }
        }
    } else if let Some((plugin, id, session)) = plugin_window_parts(label) {
        let _ = app.emit_to(format!("{SESSION_WINDOW_PREFIX}{session}").as_str(), PLUGIN_WINDOW_CLOSED, json!({"plugin": plugin, "id": id}));
    }
}

/// Hides `main` while a session window exists and shows it again when the last one is gone (`closing` is going), so
/// the app never ends up with no visible window. Driven by real window events, not timers.
fn sync_main_visibility<R: Runtime>(app: &AppHandle<R>, closing: Option<&str>) {
    let has_sessions = app.webview_windows().keys().any(|l| l.starts_with(SESSION_WINDOW_PREFIX) && Some(l.as_str()) != closing);
    if has_sessions {
        if let Some(main) = app.get_webview_window(MAIN_WINDOW) {
            let _ = main.hide();
        }
    } else {
        show_main(app);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(path: Option<&str>, scope: Option<&str>) -> Result<WindowPlan, String> {
        plan(WindowRequest::Settings { path: path.map(Into::into), scope: scope.map(Into::into) }, MAIN_WINDOW, |_| false, |_, _, _| None)
    }

    #[test]
    fn a_session_window_needs_a_known_session() {
        let request = || WindowRequest::Session { uuid: "abc".into(), title: "Notes".into() };
        let opened = plan(request(), MAIN_WINDOW, |uuid| uuid == "abc", |_, _, _| None).unwrap();
        assert_eq!((opened.label.as_str(), opened.route.as_str(), opened.title.as_str()), ("session-abc", "/loading", "Vertex - Notes"));
        assert!(plan(request(), MAIN_WINDOW, |_| false, |_, _, _| None).is_err());
    }

    #[test]
    fn a_plugin_window_is_one_its_plugin_declares_and_a_session_window_asks_for() {
        let window = OwnWindow { id: "list".into(), width: 360.0, height: 560.0, min_width: Some(280.0), min_height: None, resizable: true, bare: false };
        // What `grants::own_window` answers: tasks is on in session-abc, with one window, `list`.
        let own = |caller: &str, plugin: &str, id: &str| {
            (caller == "session-abc" && plugin == "tasks" && id == "list")
                .then(|| PluginWindowInfo { window: window.clone(), name: "Tasks".into(), root: Some("/Users/me/My Notes".into()) })
        };
        let request = |plugin: &str, id: &str, params: Option<Value>| WindowRequest::Plugin { plugin: plugin.into(), id: id.into(), params };
        let opened = plan(request("tasks", "list", Some(json!({"a": 1}))), "session-abc", |_| true, own).unwrap();
        assert_eq!(opened.label, "plugin:tasks:list:abc");
        assert_eq!(opened.route, "/plugin-window/tasks/list?params=%7B%22a%22%3A1%7D&root=%2FUsers%2Fme%2FMy+Notes");
        assert_eq!((opened.title.as_str(), opened.size, opened.min_size, opened.bare), ("Tasks", (360.0, 560.0), Some((280.0, 0.0)), false));
        assert_eq!(plugin_window_parts(&opened.label), Some(("tasks", "list", "abc")));
        assert_eq!(crate::grants::WindowKind::of(&opened.label), Some(crate::grants::WindowKind::Plugin));

        // An id the manifest lacks, a plugin that's off or not there (both `None` from `own`), a caller that isn't a
        // session window, params that aren't an object or are too long.
        assert!(plan(request("tasks", "board", None), "session-abc", |_| true, own).is_err());
        assert!(plan(request("other", "list", None), "session-abc", |_| true, own).is_err());
        for caller in ["plugin:tasks:list:abc", "settings", MAIN_WINDOW] {
            assert!(plan(request("tasks", "list", None), caller, |_| true, own).is_err(), "{caller}");
        }
        assert!(plan(request("tasks", "list", Some(json!([1]))), "session-abc", |_| true, own).is_err());
        assert!(plan(request("tasks", "list", Some(json!({"x": "y".repeat(PARAMS_MAX)}))), "session-abc", |_| true, own).is_err());
    }

    #[test]
    fn a_bare_window_says_so_to_its_page() {
        let window = OwnWindow { id: "desk".into(), width: 160.0, height: 160.0, min_width: None, min_height: None, resizable: false, bare: true };
        let own = |_: &str, _: &str, _: &str| Some(PluginWindowInfo { window: window.clone(), name: "Furball".into(), root: None });
        let opened = plan(WindowRequest::Plugin { plugin: "furball".into(), id: "desk".into(), params: None }, "session-abc", |_| true, own).unwrap();
        assert!(opened.bare);
        assert_eq!(opened.route, "/plugin-window/furball/desk?params=%7B%7D&bare=1");
    }

    #[test]
    fn settings_opens_only_on_its_own_pages() {
        assert_eq!(settings(None, None).unwrap().route, "/settings");
        assert_eq!(settings(Some("/settings/ai/providers"), Some("/Users/me/My Notes")).unwrap().route, "/settings/ai/providers?scope=%2FUsers%2Fme%2FMy+Notes");
        for bad in ["/sessions/x", "/settingsX", "/settings/../sessions", "/settings?x=1", "/settings#y", "settings"] {
            assert!(settings(Some(bad), None).is_err(), "{bad}");
        }
    }

    #[test]
    fn requests_read_their_kind() {
        let about: WindowRequest = serde_json::from_str(r#"{"kind":"about"}"#).unwrap();
        assert_eq!(about, WindowRequest::About);
        let session: WindowRequest = serde_json::from_str(r#"{"kind":"session","uuid":"u","title":"t"}"#).unwrap();
        assert_eq!(session, WindowRequest::Session { uuid: "u".into(), title: "t".into() });
        assert!(serde_json::from_str::<WindowRequest>(r#"{"kind":"main"}"#).is_err());
    }
}
