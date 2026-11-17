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
    // X7: git became a plugin, taking its commit-message options from AI's (an `aiConfig` gets there through both rows).
    ['gitConfig', 'plugins.config.git'],
    ['plugins.config.ai.commitMessages', 'plugins.config.git.commitMessages'],
    // X8: chat and the editor assistant became plugins, taking their options from AI's and the files settings.
    ['plugins.config.ai.chatStorage', 'plugins.config.chat.storage'],
    ['plugins.config.ai.chatMode', 'plugins.config.chat.mode'],
    ['plugins.config.ai.chatTitles', 'plugins.config.chat.titles'],
    ['fileConfig.importToChat', 'plugins.config.chat.importFiles'],
    ['plugins.config.ai.editorAssistant', 'plugins.config.ai-assistant'],
]

type Table = readonly (readonly [string, string])[]

/** Applies the table in order (a row's old path may be where an earlier row put it); the rows that moved something. */
function applyMoves<T>(raw: T, table: Table): { out: T, moved: (readonly [string, string])[] } {
    let out = raw
    const moved: (readonly [string, string])[] = []
    for (const row of table) {
        const [from, to] = row
        const value = getAt(out, from)
        if (value === undefined) continue
        moved.push(row)
        if (getAt(out, to) === undefined) out = withAt(out, to, value)
        out = withoutAt(out, from)
    }
    return {out, moved}
}

/** `raw` with each old path's value at its new one (unless the new one is set), and the old one gone. */
export const withMovedPaths = <T>(raw: T, table: Table = LEGACY_PATHS): T => applyMoves(raw, table).out

/**
 * The moves `raw` still holds at their old paths, chains included. A write to that file stores each at its new path,
 * then removes the old one; removing it alone would lose a value that so far lives at the new path only in memory.
 */
export const movedPathsIn = (raw: unknown, table: Table = LEGACY_PATHS): (readonly [string, string])[] => applyMoves(raw, table).moved
