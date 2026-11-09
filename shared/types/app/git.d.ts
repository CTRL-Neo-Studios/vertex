/** What the git commands return (src-tauri/src/git.rs). Paths are relative to the repository's top folder. */

/** git's status letters: `.` unchanged, `U` unmerged, `?` untracked. */
export type GitState = '.' | 'M' | 'A' | 'D' | 'R' | 'C' | 'T' | 'U' | '?'

export interface GitVersion {
    path: string,
    version: string,
}

export interface GitStatus {
    /** The repository's top folder, which may sit above the workspace. */
    top: string,
    /** `null` when detached. */
    branch: string | null,
    /** `null` before the first commit. */
    head: string | null,
    upstream: string | null,
    ahead: number,
    behind: number,
    /** A merge is in progress, whether or not its conflicts are resolved. */
    merging: boolean,
    files: GitFile[],
}

export interface GitFile {
    path: string,
    /** The old path of a staged rename or copy. */
    origPath: string | null,
    index: GitState,
    worktree: GitState,
    conflicted: boolean,
}

export interface GitCommit {
    id: string,
    parents: string[],
    author: string,
    email: string,
    /** Author time, Unix seconds. */
    time: number,
    /** Full names: `HEAD`, `refs/heads/main`, `refs/remotes/origin/main`, `refs/tags/v1`. */
    refs: string[],
    subject: string,
    body: string,
}

export interface GitChange {
    path: string,
    origPath: string | null,
    status: Exclude<GitState, '.' | 'U' | '?'>,
}

export interface GitBranch {
    /** `main` for a local branch, `origin/main` for a remote one. */
    name: string,
    remote: boolean,
    current: boolean,
    upstream: string | null,
}

export interface GitRemote {
    name: string,
    url: string,
}
