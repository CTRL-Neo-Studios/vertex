//! Where a community plugin comes from and what's newer there (Plugin Architecture Plan, C2b). A source is one string
//! (`plugins.sources.<id>`): a Git repository with what to take from it (`git+https://host/o/r#releases`,
//! `#branch:<b>`, `#tag:<t>`, `#commit:<sha>`), or a `.zip` by URL. Everything is HTTPS (`http` only on this computer),
//! with no Git client and no forge API: a repository's refs come from Git's smart HTTP (`<repo>/info/refs`), its files
//! from the archive and release URLs GitHub, GitLab, Gitea and Forgejo serve, each form tried in turn.

use serde::Serialize;
use std::io::Write;
use std::path::Path;
use std::time::Duration;

/// A download larger than this is refused.
pub(crate) const MAX_BYTES: u64 = 128 * 1024 * 1024;
/// What a plugin's release carries (the SDK's `vertex({pack: true})` writes it).
const RELEASE_ASSET: &str = "plugin.zip";
/// How many of the newest version tags are tried for a release with a `plugin.zip`.
const RELEASES_TRIED: usize = 3;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Pick {
    Releases,
    Branch(String),
    Tag(String),
    Commit(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Source {
    /// `repo`: `https://host/path`, without `.git` or a trailing `/`.
    Git { repo: String, pick: Pick },
    Zip { url: String },
}

/// `https`, or `http` to this computer (a local forge, tests): over plain `http` elsewhere anyone on the way could swap
/// the code.
pub(crate) fn allowed_url(url: &str) -> Result<(), String> {
    let parsed = url::Url::parse(url).map_err(|_| format!("{url:?} isn't a URL"))?;
    let local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    match parsed.scheme() {
        "https" => Ok(()),
        "http" if local => Ok(()),
        _ => Err(format!("{url:?}: only https (http only on this computer)")),
    }
}

fn is_sha(s: &str) -> bool {
    s.len() == 40 && s.bytes().all(|b| b.is_ascii_hexdigit())
}

impl Source {
    /// A source string as stored.
    pub(crate) fn parse(source: &str) -> Result<Source, String> {
        if let Some(rest) = source.strip_prefix("git+") {
            let (repo, pick) = rest.split_once('#').unwrap_or((rest, "releases"));
            allowed_url(repo)?;
            let pick = match pick.split_once(':') {
                None if pick == "releases" => Pick::Releases,
                Some(("branch", b)) if !b.is_empty() => Pick::Branch(b.to_owned()),
                Some(("tag", t)) if !t.is_empty() => Pick::Tag(t.to_owned()),
                Some(("commit", c)) if is_sha(c) => Pick::Commit(c.to_ascii_lowercase()),
                _ => return Err(format!("{source:?}: what to take is `releases`, `branch:<b>`, `tag:<t>` or `commit:<sha>`")),
            };
            return Ok(Source::Git { repo: repo.trim_end_matches('/').trim_end_matches(".git").to_owned(), pick });
        }
        allowed_url(source)?;
        if !url::Url::parse(source).is_ok_and(|u| u.path().to_ascii_lowercase().ends_with(".zip")) {
            return Err(format!("{source:?} is neither a Git source (`git+https://…`) nor a .zip URL"));
        }
        Ok(Source::Zip { url: source.to_owned() })
    }

    pub(crate) fn to_source_string(&self) -> String {
        match self {
            Source::Zip { url } => url.clone(),
            Source::Git { repo, pick } => format!("git+{repo}#{}", match pick {
                Pick::Releases => "releases".to_owned(),
                Pick::Branch(b) => format!("branch:{b}"),
                Pick::Tag(t) => format!("tag:{t}"),
                Pick::Commit(c) => format!("commit:{c}"),
            }),
        }
    }

    /// What two installs compare to say whether they came from the same place: the repository (any pick), or the URL.
    pub(crate) fn origin(&self) -> String {
        match self {
            Source::Git { repo, .. } => origin_of_repo(repo),
            Source::Zip { url } => url.clone(),
        }
    }
}

/// A repository URL as an origin: lowercase host and path, no scheme, `.git` or trailing `/` (`github.com/o/r`).
pub(crate) fn origin_of_repo(repo: &str) -> String {
    let repo = repo.trim().trim_end_matches('/').trim_end_matches(".git");
    repo.split_once("://").map_or(repo, |(_, rest)| rest).to_ascii_lowercase()
}

/// A link as people copy it: a repository, a branch, a release or a tag page, `owner/repo` (GitHub), with `#<ref>`
/// (a branch, or a commit) or `#releases`; a `.zip` URL; or a source string. A repository alone means its releases.
pub(crate) fn from_link(link: &str) -> Result<Source, String> {
    let link = link.trim();
    if link.starts_with("git+") {
        return Source::parse(link);
    }
    let shorthand = link.split('#').next().unwrap_or_default();
    let link = if !link.contains("://") && shorthand.split('/').count() == 2 && !shorthand.contains(' ') {
        format!("https://github.com/{link}")
    } else {
        link.to_owned()
    };
    let (url, fragment) = link.split_once('#').map_or((link.as_str(), None), |(u, f)| (u, Some(f)));
    allowed_url(url)?;
    if url::Url::parse(url).is_ok_and(|u| u.path().to_ascii_lowercase().ends_with(".zip")) {
        return Ok(Source::Zip { url: url.to_owned() });
    }
    let parsed = url::Url::parse(url).map_err(|e| e.to_string())?;
    let segments: Vec<&str> = parsed.path().trim_matches('/').split('/').filter(|s| !s.is_empty()).collect();
    // Where the repository's path ends: GitLab's `-`, or a page of the repository.
    let end = segments.iter().position(|s| matches!(*s, "-" | "tree" | "src" | "releases" | "tags" | "commit" | "blob")).unwrap_or(segments.len());
    if end < 2 {
        return Err(format!("{url:?} doesn't name a repository (host/owner/repository)"));
    }
    let base = format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or_default());
    let base = parsed.port().map_or(base.clone(), |port| format!("{base}:{port}"));
    let repo = format!("{base}/{}", segments[..end].join("/")).trim_end_matches(".git").to_owned();
    let rest: Vec<&str> = segments[end..].iter().copied().skip_while(|s| *s == "-").collect();
    let page = |from: usize| rest[from.min(rest.len())..].join("/");
    let mut pick = match rest.as_slice() {
        ["tree", ..] => Pick::Branch(page(1)),
        ["src", "branch", ..] => Pick::Branch(page(2)),
        ["src", "tag", ..] | ["releases", "tag", ..] => Pick::Tag(page(2)),
        ["tags", ..] => Pick::Tag(page(1)),
        ["releases", tag, ..] if *tag != "latest" => Pick::Tag(page(1)),
        ["commit", sha, ..] if is_sha(sha) => Pick::Commit(sha.to_ascii_lowercase()),
        _ => Pick::Releases,
    };
    if matches!(&pick, Pick::Branch(b) | Pick::Tag(b) if b.is_empty()) {
        pick = Pick::Releases;
    }
    if let Some(fragment) = fragment.filter(|f| !f.is_empty()) {
        pick = match Source::parse(&format!("git+{repo}#{fragment}")) {
            Ok(Source::Git { pick, .. }) => pick,
            _ if is_sha(fragment) => Pick::Commit(fragment.to_ascii_lowercase()),
            _ => Pick::Branch(fragment.to_owned()),
        };
    }
    Ok(Source::Git { repo, pick })
}

/// A repository's refs, as `git ls-remote` gives them.
#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Refs {
    /// The default branch (`HEAD`'s target).
    pub default_branch: Option<String>,
    /// Name → commit.
    pub branches: Vec<(String, String)>,
    /// Name → commit (an annotated tag's peeled commit).
    pub tags: Vec<(String, String)>,
}

