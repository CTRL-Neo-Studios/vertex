//! Text search over a workspace's notes, for the chat's `searchNotes` tool: Rust walks and reads the files, so a vault's
//! contents never cross to the webview in bulk.

use crate::ai::blocking;
use crate::chats::snippet;
use crate::state::workspace_root;
use serde::Serialize;
use std::fs;
use std::path::Path;

const LIMIT: usize = 20;
/// The plain-text notes (`isPlainTextFile` in shared/utils/fs/filenames.ts).
const EXTENSIONS: [&str; 2] = ["md", "txt"];

#[derive(Serialize, Debug, PartialEq)]
pub struct NoteHit {
    /// Workspace-relative, `/`-separated.
    path: String,
    /// The text around the first match; `None` when only the path matched.
    snippet: Option<String>,
}

/// Notes whose path or text contains `query` (case-insensitive), in path order, at most `LIMIT`. Like the index, it
/// skips every dot-name (`.vertex`, `.git`, …).
// ponytail: first matches in path order; rank by match count when vaults outgrow 20 useful hits.
fn search(root: &Path, query: &str) -> Vec<NoteHit> {
    let needle = query.trim().to_lowercase();
    let mut hits = Vec::new();
    if !needle.is_empty() {
        walk(root, root, &needle, &mut hits);
    }
    hits
}

fn walk(root: &Path, dir: &Path, needle: &str, hits: &mut Vec<NoteHit>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if hits.len() >= LIMIT {
            return;
        }
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            walk(root, &path, needle, hits);
            continue;
        }
        let note = path.extension().and_then(|e| e.to_str()).is_some_and(|e| EXTENSIONS.contains(&e.to_lowercase().as_str()));
        if !note {
            continue;
        }
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        let in_text = fs::read_to_string(&path).ok().and_then(|text| snippet(&text, needle));
        if in_text.is_some() || relative.to_lowercase().contains(needle) {
            hits.push(NoteHit { path: relative, snippet: in_text });
        }
    }
}

#[tauri::command]
pub async fn notes_search(root: String, query: String) -> Result<Vec<NoteHit>, String> {
    blocking(move || Ok(search(workspace_root(&root)?, &query))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_text_or_path_case_insensitively_skipping_dot_names_and_other_files() {
        let root = std::env::temp_dir().join(format!("vertex-notes-{}", uuid::Uuid::new_v4()));
        for (path, text) in [
            ("a.md", "The Gilded Kraken inn."),
            ("Kraken lore.md", "No match in here."),
            ("sub/b.txt", "kraken again"),
            ("sub/c.md", "nothing"),
            ("image.png", "kraken"),
            (".vertex/chats/x.md", "kraken"),
        ] {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        let hits = search(&root, " KRAKEN ");
        assert_eq!(
            hits,
            vec![
                NoteHit { path: "Kraken lore.md".into(), snippet: None },
                NoteHit { path: "a.md".into(), snippet: Some("The Gilded Kraken inn.".into()) },
                NoteHit { path: "sub/b.txt".into(), snippet: Some("kraken again".into()) },
            ]
        );
        assert!(search(&root, "  ").is_empty());
        fs::remove_dir_all(root).unwrap();
    }
}
