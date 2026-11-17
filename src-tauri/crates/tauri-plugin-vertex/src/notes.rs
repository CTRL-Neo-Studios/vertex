//! `search_notes`, text search over a workspace's notes: a host service for every plugin, under the chat's
//! `searchNotes` tool. Rust walks and reads the files, so a vault's contents never cross to the webview in bulk.

use crate::api::blocking;
use crate::state::workspace_root;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path};

/// The plain-text notes (`isPlainTextFile` in shared/utils/fs/filenames.ts).
const EXTENSIONS: [&str; 2] = ["md", "txt"];
/// Characters of context kept before and after a search match.
const SNIPPET_BEFORE: usize = 40;
const SNIPPET_AFTER: usize = 80;

/// `text` around the first case-insensitive match of `needle` (already lowercased), on one line; `None` without one.
/// Counts characters, not bytes, so the cut never splits one.
pub fn snippet(text: &str, needle: &str) -> Option<String> {
    let lower = text.to_lowercase();
    let at = lower[..lower.find(needle)?].chars().count();
    let chars: Vec<char> = text.chars().collect();
    let start = at.saturating_sub(SNIPPET_BEFORE);
    let end = (at + needle.chars().count() + SNIPPET_AFTER).min(chars.len());
    let body: String = chars[start.min(end)..end].iter().collect();
    let body = body.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(format!("{}{body}{}", if start > 0 { "…" } else { "" }, if end < chars.len() { "…" } else { "" }))
}

/// `search_notes`' options (`NoteSearchOptions` in `shared/plugin/api.ts`); all optional.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    regex: bool,
    case_sensitive: bool,
    /// Workspace-relative.
    folder: Option<String>,
    context: Option<usize>,
    limit: Option<usize>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct NoteHit {
    /// Workspace-relative, `/`-separated.
    path: String,
    /// 1-based; `None` when the path matched.
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<usize>,
    /// The matching line (with `context` lines around it); `None` when the path matched.
    #[serde(skip_serializing_if = "Option::is_none")]
    snippet: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct NoteSearch {
    hits: Vec<NoteHit>,
    /// Hits past the limit.
    more: usize,
}

/// A context line longer than this is cut, so one minified line can't fill the result.
const LINE_CHARS: usize = 300;

/// The text one hit shows: the matching line trimmed around the match, or with `context` lines on each side.
fn hit_text(lines: &[&str], at: usize, matcher: &Regex, context: usize) -> String {
    if context == 0 {
        let line = lines[at];
        let start = matcher.find(line).map_or(0, |m| line[..m.start()].chars().count());
        let chars: Vec<char> = line.chars().collect();
        let from = start.saturating_sub(SNIPPET_BEFORE);
        let to = (start + SNIPPET_BEFORE + SNIPPET_AFTER).min(chars.len());
        let body: String = chars[from..to].iter().collect();
        return format!("{}{}{}", if from > 0 { "…" } else { "" }, body.trim(), if to < chars.len() { "…" } else { "" });
    }
    let cut = |line: &str| if line.chars().count() > LINE_CHARS { format!("{}…", line.chars().take(LINE_CHARS).collect::<String>()) } else { line.to_owned() };
    lines[at.saturating_sub(context)..(at + context + 1).min(lines.len())].iter().map(|l| cut(l)).collect::<Vec<_>>().join("\n")
}

/// Notes under `options.folder` whose path or lines match `query`, in path order then line order: a note whose path
/// matches gives one hit without a line, each matching line one hit. At most `limit` hits; `more` counts the rest.
/// Like the index, it skips every dot-name (`.vertex`, `.git`, …).
fn search(root: &Path, query: &str, options: &SearchOptions) -> Result<NoteSearch, String> {
    let query = if options.regex { query.to_owned() } else { regex::escape(query.trim()) };
    let mut found = NoteSearch { hits: Vec::new(), more: 0 };
    if query.is_empty() {
        return Ok(found);
    }
    let matcher = RegexBuilder::new(&query).case_insensitive(!options.case_sensitive).build().map_err(|e| e.to_string())?;
    let folder = options.folder.as_deref().unwrap_or("").trim_matches('/');
    if Path::new(folder).components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("\"{folder}\" isn't a folder of the workspace"));
    }
    let limit = options.limit.unwrap_or(20).clamp(1, 200);
    let context = options.context.unwrap_or(0).min(5);
    walk(root, &root.join(folder), &mut |relative, text| {
        let mut add = |hit: NoteHit| if found.hits.len() < limit { found.hits.push(hit) } else { found.more += 1 };
        if matcher.is_match(relative) {
            add(NoteHit { path: relative.to_owned(), line: None, snippet: None });
        }
        let lines: Vec<&str> = text.lines().collect();
        for (at, line) in lines.iter().enumerate() {
            if matcher.is_match(line) {
                add(NoteHit { path: relative.to_owned(), line: Some(at + 1), snippet: Some(hit_text(&lines, at, &matcher, context)) });
            }
        }
    });
    Ok(found)
}