/// Reads Git's smart HTTP ref advertisement (`info/refs?service=git-upload-pack`): pkt-lines of `<sha> <ref>`, the
/// first with its capabilities (`symref=HEAD:refs/heads/<default>`) after a NUL.
pub(crate) fn parse_refs(body: &[u8]) -> Result<Refs, String> {
    let mut refs = Refs::default();
    let mut at = 0;
    while at + 4 <= body.len() {
        let len = std::str::from_utf8(&body[at..at + 4]).ok().and_then(|h| usize::from_str_radix(h, 16).ok()).ok_or("not a Git ref advertisement")?;
        if len == 0 {
            at += 4;
            continue;
        }
        if len < 4 || at + len > body.len() {
            return Err("a truncated Git ref advertisement".into());
        }
        let line = String::from_utf8_lossy(&body[at + 4..at + len]);
        at += len;
        let line = line.trim_end_matches('\n');
        if line.starts_with('#') {
            continue;
        }
        let (refline, caps) = line.split_once('\0').unwrap_or((line, ""));
        if let Some(target) = caps.split(' ').find_map(|c| c.strip_prefix("symref=HEAD:refs/heads/")) {
            refs.default_branch = Some(target.to_owned());
        }
        let Some((sha, name)) = refline.split_once(' ') else { continue };
        if let Some(branch) = name.strip_prefix("refs/heads/") {
            refs.branches.push((branch.to_owned(), sha.to_owned()));
        } else if let Some(tag) = name.strip_prefix("refs/tags/") {
            match tag.strip_suffix("^{}") {
                // The peeled line follows its tag's: the commit replaces the tag object.
                Some(peeled) => {
                    if let Some(entry) = refs.tags.iter_mut().find(|(t, _)| t == peeled) {
                        entry.1 = sha.to_owned();
                    }
                }
                None => refs.tags.push((tag.to_owned(), sha.to_owned())),
            }
        }
    }
    Ok(refs)
}

