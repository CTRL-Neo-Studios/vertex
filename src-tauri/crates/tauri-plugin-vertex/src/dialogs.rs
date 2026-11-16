//! Open and Save dialogs, shown from Rust (Window Permissions Plan, W4): `tauri-plugin-dialog`'s Rust API widens no
//! scope, so the pick joins the asking window's reach and file grant, and only its (open: read; save: write).

use crate::grants::{grant_files, Files};
use serde::Deserialize;
use tauri::{Manager, Runtime, Webview};
use tauri_plugin_dialog::{DialogExt, FileDialogBuilder};

#[derive(Deserialize)]
pub struct Filter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DialogOptions {
    title: Option<String>,
    default_path: Option<String>,
    filters: Vec<Filter>,
    /// Open: a folder rather than a file.
    directory: bool,
}

fn builder<R: Runtime>(webview: &Webview<R>, options: &DialogOptions) -> FileDialogBuilder<R> {
    let mut builder = webview.app_handle().dialog().file().set_parent(&webview.window());
    if let Some(title) = &options.title {
        builder = builder.set_title(title);
    }
    if let Some(path) = options.default_path.as_deref().map(std::path::Path::new) {
        // A folder to start in; a path also suggests its name; a bare name only that.
        builder = match (path.is_dir(), path.parent().filter(|_| path.is_absolute()), path.file_name()) {
            (true, _, _) => builder.set_directory(path),
            (false, Some(dir), Some(name)) => builder.set_directory(dir).set_file_name(name.to_string_lossy()),
            _ => builder.set_file_name(path.to_string_lossy()),
        };
    }
    for filter in &options.filters {
        let extensions: Vec<&str> = filter.extensions.iter().map(String::as_str).collect();
        builder = builder.add_filter(&filter.name, &extensions);
    }
    builder
}

fn pick<R: Runtime>(webview: &Webview<R>, picked: Option<tauri_plugin_dialog::FilePath>, files: Files) -> Result<Option<String>, String> {
    let Some(picked) = picked else { return Ok(None) };
    let path = picked.into_path().map_err(|e| e.to_string())?.to_string_lossy().into_owned();
    grant_files(webview.app_handle(), webview.label(), &path, files)?;
    Ok(Some(path))
}

/// A file or folder (`directory`) the user picks to open; `null` when cancelled. The window may read it.
#[tauri::command]
pub async fn dialog_open<R: Runtime>(webview: Webview<R>, options: DialogOptions) -> Result<Option<String>, String> {
    let builder = builder(&webview, &options);
    let picked = if options.directory { builder.blocking_pick_folder() } else { builder.blocking_pick_file() };
    pick(&webview, picked, Files::Read)
}

/// Where the user picks to save; `null` when cancelled. The window may write there (a file, or a folder it creates).
#[tauri::command]
pub async fn dialog_save<R: Runtime>(webview: Webview<R>, options: DialogOptions) -> Result<Option<String>, String> {
    let picked = builder(&webview, &options).blocking_save_file();
    pick(&webview, picked, Files::Write)
}
