//! Git for a workspace (see `app/utils/gitClient.ts`). Rust runs the installed `git` rather than a library, so the
//! user's config, credential helpers, SSH agent, hooks and LFS apply as in their terminal. Commands run in the
//! repository's top folder (which may sit above the workspace), and paths are relative to it, `/`-separated.

use crate::ai::blocking;
use crate::state::{workspace_root, AppState};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::ErrorKind;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, PoisonError};
use tauri::{AppHandle, Manager, Runtime};

/// Expected failures, matched by `GitError` in gitClient.ts; anything else is git's own message.
const MISSING: &str = "missing";
const NOT_REPO: &str = "not-repo";
const AUTH: &str = "auth";
const CONFLICT: &str = "conflict";
const REJECTED: &str = "rejected";
const NO_REMOTE: &str = "no-remote";
const NO_UPSTREAM: &str = "no-upstream";
const IDENTITY: &str = "identity";

/// Field and record separators in `log` / `for-each-ref` formats: never in names or messages.
const UNIT: char = '\x1f';
const RECORD: char = '\x1e';

#[derive(Default)]
pub struct Git {
    /// The git found for the configured path (`gitConfig.path`, `""` = look for one), so the search runs once.
    bin: Mutex<Option<(String, PathBuf)>>,
    /// One mutating operation at a time per repository (two would trip over `index.lock`); reads don't wait.
    locks: Mutex<HashMap<PathBuf, Arc<Mutex<()>>>>,
}