/// A release tag's version (`1.2.0`, `v1.2.0`), newest first; pre-releases (`1.2.0-beta`) and other tags aren't.
fn version_of(tag: &str) -> Option<Vec<u64>> {
    let v = tag.strip_prefix('v').unwrap_or(tag);
    let parts: Option<Vec<u64>> = v.split('.').map(|p| p.parse().ok()).collect();
    parts.filter(|p| !p.is_empty())
}

pub(crate) fn release_candidates(tags: &[(String, String)]) -> Vec<&(String, String)> {
    let mut versions: Vec<_> = tags.iter().filter_map(|t| version_of(&t.0).map(|v| (v, t))).collect();
    versions.sort_by(|a, b| b.0.cmp(&a.0));
    versions.into_iter().map(|(_, t)| t).collect()
}

/// What a source resolved to: its kind, the tag or branch, the commit, and the URLs its files may be at (tried in turn).
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Resolved {
    pub source: String,
    pub origin: String,
    /// `release`, `branch`, `tag`, `commit` or `zip`.
    pub kind: &'static str,
    pub name: Option<String>,
    pub commit: Option<String>,
    #[serde(skip)]
    pub urls: Vec<String>,
}

pub(crate) fn client() -> Result<reqwest::Client, String> {
    crate::api::install_crypto();
    reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("Vertex")
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 10 {
                attempt.error("too many redirects")
            } else if allowed_url(attempt.url().as_str()).is_err() {
                attempt.error("a redirect to plain http")
            } else {
                attempt.follow()
            }
        }))
        .build()
        .map_err(|e| e.to_string())
}

/// The repository's refs: the URL as given first (sr.ht refuses `.git`), then with `.git`.
pub(crate) async fn fetch_refs(client: &reqwest::Client, repo: &str) -> Result<Refs, String> {
    let mut last = String::new();
    for base in [repo.to_owned(), format!("{repo}.git")] {
        match client.get(format!("{base}/info/refs?service=git-upload-pack")).send().await {
            Ok(r) if r.status().is_success() => return parse_refs(&r.bytes().await.map_err(|e| e.to_string())?),
            Ok(r) => last = format!("{}", r.status()),
            Err(e) => last = e.to_string(),
        }
    }
    Err(format!("{repo} isn't a public Git repository Vertex can read ({last})"))
}

