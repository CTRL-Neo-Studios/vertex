import {fromBase64Url, toBase64Url} from "#shared/utils/base64url";

/** What a diff tab shows: `path` in the repository at `top`, on one side. */
export interface GitDiffSpec {
    /** The repository's top folder (`GitStatus.top`). */
    top: string
    /** Repository-relative. */
    path: string
    /** The old path of a renamed file. */
    origPath?: string
    /**
     * `worktree`: the file on disk against the last commit. `staged`: the index against the last commit. A commit id:
     * that commit against its first parent.
     */
    side: 'worktree' | 'staged' | (string & {})
}

const PREFIX = 'diff-'

/**
 * A diff tab's id, which is also its route segment: the whole spec, URL-safe, so the page can show it from the route
 * alone and the same diff opens the same tab (and never a file's own tab).
 */
export const diffTabId = (spec: GitDiffSpec) => PREFIX + toBase64Url(JSON.stringify([spec.top, spec.path, spec.side, spec.origPath ?? null]))

/** The spec a diff tab id holds; `undefined` for any other id. */
export function diffSpecOf(id: string): GitDiffSpec | undefined {
    if (!id.startsWith(PREFIX)) return undefined
    try {
        const [top, path, side, origPath] = JSON.parse(fromBase64Url(id.slice(PREFIX.length))) as [string, string, string, string | null]
        if (typeof top !== 'string' || typeof path !== 'string' || typeof side !== 'string') return undefined
        return {top, path, side, ...(origPath ? {origPath} : {})}
    } catch {
        return undefined
    }
}

type Translate = (key: string, named?: Record<string, unknown>) => string

/** What a side is called: Working tree, Staged, or the commit's short id. */
export const diffSideLabel = (spec: GitDiffSpec, t: Translate) =>
    spec.side === 'worktree' ? t('app.git.diff.worktree') : spec.side === 'staged' ? t('app.git.diff.staged') : spec.side.slice(0, 7)

/** The tab's title: `Hub.md (Working tree)`. */
export const diffTitle = (spec: GitDiffSpec, t: Translate) =>
    t('app.git.diff.tabTitle', {name: spec.path.slice(spec.path.lastIndexOf('/') + 1), side: diffSideLabel(spec, t)})