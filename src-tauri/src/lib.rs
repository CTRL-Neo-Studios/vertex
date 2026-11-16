//! The app: builds the plugins (the kernel `tauri-plugin-vertex`, the feature plugins, third-party ones), opens the
//! windows at launch, and hands files the OS asks it to open to the kernel. Every command lives in a plugin, and the
//! kernel makes every window (`windows.rs` there) and decides what it may call (`grants.rs`).

use tauri_plugin_decorum::WebviewWindowExt;
use tauri_plugin_vertex::api;
use url::Url;

/// Every core plugin's `plugin.json` (`layers/*/`), embedded by `build.rs`.
const CORE_PLUGINS: &[&str] = include!(concat!(env!("OUT_DIR"), "/core_plugins.rs"));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The kernel first: the feature plugins use its API when they're set up.
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_vertex::init())
        .plugin(tauri_plugin_vertex_ai::init())
        .plugin(tauri_plugin_vertex_chats::init())
        .plugin(tauri_plugin_vertex_git::init())
        .plugin(tauri_plugin_notification::init());

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Second launch (Windows/Linux file association, or user re-opening the app).
            match parse_file_path_from_args(&args) {
                Some(path) => api::push_open_request(app, path),
                None => api::show_main(app),
            }
        }));
        // Each session window (`session-{uuid}`, stable per session) and Settings reopen at their last size and
        // place, pulled back on screen when that monitor is gone. `main`, the start window, stays centred.
        builder = builder.plugin(tauri_plugin_window_state::Builder::new().with_denylist(&[api::MAIN_WINDOW]).build());
        builder = builder.plugin(tauri_plugin_drag::init());
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // After every plugin is set up (window state, decorum, the core crates' grants), so the start window gets
            // them as any other. Every window the kernel builds gets the overlay title bar.
            api::set_window_style(app.handle(), |window| {
                let _ = window.create_overlay_titlebar();
            });
            api::set_core_plugins(app.handle(), CORE_PLUGINS)?;
            api::open_launch_windows(app.handle())?;

            // trust.json exists from launch (and old settings migrate then), not only once a window reads it.
            if let Err(e) = api::ensure_trust(app.handle()) {
                eprintln!("[state] could not create trust.json: {e}");
            }

            // Cold start with a file argument (Windows/Linux).
            #[cfg(any(windows, target_os = "linux"))]
            {
                let args: Vec<String> = std::env::args().collect();
                if let Some(path) = parse_file_path_from_args(&args) {
                    api::push_open_request(app.handle(), path);
                }
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(context())
        .expect("error while building tauri application")
        .run(|_app_handle, _event| {
            // Quitting by any route (menu, Dock, ⌘Q, shutdown): windows destroyed from now on stay `open`, for recovery.
            if let tauri::RunEvent::ExitRequested { .. } = _event {
                api::set_quitting(_app_handle);
            }
            // macOS delivers file associations (cold and warm) as RunEvent::Opened, possibly several at once.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = _event {
                for path in urls.iter().filter_map(|u| u.to_file_path().ok()) {
                    api::push_open_request(_app_handle, path.to_string_lossy().into_owned());
                }
            }
        });
}

/// The app's config, assets and ACL. One call site: on macOS it embeds `Info.plist` as a symbol, which can't be
/// defined twice (the test reads the ACL from here too).
fn context() -> tauri::Context<tauri::Wry> {
    tauri::generate_context!()
}

