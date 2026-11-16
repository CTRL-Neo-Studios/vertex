//! Installed font families, for the theme font pickers. The webview can render any installed family by
//! name, but has no API to list them.

use std::collections::BTreeMap;
use std::sync::LazyLock;

#[derive(Clone, serde::Serialize)]
pub struct FontFamily {
    name: String,
    monospace: bool,
}

static FAMILIES: LazyLock<Vec<FontFamily>> = LazyLock::new(scan);

fn scan() -> Vec<FontFamily> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    // Family name → monospace; a family counts as monospace if any of its faces is.
    let mut families = BTreeMap::<String, bool>::new();
    for face in db.faces() {
        // The first family name is the English one (fontdb orders them so).
        let Some((name, _)) = face.families.first() else { continue };
        // macOS hides its private system faces behind a leading dot (".SF NS").
        if name.is_empty() || name.starts_with('.') {
            continue;
        }
        *families.entry(name.clone()).or_default() |= face.monospaced;
    }
    families
        .into_iter()
        .map(|(name, monospace)| FontFamily { name, monospace })
        .collect()
}

/// Sorted by name. Scanned once per app run (a few hundred ms on a full system), then cached.
#[tauri::command]
pub async fn system_fonts() -> Result<Vec<FontFamily>, String> {
    tauri::async_runtime::spawn_blocking(|| FAMILIES.clone())
        .await
        .map_err(|e| e.to_string())
}