impl Git {
    fn lock(&self, top: &Path) -> Arc<Mutex<()>> {
        self.locks.lock().unwrap_or_else(PoisonError::into_inner).entry(top.to_path_buf()).or_default().clone()
    }
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitVersion {
    path: String,
    version: String,
}

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitStatus {
    /// The repository's top folder, as git prints it.
    top: String,
    /// The workspace's folder inside the repository (`notes/`), `""` when it is the top folder.
    prefix: String,
    /// `None` when detached.
    branch: Option<String>,
    /// `None` before the first commit.
    head: Option<String>,
    upstream: Option<String>,
    ahead: u32,
    behind: u32,
    /// A merge is in progress (`MERGE_HEAD`), whether or not its conflicts are resolved.
    merging: bool,
    files: Vec<GitFile>,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitFile {
    path: String,
    /// The old path of a staged rename or copy.
    orig_path: Option<String>,
    /// git's letters: `.` unchanged, `M`, `A`, `D`, `R`, `C`, `T`, `U` (unmerged), `?` untracked.
    index: char,
    worktree: char,
    conflicted: bool,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitCommit {
    id: String,
    parents: Vec<String>,
    author: String,
    email: String,
    /// Author time, Unix seconds.
    time: i64,
    /// Full names (`HEAD`, `refs/heads/main`, `refs/remotes/origin/main`, `refs/tags/v1`).
    refs: Vec<String>,
    subject: String,
    body: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GitChange {
    path: String,
    orig_path: Option<String>,
    /// `A`, `M`, `D`, `R`, `C` or `T`.
    status: char,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitBranch {
    /// `main` for a local branch, `origin/main` for a remote one.
    name: String,
    remote: bool,
    current: bool,
    upstream: Option<String>,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct GitRemote {
    name: String,
    url: String,
}

fn command(bin: &Path, cwd: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(args)
        .current_dir(cwd)
        // Never wait on a username or password prompt nobody can see.
        .env("GIT_TERMINAL_PROMPT", "0")
        // A status refresh never takes `index.lock` from under a commit.
        .env("GIT_OPTIONAL_LOCKS", "0")
        // English messages, so `classify` can read them.
        .env("LC_ALL", "C")
        .stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// git's stdout, or the failure as a `GitError` code or git's message.
fn run(bin: &Path, cwd: &Path, args: &[&str]) -> Result<String, String> {
    let out = command(bin, cwd, args)
        .output()
        .map_err(|e| if e.kind() == ErrorKind::NotFound { MISSING.to_owned() } else { e.to_string() })?;
    if out.status.success() {
        return Ok(String::from_utf8_lossy(&out.stdout).into_owned());
    }
    let stderr = String::from_utf8_lossy(&out.stderr);
    let stdout = String::from_utf8_lossy(&out.stdout);
    Err(classify(&format!("{stderr}\n{stdout}")))
}

fn classify(output: &str) -> String {
    let text = output.to_lowercase();
    let has = |needles: &[&str]| needles.iter().any(|n| text.contains(n));
    let code = if has(&["not a git repository"]) {
        NOT_REPO
    } else if has(&[
        "authentication failed",
        "could not read username",
        "could not read password",
        "terminal prompts disabled",
        "invalid username or password",
        "permission denied (publickey",
        "returned error: 401",
        "returned error: 403",
    ]) {
        AUTH
    } else if has(&["please tell me who you are", "unable to auto-detect email address", "empty ident name"]) {
        IDENTITY
    } else if has(&["conflict (", "automatic merge failed", "unmerged files", "fix conflicts"]) {
        CONFLICT
    } else if has(&["! [rejected]", "(fetch first)", "(non-fast-forward)"]) {
        REJECTED
    } else if has(&["no configured push destination"]) {
        NO_REMOTE
    } else if has(&["no tracking information", "has no upstream branch"]) {
        NO_UPSTREAM
    } else {
        return output.trim().to_owned();
    };
    code.to_owned()
}

/// The first usable git: the configured one alone (a wrong setting says so rather than running another git), else
/// the usual install places and `PATH`.
fn find_git(configured: &str) -> Option<PathBuf> {
    let candidates = if configured.is_empty() { search_path() } else { vec![PathBuf::from(configured)] };
    candidates.into_iter().find(|bin| usable(bin) && version(bin).is_some())
}

fn search_path() -> Vec<PathBuf> {
    let mut list = Vec::new();
    // An app opened from Finder gets launchd's PATH (`/usr/bin:/bin:…`), not the shell's.
    if cfg!(target_os = "macos") {
        list.extend(["/opt/homebrew/bin/git", "/usr/local/bin/git"].map(PathBuf::from));
    }
    let exe = if cfg!(windows) { "git.exe" } else { "git" };
    list.extend(std::env::var_os("PATH").iter().flat_map(std::env::split_paths).map(|dir| dir.join(exe)));
    list
}

fn usable(bin: &Path) -> bool {
    // macOS's /usr/bin/git is a stub until the developer tools are installed, and running it opens their installer.
    if cfg!(target_os = "macos") && bin == Path::new("/usr/bin/git") {
        return Command::new("/usr/bin/xcode-select")
            .arg("-p")
            .stdin(Stdio::null())
            .output()
            .is_ok_and(|o| o.status.success());
    }
    bin.is_file()
}

fn version(bin: &Path) -> Option<String> {
    let out = command(bin, &std::env::temp_dir(), &["--version"]).output().ok().filter(|o| o.status.success())?;
    let text = String::from_utf8_lossy(&out.stdout);
    Some(text.trim().trim_start_matches("git version ").to_owned())
}

/// A value git must not read as an option.
fn arg(value: &str) -> Result<&str, String> {
    if value.is_empty() || value.starts_with('-') {
        return Err(format!("{value:?} is not a valid name"));
    }
    Ok(value)
}

/// A path inside the repository: relative, no `.`/`..`, and not into `.git`.
fn relative(path: &str) -> Result<&str, String> {
    let ok = !path.is_empty()
        && Path::new(path)
            .components()
            .all(|c| matches!(c, Component::Normal(name) if !name.eq_ignore_ascii_case(".git")));
    if !ok {
        return Err(format!("{path:?} is not a path in the repository"));
    }
    Ok(path)
}

fn checked(paths: &[String]) -> Result<Vec<&str>, String> {
    paths.iter().map(|p| relative(p)).collect()
}

fn parse_status(out: &str) -> GitStatus {
    let mut status = GitStatus::default();
    let mut entries = out.split('\0');
    while let Some(entry) = entries.next() {
        if let Some(header) = entry.strip_prefix("# ") {
            let (key, value) = header.split_once(' ').unwrap_or((header, ""));
            match key {
                "branch.oid" => status.head = (value != "(initial)").then(|| value.to_owned()),
                "branch.head" => status.branch = (value != "(detached)").then(|| value.to_owned()),
                "branch.upstream" => status.upstream = Some(value.to_owned()),
                "branch.ab" => {
                    for count in value.split(' ') {
                        if let Some(n) = count.strip_prefix('+') {
                            status.ahead = n.parse().unwrap_or(0);
                        } else if let Some(n) = count.strip_prefix('-') {
                            status.behind = n.parse().unwrap_or(0);
                        }
                    }
                }
                _ => {}
            }
            continue;
        }
        // `1 XY sub mH mI mW hH hI path`, `2 … Xscore path\0origPath`, `u XY sub m1 m2 m3 mW h1 h2 h3 path`, `? path`.
        let (fields, conflicted) = match entry.as_bytes().first() {
            Some(b'1') => (9, false),
            Some(b'2') => (10, false),
            Some(b'u') => (11, true),
            Some(b'?') => {
                status.files.push(GitFile { path: entry[2..].to_owned(), orig_path: None, index: '?', worktree: '?', conflicted: false });
                continue;
            }
            _ => continue,
        };
        let parts: Vec<&str> = entry.splitn(fields, ' ').collect();
        let (Some(xy), Some(path)) = (parts.get(1), parts.get(fields - 1)) else { continue };
        let mut xy = xy.chars();
        let orig_path = if fields == 10 { entries.next().map(str::to_owned) } else { None };
        status.files.push(GitFile {
            path: (*path).to_owned(),
            orig_path,
            index: xy.next().unwrap_or('.'),
            worktree: xy.next().unwrap_or('.'),
            conflicted,
        });
    }
    status
}

fn parse_log(out: &str) -> Vec<GitCommit> {
    out.split(RECORD)
        .filter_map(|record| {
            let fields: Vec<&str> = record.splitn(8, UNIT).collect();
            let [id, parents, author, email, time, refs, subject, body] = fields[..] else { return None };
            Some(GitCommit {
                id: id.to_owned(),
                parents: parents.split_whitespace().map(str::to_owned).collect(),
                author: author.to_owned(),
                email: email.to_owned(),
                time: time.parse().unwrap_or(0),
                refs: parse_refs(refs),
                subject: subject.to_owned(),
                body: body.trim_end().to_owned(),
            })
        })
        .collect()
}

/// `%D` with `--decorate=full`: `HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1`.
fn parse_refs(decoration: &str) -> Vec<String> {
    decoration
        .split(", ")
        .filter(|d| !d.is_empty())
        .flat_map(|d| {
            let d = d.strip_prefix("tag: ").unwrap_or(d);
            match d.split_once(" -> ") {
                Some((head, branch)) => vec![head, branch],
                None => vec![d],
            }
        })
        .map(str::to_owned)
        .collect()
}

/// `--name-status -z`: `M\0path\0`, `R100\0old\0new\0`.
fn parse_name_status(out: &str) -> Vec<GitChange> {
    let mut parts = out.split('\0').map(|p| p.trim_start_matches('\n'));
    let mut changes = Vec::new();
    while let Some(code) = parts.next() {
        let Some(status) = code.chars().next() else { continue };
        let Some(first) = parts.next() else { break };
        let (path, orig_path) = if matches!(status, 'R' | 'C') {
            let Some(path) = parts.next() else { break };
            (path, Some(first.to_owned()))
        } else {
            (first, None)
        };
        changes.push(GitChange { path: path.to_owned(), orig_path, status });
    }
    changes
}

fn parse_branches(out: &str) -> Vec<GitBranch> {
    out.lines()
        .filter_map(|line| {
            let fields: Vec<&str> = line.split(UNIT).collect();
            let [name, head, upstream, symref] = fields[..] else { return None };
            if !symref.is_empty() {
                return None; // `origin/HEAD`
            }
            let (name, remote) = match name.strip_prefix("refs/heads/") {
                Some(name) => (name, false),
                None => (name.strip_prefix("refs/remotes/")?, true),
            };
            let upstream = (!upstream.is_empty()).then(|| {
                let short = upstream.strip_prefix("refs/remotes/").or_else(|| upstream.strip_prefix("refs/heads/"));
                short.unwrap_or(upstream).to_owned()
            });
            Some(GitBranch { name: name.to_owned(), remote, current: head == "*", upstream })
        })
        .collect()
}

fn parse_remotes(out: &str) -> Vec<GitRemote> {
    out.lines()
        .filter_map(|line| {
            let (name, rest) = line.split_once('\t')?;
            let url = rest.strip_suffix(" (fetch)")?;
            Some(GitRemote { name: name.to_owned(), url: url.to_owned() })
        })
        .collect()
}

/// Creates a repository in `root`, on `main` unless the user set `init.defaultBranch`, and adds the `ignore` lines
/// its `.gitignore` doesn't have yet.
fn init(bin: &Path, root: &Path, ignore: &[String]) -> Result<(), String> {
    let mut args = vec!["init", "-q"];
    if !command(bin, root, &["config", "--get", "init.defaultBranch"]).output().is_ok_and(|o| o.status.success()) {
        args.push("--initial-branch=main");
    }
    run(bin, root, &args)?;
    add_ignores(root, ignore)
}

/// Appends the patterns `root/.gitignore` doesn't list yet, keeping what's there.
fn add_ignores(root: &Path, patterns: &[String]) -> Result<(), String> {
    let path = root.join(".gitignore");
    let mut text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(e) if e.kind() == ErrorKind::NotFound => String::new(),
        Err(e) => return Err(e.to_string()),
    };
    let have: HashSet<&str> = text.lines().map(str::trim).collect();
    let missing: Vec<&str> = patterns
        .iter()
        .map(|p| p.trim())
        .filter(|p| !p.is_empty() && !p.contains('\n') && !have.contains(p))
        .collect();
    if missing.is_empty() {
        return Ok(());
    }
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    for pattern in missing {
        text.push_str(pattern);
        text.push('\n');
    }
    fs::write(&path, text).map_err(|e| e.to_string())
}

/// Clones `url` into `dest`, a new or empty folder whose parent exists.
fn clone(bin: &Path, url: &str, dest: &Path) -> Result<(), String> {
    let parent = dest.parent().filter(|_| dest.is_absolute()).ok_or_else(|| format!("{dest:?} is not an absolute path"))?;
    run(bin, parent, &["clone", "-q", "--", url, &dest.to_string_lossy()]).map(drop)
}

struct Repo {
    bin: PathBuf,
    top: PathBuf,
    git_dir: PathBuf,
    /// The workspace's folder relative to `top` (`notes/`, or `""`).
    prefix: String,
}

impl Repo {
    fn open(bin: PathBuf, root: &Path) -> Result<Self, String> {
        let out = run(&bin, root, &["rev-parse", "--show-toplevel", "--absolute-git-dir", "--show-prefix"])?;
        let mut lines = out.lines();
        match (lines.next(), lines.next()) {
            (Some(top), Some(git_dir)) => {
                let prefix = lines.next().unwrap_or_default().to_owned();
                Ok(Self { top: top.into(), git_dir: git_dir.into(), prefix, bin })
            }
            _ => Err(NOT_REPO.to_owned()),
        }
    }

    fn git(&self, args: &[&str]) -> Result<String, String> {
        run(&self.bin, &self.top, args)
    }

    /// `args -- paths`, the paths taken literally (`[draft].md` isn't a pattern).
    fn git_paths(&self, args: &[&str], paths: &[&str]) -> Result<String, String> {
        let mut all = vec!["--literal-pathspecs"];
        all.extend_from_slice(args);
        all.push("--");
        all.extend_from_slice(paths);
        self.git(&all)
    }

    /// Whether git succeeds, for yes/no questions (`config --get`, `rev-parse --verify`).
    fn ok(&self, args: &[&str]) -> bool {
        command(&self.bin, &self.top, args).output().is_ok_and(|o| o.status.success())
    }

    fn status(&self) -> Result<GitStatus, String> {
        let out = self.git(&["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all"])?;
        let mut status = parse_status(&out);
        status.top = self.top.to_string_lossy().into_owned();
        status.prefix = self.prefix.clone();
        status.merging = self.git_dir.join("MERGE_HEAD").exists();
        Ok(status)
    }

    /// Every branch, remote branch and tag, children before parents, newest first.
    fn log(&self, skip: u32, limit: u32) -> Result<Vec<GitCommit>, String> {
        let (skip, limit) = (format!("--skip={skip}"), format!("--max-count={limit}"));
        let format = "--format=%x1e%H%x1f%P%x1f%an%x1f%ae%x1f%at%x1f%D%x1f%s%x1f%b";
        let out = self.git(&["log", "--exclude=refs/stash", "--all", "--date-order", "--decorate=full", &skip, &limit, format])?;
        Ok(parse_log(&out))
    }

    /// What `id` changed against its first parent (everything, for the first commit).
    fn commit_files(&self, id: &str) -> Result<Vec<GitChange>, String> {
        let out = self.git(&["show", "--format=", "--name-status", "-z", "-M", "--diff-merges=first-parent", arg(id)?])?;
        Ok(parse_name_status(&out))
    }

    fn diff(&self, staged: bool) -> Result<String, String> {
        let mut args = vec!["diff", "--no-color", "--no-ext-diff", "-M"];
        if staged {
            args.push("--cached");
        }
        self.git(&args)
    }

    /// The file at `rev`, or in the index, as it would be checked out (line endings, LFS).
    fn show_file(&self, rev: Option<&str>, path: &str) -> Result<String, String> {
        let spec = match rev {
            Some(rev) => format!("{}:{}", arg(rev)?, relative(path)?),
            None => format!(":0:{}", relative(path)?),
        };
        self.git(&["cat-file", "--filters", &spec])
    }

    fn stage(&self, paths: &[String]) -> Result<(), String> {
        let paths = checked(paths)?;
        if paths.is_empty() {
            return Ok(());
        }
        self.git_paths(&["add", "-A"], &paths).map(drop)
    }

    fn unstage(&self, paths: &[String]) -> Result<(), String> {
        let paths = checked(paths)?;
        if paths.is_empty() {
            return Ok(());
        }
        self.git_paths(&["reset", "-q"], &paths).map(drop)
    }

    /// Back to the last commit: files it has are restored, the others leave the index and the disk.
    fn discard(&self, paths: &[String]) -> Result<(), String> {
        let paths = checked(paths)?;
        if paths.is_empty() {
            return Ok(());
        }
        let committed: HashSet<String> = if self.ok(&["rev-parse", "-q", "--verify", "HEAD"]) {
            let out = self.git_paths(&["ls-tree", "-r", "-z", "--name-only", "HEAD"], &paths)?;
            out.split('\0').filter(|p| !p.is_empty()).map(str::to_owned).collect()
        } else {
            HashSet::new()
        };
        let (old, new): (Vec<&str>, Vec<&str>) = paths.into_iter().partition(|p| committed.contains(*p));
        if !old.is_empty() {
            self.git_paths(&["restore", "--source=HEAD", "--staged", "--worktree"], &old)?;
        }
        if !new.is_empty() {
            self.git_paths(&["reset", "-q"], &new)?;
            for path in new {
                match fs::remove_file(self.top.join(path)) {
                    Err(e) if e.kind() != ErrorKind::NotFound => return Err(e.to_string()),
                    _ => {}
                }
            }
        }
        Ok(())
    }

    /// Commits what's staged (everything first, with `all`) and returns the new commit's id.
    fn commit(&self, message: &str, all: bool) -> Result<String, String> {
        if all {
            self.git(&["add", "-A"])?;
        }
        self.git(&["commit", "-q", "-m", message])?;
        Ok(self.git(&["rev-parse", "HEAD"])?.trim().to_owned())
    }

    fn fetch(&self) -> Result<(), String> {
        self.git(&["fetch", "-q"]).map(drop)
    }

    /// Merges the upstream in, unless the user configured `pull.rebase` (either way).
    fn pull(&self) -> Result<(), String> {
        let mut args = vec!["pull", "-q", "--no-edit"];
        if !self.ok(&["config", "--get", "pull.rebase"]) {
            args.push("--no-rebase");
        }
        self.git(&args).map(drop)
    }

    /// Pushes to the upstream; a branch without one goes to `origin`, or the only remote, and tracks it.
    fn push(&self) -> Result<(), String> {
        if self.ok(&["rev-parse", "-q", "--verify", "@{upstream}"]) {
            return self.git(&["push", "-q"]).map(drop);
        }
        let remotes = self.remotes()?;
        let remote = match remotes.iter().find(|r| r.name == "origin") {
            Some(origin) => origin,
            None if remotes.len() == 1 => &remotes[0],
            None if remotes.is_empty() => return Err(NO_REMOTE.to_owned()),
            None => return Err(NO_UPSTREAM.to_owned()),
        };
        self.git(&["push", "-q", "-u", &remote.name, "HEAD"]).map(drop)
    }

    fn branches(&self) -> Result<Vec<GitBranch>, String> {
        let format = "--format=%(refname)%1f%(HEAD)%1f%(upstream)%1f%(symref)";
        Ok(parse_branches(&self.git(&["for-each-ref", format, "refs/heads", "refs/remotes"])?))
    }

    /// Switches to `name`; a remote branch's name (without the remote) checks it out tracking it.
    fn switch(&self, name: &str, create: bool) -> Result<(), String> {
        let name = arg(name)?;
        let args = if create { vec!["switch", "-q", "-c", name] } else { vec!["switch", "-q", name] };
        self.git(&args).map(drop)
    }

    fn remotes(&self) -> Result<Vec<GitRemote>, String> {
        Ok(parse_remotes(&self.git(&["remote", "-v"])?))
    }

    /// Adds `name`, or points it at `url` when it exists.
    fn remote_set(&self, name: &str, url: &str) -> Result<(), String> {
        let (name, url) = (arg(name)?, arg(url)?);
        let verb = if self.remotes()?.iter().any(|r| r.name == name) { "set-url" } else { "add" };
        self.git(&["remote", verb, name, url]).map(drop)
    }

    fn merge_abort(&self) -> Result<(), String> {
        self.git(&["merge", "--abort"]).map(drop)
    }
}

fn git_bin<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let configured = app.state::<AppState>().git_path(app)?;
    let git = app.state::<Git>();
    let mut found = git.bin.lock().map_err(|e| e.to_string())?;
    if let Some((path, bin)) = found.as_ref() {
        if *path == configured {
            return Ok(bin.clone());
        }
    }
    let bin = find_git(&configured).ok_or_else(|| MISSING.to_owned())?;
    *found = Some((configured, bin.clone()));
    Ok(bin)
}

/// `f` on a blocking thread; a git that has gone missing is looked for again next time.
async fn with_git<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    f: impl FnOnce(&AppHandle<R>, PathBuf) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    blocking(move || {
        let out = git_bin(&app).and_then(|bin| f(&app, bin));
        if out.as_ref().is_err_and(|e| e == MISSING) {
            app.state::<Git>().bin.lock().map_err(|e| e.to_string())?.take();
        }
        out
    })
    .await
}

/// `f` on the workspace's repository; `write` waits for the repository's lock first.
async fn with_repo<R: Runtime, T: Send + 'static>(
    app: AppHandle<R>,
    root: String,
    write: bool,
    f: impl FnOnce(&Repo) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    with_git(app, move |app, bin| {
        let repo = Repo::open(bin, workspace_root(&root)?)?;
        let lock = write.then(|| app.state::<Git>().lock(&repo.top));
        let _held = lock.as_ref().map(|l| l.lock()).transpose().map_err(|e| e.to_string())?;
        f(&repo)
    })
    .await
}

#[tauri::command]
pub async fn git_version<R: Runtime>(app: AppHandle<R>) -> Result<GitVersion, String> {
    with_git(app, |_, bin| {
        let version = version(&bin).ok_or_else(|| MISSING.to_owned())?;
        Ok(GitVersion { path: bin.to_string_lossy().into_owned(), version })
    })
    .await
}

#[tauri::command]
pub async fn git_status<R: Runtime>(app: AppHandle<R>, root: String) -> Result<GitStatus, String> {
    with_repo(app, root, false, Repo::status).await
}

#[tauri::command]
pub async fn git_log<R: Runtime>(app: AppHandle<R>, root: String, skip: u32, limit: u32) -> Result<Vec<GitCommit>, String> {
    with_repo(app, root, false, move |r| r.log(skip, limit)).await
}

#[tauri::command]
pub async fn git_commit_files<R: Runtime>(app: AppHandle<R>, root: String, id: String) -> Result<Vec<GitChange>, String> {
    with_repo(app, root, false, move |r| r.commit_files(&id)).await
}

#[tauri::command]
pub async fn git_diff<R: Runtime>(app: AppHandle<R>, root: String, staged: bool) -> Result<String, String> {
    with_repo(app, root, false, move |r| r.diff(staged)).await
}

#[tauri::command]
pub async fn git_show_file<R: Runtime>(app: AppHandle<R>, root: String, rev: Option<String>, path: String) -> Result<String, String> {
    with_repo(app, root, false, move |r| r.show_file(rev.as_deref(), &path)).await
}

#[tauri::command]
pub async fn git_stage<R: Runtime>(app: AppHandle<R>, root: String, paths: Vec<String>) -> Result<(), String> {
    with_repo(app, root, true, move |r| r.stage(&paths)).await
}

#[tauri::command]
pub async fn git_unstage<R: Runtime>(app: AppHandle<R>, root: String, paths: Vec<String>) -> Result<(), String> {
    with_repo(app, root, true, move |r| r.unstage(&paths)).await
}

#[tauri::command]
pub async fn git_discard<R: Runtime>(app: AppHandle<R>, root: String, paths: Vec<String>) -> Result<(), String> {
    with_repo(app, root, true, move |r| r.discard(&paths)).await
}

#[tauri::command]
pub async fn git_commit<R: Runtime>(app: AppHandle<R>, root: String, message: String, all: bool) -> Result<String, String> {
    with_repo(app, root, true, move |r| r.commit(&message, all)).await
}

#[tauri::command]
pub async fn git_fetch<R: Runtime>(app: AppHandle<R>, root: String) -> Result<(), String> {
    with_repo(app, root, true, Repo::fetch).await
}

#[tauri::command]
pub async fn git_pull<R: Runtime>(app: AppHandle<R>, root: String) -> Result<(), String> {
    with_repo(app, root, true, Repo::pull).await
}

#[tauri::command]
pub async fn git_push<R: Runtime>(app: AppHandle<R>, root: String) -> Result<(), String> {
    with_repo(app, root, true, Repo::push).await
}

#[tauri::command]
pub async fn git_branches<R: Runtime>(app: AppHandle<R>, root: String) -> Result<Vec<GitBranch>, String> {
    with_repo(app, root, false, Repo::branches).await
}

#[tauri::command]
pub async fn git_switch<R: Runtime>(app: AppHandle<R>, root: String, name: String, create: bool) -> Result<(), String> {
    with_repo(app, root, true, move |r| r.switch(&name, create)).await
}

#[tauri::command]
pub async fn git_remotes<R: Runtime>(app: AppHandle<R>, root: String) -> Result<Vec<GitRemote>, String> {
    with_repo(app, root, false, Repo::remotes).await
}

#[tauri::command]
pub async fn git_remote_set<R: Runtime>(app: AppHandle<R>, root: String, name: String, url: String) -> Result<(), String> {
    with_repo(app, root, true, move |r| r.remote_set(&name, &url)).await
}

#[tauri::command]
pub async fn git_merge_abort<R: Runtime>(app: AppHandle<R>, root: String) -> Result<(), String> {
    with_repo(app, root, true, Repo::merge_abort).await
}

#[tauri::command]
pub async fn git_init<R: Runtime>(app: AppHandle<R>, root: String, ignore: Vec<String>) -> Result<(), String> {
    with_git(app, move |_, bin| init(&bin, workspace_root(&root)?, &ignore)).await
}

#[tauri::command]
pub async fn git_clone<R: Runtime>(app: AppHandle<R>, url: String, dest: String) -> Result<(), String> {
    with_git(app, move |_, bin| clone(&bin, &url, Path::new(&dest))).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_headers_and_every_entry_kind() {
        let out = [
            "# branch.oid 1234",
            "# branch.head main",
            "# branch.upstream origin/main",
            "# branch.ab +2 -1",
            "1 .M N... 100644 100644 100644 aaa bbb notes/a b.md",
            "2 R. N... 100644 100644 100644 aaa bbb R100 new.md",
            "old.md",
            "u UU N... 100644 100644 100644 100644 aaa bbb ccc c.md",
            "? x y.md",
            "",
        ]
        .join("\0");
        let status = parse_status(&out);
        assert_eq!(
            (status.head.as_deref(), status.branch.as_deref(), status.upstream.as_deref(), status.ahead, status.behind),
            (Some("1234"), Some("main"), Some("origin/main"), 2, 1)
        );
        let file = |path: &str, orig: Option<&str>, index, worktree, conflicted| GitFile {
            path: path.into(),
            orig_path: orig.map(Into::into),
            index,
            worktree,
            conflicted,
        };
        assert_eq!(
            status.files,
            [
                file("notes/a b.md", None, '.', 'M', false),
                file("new.md", Some("old.md"), 'R', '.', false),
                file("c.md", None, 'U', 'U', true),
                file("x y.md", None, '?', '?', false),
            ]
        );
    }

    #[test]
    fn reads_an_unborn_or_detached_head_as_none() {
        let unborn = parse_status("# branch.oid (initial)\0# branch.head main\0");
        assert_eq!((unborn.head, unborn.branch.as_deref()), (None, Some("main")));
        let detached = parse_status("# branch.oid 1234\0# branch.head (detached)\0");
        assert_eq!((detached.head.as_deref(), detached.branch), (Some("1234"), None));
    }

    #[test]
    fn parses_log_records_with_refs_and_multiline_bodies() {
        let out = "\x1eaaa\x1fppp qqq\x1fAda\x1fada@x.org\x1f1700000000\x1fHEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1\x1fMerge\x1fLine one\n\nLine two\n\n\
                   \x1eppp\x1f\x1fBo\x1fbo@x.org\x1f1690000000\x1f\x1fFirst\x1f\n";
        let log = parse_log(out);
        assert_eq!(log.len(), 2);
        assert_eq!(log[0].parents, ["ppp", "qqq"]);
        assert_eq!(log[0].refs, ["HEAD", "refs/heads/main", "refs/remotes/origin/main", "refs/tags/v1"]);
        assert_eq!((log[0].subject.as_str(), log[0].body.as_str(), log[0].time), ("Merge", "Line one\n\nLine two", 1_700_000_000));
        assert!(log[1].parents.is_empty() && log[1].refs.is_empty() && log[1].body.is_empty());
    }

    #[test]
    fn parses_name_status_with_renames() {
        let changes = parse_name_status("\nM\0a.md\0R087\0old.md\0new.md\0D\0gone.md\0");
        let got: Vec<_> = changes.iter().map(|c| (c.status, c.path.as_str(), c.orig_path.as_deref())).collect();
        assert_eq!(got, [('M', "a.md", None), ('R', "new.md", Some("old.md")), ('D', "gone.md", None)]);
    }

    #[test]
    fn parses_branches_skipping_symbolic_refs_and_remotes() {
        let out = "refs/heads/main\x1f*\x1frefs/remotes/origin/main\x1f\n\
                   refs/heads/topic\x1f \x1f\x1f\n\
                   refs/remotes/origin/HEAD\x1f \x1f\x1frefs/remotes/origin/main\n\
                   refs/remotes/origin/main\x1f \x1f\x1f\n";
        let got: Vec<_> = parse_branches(out).into_iter().map(|b| (b.name, b.remote, b.current, b.upstream)).collect();
        assert_eq!(
            got,
            [
                ("main".into(), false, true, Some("origin/main".into())),
                ("topic".into(), false, false, None),
                ("origin/main".into(), true, false, None),
            ]
        );
        let remotes = parse_remotes("origin\thttps://x.org/a.git (fetch)\norigin\thttps://x.org/a.git (push)\n");
        assert_eq!(remotes, [GitRemote { name: "origin".into(), url: "https://x.org/a.git".into() }]);
    }

    #[test]
    fn classifies_expected_failures_and_keeps_other_messages() {
        let cases = [
            ("fatal: not a git repository (or any of the parent directories): .git", NOT_REPO),
            ("fatal: could not read Username for 'https://github.com': terminal prompts disabled", AUTH),
            ("git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.", AUTH),
            ("remote: Invalid username or password.\nfatal: Authentication failed for 'https://x.org/'", AUTH),
            ("Author identity unknown\n\n*** Please tell me who you are.", IDENTITY),
            ("CONFLICT (content): Merge conflict in a.md\nAutomatic merge failed; fix conflicts and then commit the result.", CONFLICT),
            ("error: Pulling is not possible because you have unmerged files.", CONFLICT),
            (" ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs", REJECTED),
            ("fatal: No configured push destination.", NO_REMOTE),
            ("There is no tracking information for the current branch.", NO_UPSTREAM),
        ];
        for (output, code) in cases {
            assert_eq!(classify(output), code, "{output}");
        }
        assert_eq!(classify("\nfatal: invalid reference: nope\n"), "fatal: invalid reference: nope");
    }

    #[test]
    fn refuses_paths_outside_the_repository_and_option_like_names() {
        for bad in ["", "/etc/passwd", "../x.md", "a/../../x.md", "./a.md", ".git/config", "sub/.GIT/HEAD"] {
            assert!(relative(bad).is_err(), "{bad}");
        }
        assert_eq!(relative("notes/[draft].md"), Ok("notes/[draft].md"));
        assert!(arg("--upload-pack=x").is_err() && arg("").is_err());
    }

    #[test]
    fn adds_only_the_ignore_lines_missing() {
        let root = temp("ignore");
        let lines = |l: &[&str]| l.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        add_ignores(&root, &lines(&[".DS_Store", ".vertex/trash/"])).unwrap();
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(), ".DS_Store\n.vertex/trash/\n");
        // An existing file keeps its lines, gets a newline before the new ones, and nothing twice.
        fs::write(root.join(".gitignore"), "node_modules\n.DS_Store").unwrap();
        add_ignores(&root, &lines(&[".DS_Store", "", "Thumbs.db"])).unwrap();
        assert_eq!(fs::read_to_string(root.join(".gitignore")).unwrap(), "node_modules\n.DS_Store\nThumbs.db\n");
        fs::remove_dir_all(root).unwrap();
    }

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("vertex-{name}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn round_trip_against_a_real_repository() {
        let Some(bin) = find_git("") else { return }; // no git on this machine
        // The only test that runs git: keep the user's and the system's config out of it.
        let base = temp("git");
        fs::write(base.join("gitconfig"), "[user]\n\tname = T\n\temail = t@example.org\n").unwrap();
        std::env::set_var("GIT_CONFIG_GLOBAL", base.join("gitconfig"));
        std::env::set_var("GIT_CONFIG_NOSYSTEM", "1");

        let a = base.join("a");
        fs::create_dir(&a).unwrap();
        assert_eq!(Repo::open(bin.clone(), &a).err().as_deref(), Some(NOT_REPO));
        init(&bin, &a, &[]).unwrap();
        let repo = Repo::open(bin.clone(), &a).unwrap();
        // A workspace in a subfolder of the repository knows where it sits.
        fs::create_dir(a.join("sub")).unwrap();
        assert_eq!(Repo::open(bin.clone(), &a.join("sub")).unwrap().status().unwrap().prefix, "sub/");
        assert_eq!(repo.status().unwrap().prefix, "");
        let files = |r: &Repo| -> Vec<(String, char, char)> {
            r.status().unwrap().files.into_iter().map(|f| (f.path, f.index, f.worktree)).collect()
        };
        let one = |p: &str| vec![p.to_owned()];
        let status = repo.status().unwrap();
        assert_eq!((status.branch.as_deref(), status.head), (Some("main"), None));
        assert!(repo.log(0, 10).unwrap().is_empty());

        // Stage and unstage before the first commit; patterns in names stay literal.
        fs::write(a.join("a.md"), "one\n").unwrap();
        fs::write(a.join("[n].md"), "x").unwrap();
        fs::write(a.join("n.md"), "y").unwrap();
        repo.stage(&one("[n].md")).unwrap();
        assert_eq!(files(&repo), [("[n].md".into(), 'A', '.'), ("a.md".into(), '?', '?'), ("n.md".into(), '?', '?')]);
        repo.unstage(&one("[n].md")).unwrap();
        assert_eq!(files(&repo)[0], ("[n].md".into(), '?', '?'));
        repo.discard(&["[n].md".into(), "n.md".into()]).unwrap();
        assert!(!a.join("[n].md").exists() && !a.join("n.md").exists());

        let first = repo.commit("First", true).unwrap();
        let log = repo.log(0, 10).unwrap();
        assert_eq!((log.len(), log[0].id.as_str(), log[0].subject.as_str()), (1, first.as_str(), "First"));
        assert_eq!(log[0].refs, ["HEAD", "refs/heads/main"]);
        let changes: Vec<_> = repo.commit_files(&first).unwrap().into_iter().map(|c| (c.status, c.path)).collect();
        assert_eq!(changes, [('A', "a.md".into())]);

        // An edit seen from every side, then thrown away with a new file.
        fs::write(a.join("a.md"), "one\ntwo\n").unwrap();
        assert!(repo.diff(false).unwrap().contains("+two"));
        repo.stage(&one("a.md")).unwrap();
        assert!(repo.diff(true).unwrap().contains("+two"));
        assert_eq!(repo.show_file(None, "a.md").unwrap(), "one\ntwo\n");
        assert_eq!(repo.show_file(Some("HEAD"), "a.md").unwrap(), "one\n");
        fs::write(a.join("b.md"), "new").unwrap();
        repo.discard(&["a.md".into(), "b.md".into()]).unwrap();
        assert_eq!(fs::read_to_string(a.join("a.md")).unwrap(), "one\n");
        assert!(!a.join("b.md").exists() && files(&repo).is_empty());

        // A remote: the first push sets the upstream.
        run(&bin, &base, &["init", "-q", "--bare", "--initial-branch=main", "remote.git"]).unwrap();
        let url = base.join("remote.git").to_string_lossy().into_owned();
        assert_eq!(repo.push().err().as_deref(), Some(NO_REMOTE));
        repo.remote_set("origin", &url).unwrap();
        assert_eq!(repo.remotes().unwrap(), [GitRemote { name: "origin".into(), url: url.clone() }]);
        repo.push().unwrap();
        let status = repo.status().unwrap();
        assert_eq!((status.upstream.as_deref(), status.ahead, status.behind), (Some("origin/main"), 0, 0));

        // A second clone pushes first: this one's push is turned away, and its pull conflicts until aborted.
        let b = base.join("b");
        clone(&bin, &url, &b).unwrap();
        let other = Repo::open(bin.clone(), &b).unwrap();
        fs::write(b.join("a.md"), "one\nfrom b\n").unwrap();
        other.commit("From b", true).unwrap();
        other.push().unwrap();
        fs::write(a.join("a.md"), "one\nfrom a\n").unwrap();
        repo.commit("From a", true).unwrap();
        assert_eq!(repo.push().err().as_deref(), Some(REJECTED));
        assert_eq!(repo.pull().err().as_deref(), Some(CONFLICT));
        let status = repo.status().unwrap();
        assert!(status.merging && status.files.iter().any(|f| f.path == "a.md" && f.conflicted));
        repo.merge_abort().unwrap();
        assert!(!repo.status().unwrap().merging);

        // Branches: a new one becomes current; main keeps tracking origin.
        repo.switch("topic", true).unwrap();
        let branches: Vec<_> = repo.branches().unwrap().into_iter().map(|b| (b.name, b.remote, b.current, b.upstream)).collect();
        assert_eq!(
            branches,
            [
                ("main".into(), false, false, Some("origin/main".into())),
                ("topic".into(), false, true, None),
                ("origin/main".into(), true, false, None),
            ]
        );
        fs::remove_dir_all(base).unwrap();
    }
}