fn parse_file_path_from_args(args: &[String]) -> Option<String> {
    for (i, arg) in args.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if arg.starts_with("-") {
            continue;
        }

        if let Ok(url) = Url::parse(arg) {
            if let Ok(path) = url.to_file_path() {
                return Some(path.to_string_lossy().to_string());
            }
        }
        return Some(arg.clone());
    }
    None
}

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};
    use tauri::ipc::Origin;
    use tauri_plugin_vertex::api::{self, PluginManifest, WindowKind};

    const CRATES: &[(&str, api::Grants)] = &[
        (tauri_plugin_vertex_ai::PLUGIN, tauri_plugin_vertex_ai::GRANTS),
        (tauri_plugin_vertex_chats::PLUGIN, tauri_plugin_vertex_chats::GRANTS),
        (tauri_plugin_vertex_git::PLUGIN, tauri_plugin_vertex_git::GRANTS),
    ];

    /// The app's real ACL with a window of each kind granted as the kernel does it, for the core plugins `catalog` and
    /// the global settings `global`. Tauri panics on an identifier it doesn't know, as it would opening the window.
    struct Granted(tauri::Context<tauri::Wry>);

    impl Granted {
        fn new(catalog: &[PluginManifest], global: Value) -> Self {
            let mut context = super::context();
            for (label, kind) in [
                ("main", WindowKind::Main),
                ("session-a", WindowKind::Session),
                ("settings", WindowKind::Settings),
                ("about", WindowKind::About),
            ] {
                let on = api::plugins_on(kind, catalog, CRATES, &global, None);
                for capability in api::capabilities(label, kind, true, on.iter().map(String::as_str), catalog, CRATES).unwrap() {
                    context.runtime_authority_mut().add_capability(capability).unwrap();
                }
            }
            Self(context)
        }

        fn allows(&mut self, command: &str, label: &str) -> bool {
            self.0.runtime_authority_mut().resolve_access(command, label, label, &Origin::Local).is_some()
        }
    }

    fn manifest(json: Value) -> PluginManifest {
        PluginManifest::parse(&json.to_string()).unwrap()
    }

    #[test]
    fn each_window_kind_gets_its_grant_and_no_more() {
        let mut acl = Granted::new(&[], json!({}));
        assert!(acl.allows("plugin:vertex-git|git_status", "session-a"));
        assert!(!acl.allows("plugin:vertex-git|git_status", "settings"));
        assert!(acl.allows("plugin:vertex-git|git_clone", "main"));
        assert!(acl.allows("plugin:vertex-ai|ai_key_set", "settings"));
        assert!(!acl.allows("plugin:vertex-ai|ai_key_set", "session-a"));
        assert!(acl.allows("plugin:vertex|sessions_upsert", "main"));
        assert!(!acl.allows("plugin:vertex|sessions_upsert", "settings"));
        assert!(!acl.allows("plugin:vertex|trash_item", "about"));
        assert!(!acl.allows("plugin:vertex-chats|chat_read", "main"));
        assert!(acl.allows("plugin:fs|watch", "session-a"));
        assert!(acl.allows("plugin:vertex|restart_app", "settings"));
        assert!(!acl.allows("plugin:vertex|restart_app", "session-a"));
        // Only through a plugin's `network` and `secrets` (the chat built-in's web fetch keeps it in workspaces).
        assert!(acl.allows("plugin:vertex|http_fetch", "session-a"));
        assert!(!acl.allows("plugin:vertex|http_fetch", "main"));
        assert!(!acl.allows("plugin:vertex|secret_get", "session-a"));
        // A label the kernel never makes gets nothing.
        assert!(!acl.allows("plugin:fs|read_text_file", "session"));
        assert!(!acl.allows("plugin:vertex|window_open", "evil"));
    }

    #[test]
    fn a_core_crates_commands_reach_only_the_windows_where_its_plugin_is_on() {
        let git = || [manifest(json!({"id": "git", "windows": ["main", "session", "settings"]}))];
        let mut off = Granted::new(&git(), json!({"plugins": {"enabled": {"git": false}}}));
        for (command, label) in [("git_status", "session-a"), ("git_clone", "main"), ("git_tokens", "settings")] {
            assert!(!off.allows(&format!("plugin:vertex-git|{command}"), label), "{command} in {label}");
        }
        let mut on = Granted::new(&git(), json!({}));
        assert!(on.allows("plugin:vertex-git|git_status", "session-a"));
    }

    #[test]
    fn a_plugins_permissions_reach_the_windows_it_runs_in() {
        let fetcher = |permissions: Value| [manifest(json!({"id": "fetcher", "windows": ["main"], "permissions": permissions}))];
        let mut without = Granted::new(&fetcher(json!([])), json!({}));
        assert!(!without.allows("plugin:vertex|http_fetch", "main"));
        let mut with = Granted::new(&fetcher(json!(["network", "secrets"])), json!({}));
        assert!(with.allows("plugin:vertex|http_fetch", "main"));
        assert!(with.allows("plugin:vertex|secret_set", "main"));
        assert!(!with.allows("plugin:vertex|http_fetch", "settings"));
    }
}
