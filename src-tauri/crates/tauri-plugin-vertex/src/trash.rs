//! The system Trash (Recycle Bin on Windows): Files' Delete sends items there, and its Undo brings them back.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// An item put in the Trash, as restoring it needs: on macOS where it went (`trashed`, from
/// `trashItemAtURL:resultingItemURL:`); elsewhere when (`deleted_at`, Unix seconds), to find it in the Trash's listing.
#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Trashed {
    original: String,
    trashed: Option<String>,
    deleted_at: i64,
}

/// Moves one file or folder to the Trash.
#[tauri::command]
pub fn trash_item(path: String) -> Result<Trashed, String> {
    let deleted_at = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
    #[cfg(target_os = "macos")]
    let trashed = {
        use objc2_foundation::{NSFileManager, NSString, NSURL};
        let url = NSURL::fileURLWithPath(&NSString::from_str(&path));
        let mut out = None;
        NSFileManager::defaultManager()
            .trashItemAtURL_resultingItemURL_error(&url, Some(&mut out))
            .map_err(|e| e.localizedDescription().to_string())?;
        out.and_then(|url| url.path()).map(|p| p.to_string())
    };
    #[cfg(not(target_os = "macos"))]
    let trashed = {
        trash::delete(&path).map_err(|e| e.to_string())?;
        None
    };
    Ok(Trashed { original: path, trashed, deleted_at })
}

/// Puts an item from the Trash back where it was. Fails with `taken` when something is there now, and with
/// `missing` when the item has left the Trash (emptied, or put back from Finder or Explorer).
#[tauri::command]
pub fn trash_restore(item: Trashed) -> Result<(), String> {
    let original = Path::new(&item.original);
    if original.symlink_metadata().is_ok() {
        return Err("taken".into());
    }
    #[cfg(target_os = "macos")]
    {
        let from = item.trashed.filter(|p| Path::new(p).symlink_metadata().is_ok()).ok_or("missing")?;
        std::fs::rename(from, original).map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "macos"))]
    {
        // The newest entry for this path deleted since the step (a second of slack for the clock's rounding).
        let found = trash::os_limited::list()
            .map_err(|e| e.to_string())?
            .into_iter()
            .filter(|t| t.original_path() == original && t.time_deleted >= item.deleted_at - 1)
            .max_by_key(|t| t.time_deleted)
            .ok_or("missing")?;
        trash::os_limited::restore_all([found]).map_err(|e| e.to_string())
    }
}