/// Every note under `dir`, in path order, with its workspace-relative path and text.
fn walk(root: &Path, dir: &Path, visit: &mut impl FnMut(&str, &str)) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let path = entry.path();
        if entry.file_type().is_ok_and(|t| t.is_dir()) {
            walk(root, &path, visit);
            continue;
        }
        let note = path.extension().and_then(|e| e.to_str()).is_some_and(|e| EXTENSIONS.contains(&e.to_lowercase().as_str()));
        if !note {
            continue;
        }
        let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
        visit(&relative, &fs::read_to_string(&path).unwrap_or_default());
    }
}

#[tauri::command]
pub async fn search_notes(root: String, query: String, options: Option<SearchOptions>) -> Result<NoteSearch, String> {
    blocking(move || search(workspace_root(&root)?, &query, &options.unwrap_or_default())).await
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault(files: &[(&str, &str)]) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("vertex-notes-{}", uuid::Uuid::new_v4()));
        for (path, text) in files {
            let file = root.join(path);
            fs::create_dir_all(file.parent().unwrap()).unwrap();
            fs::write(file, text).unwrap();
        }
        root
    }

    fn hit(path: &str, line: Option<usize>, snippet: Option<&str>) -> NoteHit {
        NoteHit { path: path.into(), line, snippet: snippet.map(Into::into) }
    }

    #[test]
    fn matches_paths_and_lines_case_insensitively_skipping_dot_names_and_other_files() {
        let root = vault(&[
            ("a.md", "Intro\nThe Gilded Kraken inn.\nkraken twice"),
            ("Kraken lore.md", "No match in here."),
            ("sub/b.txt", "kraken again"),
            ("sub/c.md", "nothing"),
            ("image.png", "kraken"),
            (".vertex/chats/x.md", "kraken"),
        ]);
        let found = search(&root, " KRAKEN ", &SearchOptions::default()).unwrap();
        assert_eq!(
            found.hits,
            vec![
                hit("Kraken lore.md", None, None),
                hit("a.md", Some(2), Some("The Gilded Kraken inn.")),
                hit("a.md", Some(3), Some("kraken twice")),
                hit("sub/b.txt", Some(1), Some("kraken again")),
            ]
        );
        assert_eq!(found.more, 0);
        assert!(search(&root, "  ", &SearchOptions::default()).unwrap().hits.is_empty());
        // Plain text stays literal: "." matches a dot only.
        assert_eq!(search(&root, "inn.", &SearchOptions::default()).unwrap().hits.len(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn takes_a_regex_a_folder_case_context_and_a_limit() {
        let root = vault(&[("a.md", "one\nTwo 2\nthree\nfour 4"), ("sub/b.md", "two 22\nfive")]);
        let opts = |o: SearchOptions| search(&root, r"\w+ \d+", &SearchOptions { regex: true, ..o }).unwrap();
        assert_eq!(opts(SearchOptions::default()).hits.iter().map(|h| (h.path.as_str(), h.line)).collect::<Vec<_>>(), [("a.md", Some(2)), ("a.md", Some(4)), ("sub/b.md", Some(1))]);
        assert_eq!(opts(SearchOptions { folder: Some("sub/".into()), ..Default::default() }).hits, [hit("sub/b.md", Some(1), Some("two 22"))]);
        let limited = opts(SearchOptions { limit: Some(1), ..Default::default() });
        assert_eq!((limited.hits.len(), limited.more), (1, 2));
        assert_eq!(opts(SearchOptions { context: Some(1), limit: Some(1), ..Default::default() }).hits[0].snippet.as_deref(), Some("one\nTwo 2\nthree"));
        let cased = search(&root, "two", &SearchOptions { case_sensitive: true, ..Default::default() }).unwrap();
        assert_eq!(cased.hits, [hit("sub/b.md", Some(1), Some("two 22"))]);
        assert!(search(&root, "(", &SearchOptions { regex: true, ..Default::default() }).is_err());
        assert!(search(&root, "x", &SearchOptions { folder: Some("../up".into()), ..Default::default() }).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