/// Whether `url` answers (a release asset): HEAD, or GET for a server that refuses HEAD.
async fn exists(client: &reqwest::Client, url: &str) -> bool {
    match client.head(url).send().await {
        Ok(r) if r.status().is_success() => true,
        Ok(r) if r.status() == reqwest::StatusCode::METHOD_NOT_ALLOWED => client.get(url).send().await.is_ok_and(|r| r.status().is_success()),
        _ => false,
    }
}

/// A release's `plugin.zip`, in GitHub's and Forgejo's form, then GitLab's.
fn release_urls(repo: &str, tag: &str) -> [String; 2] {
    [format!("{repo}/releases/download/{tag}/{RELEASE_ASSET}"), format!("{repo}/-/releases/{tag}/downloads/{RELEASE_ASSET}")]
}

/// A commit's files as a `.zip`, in GitHub's and Forgejo's form, then GitLab's.
fn archive_urls(repo: &str, commit: &str) -> Vec<String> {
    vec![format!("{repo}/archive/{commit}.zip"), format!("{repo}/-/archive/{commit}/plugin.zip")]
}

/// The newest version tag whose release has a `plugin.zip`, with its URL.
pub(crate) async fn newest_release(client: &reqwest::Client, repo: &str, refs: &Refs) -> Option<(String, String, String)> {
    for (tag, commit) in release_candidates(&refs.tags).into_iter().take(RELEASES_TRIED) {
        for url in release_urls(repo, tag) {
            if exists(client, &url).await {
                return Some((tag.clone(), commit.clone(), url));
            }
        }
    }
    None
}

/// What a source points at now: one request for a `.zip` URL's source (none: the bytes say), the refs (and a probe per
/// release tag tried) for a repository.
pub(crate) async fn resolve(client: &reqwest::Client, source: &Source) -> Result<Resolved, String> {
    let resolved = |kind, name: Option<&str>, commit: Option<&str>, urls: Vec<String>| Resolved {
        source: source.to_source_string(),
        origin: source.origin(),
        kind,
        name: name.map(str::to_owned),
        commit: commit.map(str::to_owned),
        urls,
    };
    let Source::Git { repo, pick } = source else {
        let Source::Zip { url } = source else { unreachable!() };
        return Ok(resolved("zip", None, None, vec![url.clone()]));
    };
    if let Pick::Commit(sha) = pick {
        return Ok(resolved("commit", None, Some(sha), archive_urls(repo, sha)));
    }
    let refs = fetch_refs(client, repo).await?;
    match pick {
        Pick::Releases => {
            let (tag, commit, url) = newest_release(client, repo, &refs).await.ok_or_else(|| {
                format!("{repo} has no release with a {RELEASE_ASSET}: install one of its branches holding the built plugin instead")
            })?;
            Ok(resolved("release", Some(&tag), Some(&commit), vec![url]))
        }
        Pick::Branch(branch) => {
            let (_, commit) = refs.branches.iter().find(|(b, _)| b == branch).ok_or_else(|| format!("{repo} has no branch {branch:?}"))?;
            Ok(resolved("branch", Some(branch), Some(commit), archive_urls(repo, commit)))
        }
        Pick::Tag(tag) => {
            let (_, commit) = refs.tags.iter().find(|(t, _)| t == tag).ok_or_else(|| format!("{repo} has no tag {tag:?}"))?;
            // A tag with a release is installed from its `plugin.zip`; otherwise from the tagged commit's files.
            let mut urls = release_urls(repo, tag).to_vec();
            urls.extend(archive_urls(repo, commit));
            Ok(resolved("tag", Some(tag), Some(commit), urls))
        }
        Pick::Commit(_) => unreachable!(),
    }
}

