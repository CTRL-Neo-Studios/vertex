// use tauri::Manager;
//
// use tauri_plugin_decorum::WebviewWindowExt; // adds helper methods to WebviewWindow
//
// #[cfg_attr(mobile, tauri::mobile_entry_point)]
// pub fn run() {
//     tauri::Builder::default()
//         .plugin(tauri_plugin_os::init())
//         .plugin(tauri_plugin_opener::init())
//         .plugin(tauri_plugin_clipboard_manager::init())
//         .plugin(tauri_plugin_store::Builder::new().build())
//         .plugin(tauri_plugin_dialog::init())
//         .plugin(tauri_plugin_fs::init())
//         .plugin(tauri_plugin_decorum::init()) // initialize the decorum plugin
//         .setup(|app| {
//             // Create a custom titlebar for main window
//             // On Windows this will hide decoration and render custom window controls
//             // On macOS it expects a hiddenTitle: true and titleBarStyle: overlay
//             let main_window = app.get_webview_window("main").unwrap();
//             main_window.create_overlay_titlebar().unwrap();
//
//             // Some macOS-specific helpers
//             #[cfg(target_os = "macos")]
//             {
//                 // Set a custom inset to the traffic lights
//                 // main_window.set_traffic_lights_inset(14.0, 21.0).unwrap();
//
//                 // Make window transparent without privateApi
//                 // main_window.make_transparent().unwrap();
//
//                 // Set window level
//                 // NSWindowLevel: https://developer.apple.com/documentation/appkit/nswindowlevel
//                 // main_window.set_window_level(25).unwrap();
//             }
//
//             if cfg!(debug_assertions) {
//                 app.handle().plugin(
//                     tauri_plugin_log::Builder::default()
//                         .level(log::LevelFilter::Info)
//                         .build(),
//                 )?;
//             }
//             Ok(())
//         })
//         .run(tauri::generate_context!())
//         .expect("error while running tauri application");
// }

use tauri::{Manager, Listener, WebviewWindow};
use tauri_plugin_decorum::WebviewWindowExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("main")
                       .expect("no main window")
                       .set_focus();
        }));
    }

    builder
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_decorum::init())
        .setup(|app| {
            // 1. Main Window: Explicit unwrap() as requested
            let main_window = app.get_webview_window("main").unwrap();
            apply_decorum_style(&main_window);

            let app_handle = app.handle().clone();

            // 2. Listener for new windows
            app.listen_any("tauri://webview-created", move |event| {
                 let label = event.payload();
                 let clean_label = label.replace("\"", "");

                 // Only proceed for windows starting with "session-"
                 if clean_label.starts_with("session-") {
                     // We use if let Some here simply because the window manager
                     // might differ by microseconds on async events,
                     // but the styling inside will strictly unwrap.
                     if let Some(win) = app_handle.get_webview_window(&clean_label) {
                         apply_decorum_style(&win);
                     }
                 }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn apply_decorum_style(window: &WebviewWindow) {
    window.create_overlay_titlebar().unwrap();

    #[cfg(target_os = "macos")]
    {
        // Example with unwrap:
        // window.set_traffic_lights_inset(14.0, 21.0).unwrap();
    }
}
