//! The app's windows (Window Permissions Plan, W1). Only Rust creates them, so a window's label, and with it the
//! capability it gets, is the kernel's to give: a webview can ask for a session it knows, Settings or About, never a
//! label. Also the lifecycle around them: the start window shown only while no session window is, each window's
//! style, and each session's `open` mark.

use crate::api::SESSION_WINDOW_PREFIX;
use crate::state::AppState;
use serde::Deserialize;
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// What the app does to each window once it's built (its overlay title bar), given by the app crate, which knows the
/// runtime the styling plugin works with ([`crate::api::set_window_style`]).
pub struct WindowStyle<R: Runtime>(pub Box<dyn Fn(&WebviewWindow<R>) + Send + Sync>);

/// The start window. `tauri.conf.json` describes it (`create: false`); [`open_main`] builds it.
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
}

/// What [`window_open`] builds for a request.
#[derive(Debug, PartialEq)]
pub struct WindowPlan {
    pub label: String,
    /// The app route it loads.
    pub route: String,
    pub title: String,
    pub size: (f64, f64),
    pub resizable: bool,
}

/// The window for `request`. `known` says whether a session is in `sessions.json`: a window for any other uuid would
/// still carry a session window's label.
pub fn plan(request: WindowRequest, known: impl Fn(&str) -> bool) -> Result<WindowPlan, String> {
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
                resizable: true,
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
                resizable: true,
            })
        }
        WindowRequest::About => Ok(WindowPlan {
            label: ABOUT_WINDOW.into(),
            route: "/about".into(),
            title: "Vertex".into(),
            size: (420.0, 480.0),
            resizable: false,
        }),
    }
}

/// Opens the window a webview asks for, or brings it forward (unminimized) when it's open already. `async` on purpose:
/// Tauri runs a synchronous command on the main thread, and building a window there waits on that same thread, so the
/// app froze (seen in W1's first run).
#[tauri::command]
pub async fn window_open<R: Runtime>(app: AppHandle<R>, request: WindowRequest) -> Result<(), String> {
    let plan = plan(request, |uuid| app.state::<AppState>().has_session(&app, uuid))?;
    if let Some(window) = app.get_webview_window(&plan.label) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(&app, &plan.label, WebviewUrl::App(plan.route.into()))
        .title(&plan.title)
        .inner_size(plan.size.0, plan.size.1)
        .resizable(plan.resizable)
        .center()
        .decorations(true)
        .transparent(true)
        // Tauri's own file-drop handler would take every drop, so the page's HTML5 drag and drop (Files, the
        // editor, chat) would never get one; `tauri.conf.json` says the same for `main`.
        .disable_drag_drop_handler();
    #[cfg(target_os = "macos")]
    {
        builder = builder
            .hidden_title(true)
            .title_bar_style(tauri::TitleBarStyle::Overlay)
            .traffic_light_position(tauri::LogicalPosition::new(14.0, 21.0));
    }
    crate::grants::grant_window(&app, &plan.label)?;
    let window = builder.build().map_err(|e| e.to_string())?;
    opened(&app, &window);
    Ok(())
}

/// Builds the start window from its entry in `tauri.conf.json` (`create: false` there, so this is the only way).
pub fn open_main<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let config = app.config().app.windows.iter().find(|w| w.label == MAIN_WINDOW).ok_or("no `main` window in tauri.conf.json")?;
    crate::grants::grant_window(app, MAIN_WINDOW)?;
    let window = WebviewWindowBuilder::from_config(app, config).and_then(|b| b.build()).map_err(|e| e.to_string())?;
    opened(app, &window);
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

/// A window is gone: for a session window, the start window back if it was the last, and the session marked closed.
pub(crate) fn destroyed<R: Runtime>(app: &AppHandle<R>, label: &str) {
    if let Some(uuid) = label.strip_prefix(SESSION_WINDOW_PREFIX) {
        sync_main_visibility(app, Some(label));
        app.state::<AppState>().session_window(app, uuid, false);
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
        plan(WindowRequest::Settings { path: path.map(Into::into), scope: scope.map(Into::into) }, |_| false)
    }

    #[test]
    fn a_session_window_needs_a_known_session() {
        let request = || WindowRequest::Session { uuid: "abc".into(), title: "Notes".into() };
        let opened = plan(request(), |uuid| uuid == "abc").unwrap();
        assert_eq!((opened.label.as_str(), opened.route.as_str(), opened.title.as_str()), ("session-abc", "/loading", "Vertex - Notes"));
        assert!(plan(request(), |_| false).is_err());
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
