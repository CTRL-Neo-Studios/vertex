import {getAt, withAt, withoutAt} from './paths'

/**
 * Settings that moved (old path → new path), so files written before a move keep working: the global settings and every
 * workspace's `.vertex/settings.json` are read through `withMovedPaths`. The global file is written back at the new
 * paths with the next save; a workspace's drops the old ones the next time it's changed (`movedPathsIn`). Entries stay
 * for good: a vault may come back after years.
 */
export const LEGACY_PATHS: readonly (readonly [from: string, to: string])[] = [
    // X2: canvas became a plugin.
    ...['wheelBehavior', 'modDragBehavior', 'cardLabels', 'snapToGrid', 'snapToObjects', 'zoomBreakpoint']
        .map(key => [`viewConfig.canvas.${key}`, `plugins.config.canvas.${key}`] as const),
    // X4: the file tree became the files plugin.
    ...['showFoldArrows', 'showFileExtInName', 'showFileExtAsTag', 'showDefaultFileIcons', 'showDefaultFolderIcons', 'allowCustomFileIcons', 'allowCustomFolderIcons']
        .map(key => [`viewConfig.fileTree.${key}`, `plugins.config.files.${key}`] as const),
    // X5: workflows became a plugin; what file trust remembers is the kernel's trust setting.
    ...['maxLoopIterations', 'maxStackDepth', 'wallClockTimeoutMs', 'confirmTrash']
        .map(key => [`workflowConfig.${key}`, `plugins.config.workflows.${key}`] as const),
    ['workflowConfig.fileTrust', 'trustConfig.fileTrust'],
    // X6: AI became a plugin, carrying chat's, the editor assistant's and git's options until X7 and X8.
    ['aiConfig', 'plugins.config.ai'],
]

/** `raw` with each old path's value at its new one (unless the new one is set), and the old one gone. */
export function withMovedPaths<T>(raw: T, table: readonly (readonly [string, string])[] = LEGACY_PATHS): T {
    let out = raw
    for (const [from, to] of table) {
        const value = getAt(out, from)
        if (value === undefined) continue
        if (getAt(out, to) === undefined) out = withAt(out, to, value)
        out = withoutAt(out, from)
    }
    return out
}

/**
 * The moves `raw` still holds at their old paths. A write to that file stores each at its new path, then removes the
 * old one; removing it alone would lose a value that so far lives at the new path only in memory.
 */
export const movedPathsIn = (raw: unknown, table: readonly (readonly [string, string])[] = LEGACY_PATHS): (readonly [string, string])[] =>
    table.filter(([from]) => getAt(raw, from) !== undefined)