/// Downloads to `to` from the first of `urls` that answers, up to [`MAX_BYTES`]; returns the URL and the bytes' SHA-256.
pub(crate) async fn download(client: &reqwest::Client, urls: &[String], to: &Path) -> Result<(String, String), String> {
    use sha2::{Digest, Sha256};
    let mut last = String::from("nothing to download");
    for url in urls {
        allowed_url(url)?;
        let mut response = match client.get(url).send().await {
            Ok(r) if r.status().is_success() => r,
            Ok(r) => {
                last = format!("{url}: {}", r.status());
                continue;
            }
            Err(e) => {
                last = format!("{url}: {e}");
                continue;
            }
        };
        let mut out = std::fs::File::create(to).map_err(|e| e.to_string())?;
        let (mut total, mut hash) = (0u64, Sha256::new());
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            total += chunk.len() as u64;
            if total > MAX_BYTES {
                return Err(format!("the download is larger than {} MB", MAX_BYTES / 1024 / 1024));
            }
            hash.update(&chunk);
            out.write_all(&chunk).map_err(|e| e.to_string())?;
        }
        return Ok((url.clone(), hash.finalize().iter().map(|b| format!("{b:02x}")).collect()));
    }
    Err(last)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    fn git(repo: &str, pick: Pick) -> Source {
        Source::Git { repo: repo.to_owned(), pick }
    }

    /// A forge on this computer: GitHub's URL forms under `/gh/o/r`, GitLab's under `/gl/g/r`. Logs each request.
    pub(crate) fn local_forge() -> (String, std::sync::Arc<std::sync::Mutex<Vec<String>>>) {
        use std::io::{BufRead, BufReader};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let log = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        let seen = log.clone();
        let (a, b) = ("a".repeat(40), "b".repeat(40));
        let refs = advertisement("dev", &[("dev", &a), ("dist", &b)], &[("v0.1.0", &a, None), ("v0.2.0", &b, None)]);
        std::thread::spawn(move || {
            for stream in listener.incoming().flatten() {
                let mut reader = BufReader::new(&stream);
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                while let Ok(n) = reader.read_line(&mut String::new()) {
                    if n <= 2 {
                        break;
                    }
                }
                let mut parts = line.split(' ');
                let (method, path) = (parts.next().unwrap_or_default().to_owned(), parts.next().unwrap_or_default().to_owned());
                seen.lock().unwrap().push(format!("{method} {path}"));
                let body: Option<Vec<u8>> = match path.split('?').next().unwrap() {
                    "/gh/o/r/info/refs" | "/gl/g/r/info/refs" => Some(refs.clone()),
                    "/gh/o/r/releases/download/v0.2.0/plugin.zip" => Some(b"release".to_vec()),
                    "/gl/g/r/-/releases/v0.2.0/downloads/plugin.zip" => Some(b"gitlab release".to_vec()),
                    p if p == format!("/gh/o/r/archive/{b}.zip") => Some(b"archive".to_vec()),
                    p if p == format!("/gl/g/r/-/archive/{b}/plugin.zip") => Some(b"gitlab archive".to_vec()),
                    _ => None,
                };
                let mut stream = stream;
                let (status, body) = body.map_or(("404 Not Found", Vec::new()), |b| ("200 OK", b));
                let _ = write!(stream, "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len());
                if method != "HEAD" {
                    let _ = stream.write_all(&body);
                }
            }
        });
        (base, log)
    }

    #[test]
    fn sources_resolve_and_download_on_each_forges_urls() {
        let (base, log) = local_forge();
        let client = client().unwrap();
        let dir = std::env::temp_dir().join(format!("vertex-sources-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        tauri::async_runtime::block_on(async {
            let release = resolve(&client, &from_link(&format!("{base}/gh/o/r")).unwrap()).await.unwrap();
            assert_eq!((release.kind, release.name.as_deref(), release.commit), ("release", Some("v0.2.0"), Some("b".repeat(40))));
            let (_, sha) = download(&client, &release.urls, &dir.join("a.zip")).await.unwrap();
            assert_eq!(std::fs::read(dir.join("a.zip")).unwrap(), b"release");
            assert_eq!(sha.len(), 64);

            let branch = resolve(&client, &from_link(&format!("{base}/gh/o/r/tree/dist")).unwrap()).await.unwrap();
            download(&client, &branch.urls, &dir.join("b.zip")).await.unwrap();
            assert_eq!(std::fs::read(dir.join("b.zip")).unwrap(), b"archive");

            // GitLab: GitHub's forms answer 404, its own answer.
            let gitlab = resolve(&client, &from_link(&format!("{base}/gl/g/r")).unwrap()).await.unwrap();
            download(&client, &gitlab.urls, &dir.join("c.zip")).await.unwrap();
            assert_eq!(std::fs::read(dir.join("c.zip")).unwrap(), b"gitlab release");
            let gl_branch = resolve(&client, &from_link(&format!("{base}/gl/g/r/-/tree/dist")).unwrap()).await.unwrap();
            download(&client, &gl_branch.urls, &dir.join("d.zip")).await.unwrap();
            assert_eq!(std::fs::read(dir.join("d.zip")).unwrap(), b"gitlab archive");

            let missing = resolve(&client, &from_link(&format!("{base}/gh/o/r#nope")).unwrap()).await;
            assert!(missing.unwrap_err().contains("no branch"));
            // A pinned commit needs no request to resolve.
            let before = log.lock().unwrap().len();
            resolve(&client, &from_link(&format!("{base}/gh/o/r#{}", "a".repeat(40))).unwrap()).await.unwrap();
            assert_eq!(log.lock().unwrap().len(), before);
        });
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn source_strings_read_back_as_written() {
        for s in ["git+https://github.com/o/r#releases", "git+https://gitlab.com/g/sub/r#branch:main", "git+https://codeberg.org/o/r#tag:v1.0.0",
            "git+https://github.com/o/r#commit:0123456789abcdef0123456789abcdef01234567", "https://example.com/files/plugin.zip"] {
            assert_eq!(Source::parse(s).unwrap().to_source_string(), s);
        }
        assert_eq!(Source::parse("git+https://github.com/o/r.git").unwrap(), git("https://github.com/o/r", Pick::Releases));
        assert!(Source::parse("git+https://github.com/o/r#commit:abc").is_err());
        assert!(Source::parse("git+http://example.com/o/r").is_err(), "plain http elsewhere");
        assert!(Source::parse("git+http://127.0.0.1:8080/o/r#releases").is_ok(), "http on this computer");
        assert!(Source::parse("https://example.com/notes.txt").is_err());
    }

    #[test]
    fn links_as_people_copy_them() {
        let cases = [
            ("Type-32/test-vertex-plugin", git("https://github.com/Type-32/test-vertex-plugin", Pick::Releases)),
            ("https://github.com/o/r", git("https://github.com/o/r", Pick::Releases)),
            ("https://github.com/o/r.git", git("https://github.com/o/r", Pick::Releases)),
            ("https://github.com/o/r/tree/feature/x", git("https://github.com/o/r", Pick::Branch("feature/x".into()))),
            ("https://gitlab.com/g/sub/r/-/tree/dev", git("https://gitlab.com/g/sub/r", Pick::Branch("dev".into()))),
            ("https://codeberg.org/o/r/src/branch/dist", git("https://codeberg.org/o/r", Pick::Branch("dist".into()))),
            ("https://github.com/o/r/releases", git("https://github.com/o/r", Pick::Releases)),
            ("https://github.com/o/r/releases/latest", git("https://github.com/o/r", Pick::Releases)),
            ("https://github.com/o/r/releases/tag/v1.2.0", git("https://github.com/o/r", Pick::Tag("v1.2.0".into()))),
            ("https://gitlab.com/g/r/-/releases/v1.2.0", git("https://gitlab.com/g/r", Pick::Tag("v1.2.0".into()))),
            ("https://github.com/o/r#dist", git("https://github.com/o/r", Pick::Branch("dist".into()))),
            ("https://github.com/o/r#tag:v1", git("https://github.com/o/r", Pick::Tag("v1".into()))),
            ("https://git.example.com:3000/o/r", git("https://git.example.com:3000/o/r", Pick::Releases)),
            ("https://example.com/plugin.zip", Source::Zip { url: "https://example.com/plugin.zip".into() }),
        ];
        for (link, expected) in cases {
            assert_eq!(from_link(link).unwrap(), expected, "{link}");
        }
        assert!(from_link("https://github.com/o").is_err(), "no repository");
        assert!(from_link("http://github.com/o/r").is_err(), "plain http");
    }

    #[test]
    fn origins_ignore_how_the_repository_was_written() {
        assert_eq!(from_link("https://GitHub.com/O/R.git").unwrap().origin(), "github.com/o/r");
        assert_eq!(from_link("o/r#dist").unwrap().origin(), from_link("https://github.com/o/r/releases").unwrap().origin());
        assert_ne!(from_link("https://github.com/o/r").unwrap().origin(), from_link("https://gitlab.com/o/r").unwrap().origin());
        assert_eq!(origin_of_repo("https://github.com/o/r/"), "github.com/o/r");
    }

    fn pkt(line: &str) -> Vec<u8> {
        format!("{:04x}{line}", line.len() + 4).into_bytes()
    }

    pub(super) fn advertisement(default: &str, branches: &[(&str, &str)], tags: &[(&str, &str, Option<&str>)]) -> Vec<u8> {
        let mut body = pkt("# service=git-upload-pack\n");
        body.extend(b"0000");
        let head = branches.iter().find(|(b, _)| *b == default).map_or("0".repeat(40), |(_, s)| (*s).to_owned());
        body.extend(pkt(&format!("{head} HEAD\0multi_ack symref=HEAD:refs/heads/{default} agent=git/2\n")));
        for (b, sha) in branches {
            body.extend(pkt(&format!("{sha} refs/heads/{b}\n")));
        }
        for (t, sha, peeled) in tags {
            body.extend(pkt(&format!("{sha} refs/tags/{t}\n")));
            if let Some(peeled) = peeled {
                body.extend(pkt(&format!("{peeled} refs/tags/{t}^{{}}\n")));
            }
        }
        body.extend(b"0000");
        body
    }

    #[test]
    fn refs_come_from_the_advertisement() {
        let (a, b, c, d) = ("a".repeat(40), "b".repeat(40), "c".repeat(40), "d".repeat(40));
        let refs = parse_refs(&advertisement("dev", &[("dev", &a), ("dist", &b)], &[("v0.1.0", &c, None), ("v0.2.0", &d, Some(&a))])).unwrap();
        assert_eq!(refs.default_branch.as_deref(), Some("dev"));
        assert_eq!(refs.branches, vec![("dev".to_owned(), a.clone()), ("dist".to_owned(), b)]);
        assert_eq!(refs.tags, vec![("v0.1.0".to_owned(), c), ("v0.2.0".to_owned(), a)], "an annotated tag is its commit");
        assert!(parse_refs(b"<html>").is_err());
    }

    #[test]
    fn the_newest_release_is_the_highest_version_tag() {
        let tags: Vec<(String, String)> = ["v0.9.0", "1.10.0", "v1.2.0", "2.0.0-beta.1", "nightly", "v1.10.1"].iter().map(|t| (t.to_string(), String::new())).collect();
        let order: Vec<&str> = release_candidates(&tags).iter().map(|t| t.0.as_str()).collect();
        assert_eq!(order, ["v1.10.1", "1.10.0", "v1.2.0", "v0.9.0"]);
    }
}
