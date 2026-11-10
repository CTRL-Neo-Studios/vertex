import {invoke} from "@tauri-apps/api/core";
import type {GitBranch, GitChange, GitCommit, GitRemote, GitStatus, GitToken, GitVersion} from "#shared/types/app/git";

/**
 * Thin client for the git backend (src-tauri/src/git.rs), which runs the installed `git`. `root` is the workspace
 * root; paths are relative to the repository's top folder (`GitStatus.top`). Changing commands wait for each
 * other per repository; reads don't.
 */
export const GitCommand = {
    version: 'git_version',
    status: 'git_status',
    log: 'git_log',
    commitFiles: 'git_commit_files',
    diff: 'git_diff',
    showFile: 'git_show_file',
    stage: 'git_stage',
    unstage: 'git_unstage',
    discard: 'git_discard',
    commit: 'git_commit',
    fetch: 'git_fetch',
    pull: 'git_pull',
    push: 'git_push',
    branches: 'git_branches',
    switch: 'git_switch',
    remotes: 'git_remotes',
    remoteSet: 'git_remote_set',
    mergeAbort: 'git_merge_abort',
    init: 'git_init',
    clone: 'git_clone',
    tokens: 'git_tokens',
    tokenSet: 'git_token_set',
} as const

/** Error strings Rust returns for expected failures; anything else is git's own message. */
export const GitError = {
    /** No usable git (or `gitConfig.path` isn't one). */
    missing: 'missing',
    notRepo: 'not-repo',
    /** The remote refused the credentials, or there were none to give (a saved token for its host included). */
    auth: 'auth',
    /** A pull stopped on conflicts, or one is waiting to be resolved. */
    conflict: 'conflict',
    /** The remote has commits this branch doesn't: pull first. */
    rejected: 'rejected',
    noRemote: 'no-remote',
    /** The branch tracks nothing (pull), or there are several remotes and no `origin` (push). */
    noUpstream: 'no-upstream',
    /** `user.name` / `user.email` aren't set. */
    identity: 'identity',
} as const

export const gitClient = {
    version: () => invoke<GitVersion>(GitCommand.version),
    status: (root: string) => invoke<GitStatus>(GitCommand.status, {root}),
    /** Every branch, remote branch and tag, children before parents, newest first. */
    log: (root: string, skip: number, limit: number) => invoke<GitCommit[]>(GitCommand.log, {root, skip, limit}),
    /** What a commit changed against its first parent. */
    commitFiles: (root: string, id: string) => invoke<GitChange[]>(GitCommand.commitFiles, {root, id}),
    /** The patch of the working copy, or of what's staged. */
    diff: (root: string, staged: boolean) => invoke<string>(GitCommand.diff, {root, staged}),
    /** A file's text at `rev`, or in the index when `rev` is null. */
    showFile: (root: string, rev: string | null, path: string) => invoke<string>(GitCommand.showFile, {root, rev, path}),
    stage: (root: string, paths: string[]) => invoke(GitCommand.stage, {root, paths}),
    unstage: (root: string, paths: string[]) => invoke(GitCommand.unstage, {root, paths}),
    /** Back to the last commit; files it doesn't have are deleted. */
    discard: (root: string, paths: string[]) => invoke(GitCommand.discard, {root, paths}),
    /** Commits what's staged (everything first, with `all`); resolves to the new commit's id. */
    commit: (root: string, message: string, all: boolean) => invoke<string>(GitCommand.commit, {root, message, all}),
    fetch: (root: string) => invoke(GitCommand.fetch, {root}),
    /** Merges the upstream in, unless the user's `pull.rebase` says otherwise. */
    pull: (root: string) => invoke(GitCommand.pull, {root}),
    /** A branch without an upstream goes to `origin` (or the only remote) and tracks it. */
    push: (root: string) => invoke(GitCommand.push, {root}),
    branches: (root: string) => invoke<GitBranch[]>(GitCommand.branches, {root}),
    switch: (root: string, name: string, create: boolean) => invoke(GitCommand.switch, {root, name, create}),
    remotes: (root: string) => invoke<GitRemote[]>(GitCommand.remotes, {root}),
    /** Adds the remote, or points it at `url` when it exists. */
    remoteSet: (root: string, name: string, url: string) => invoke(GitCommand.remoteSet, {root, name, url}),
    mergeAbort: (root: string) => invoke(GitCommand.mergeAbort, {root}),
    /** On `main` unless the user set `init.defaultBranch`; adds the `ignore` lines `.gitignore` doesn't have yet. */
    init: (root: string, ignore: string[]) => invoke(GitCommand.init, {root, ignore}),
    /** Into `dest`, a new or empty folder whose parent exists. */
    clone: (url: string, dest: string) => invoke(GitCommand.clone, {url, dest}),
    /** Hosts with a saved personal access token. */
    tokens: () => invoke<GitToken[]>(GitCommand.tokens),
    /**
     * Saves a personal access token for an https host (`github.com`, `host:port`) in the keychain; an empty token
     * removes it. Fetch, pull, push and clone hand it to git for that host only, for that run only.
     */
    tokenSet: (host: string, username: string, token: string) => invoke(GitCommand.tokenSet, {host, username, token}),
}
