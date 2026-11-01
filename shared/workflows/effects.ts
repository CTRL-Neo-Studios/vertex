import {renameTargets, rewriteLinks} from '../utils/index/rewriteLinks'
import type {VertexEffects} from './vertex'
import {
    baseNameOf,
    hasTag,
    isNotePath,
    joinPath,
    parentOf,
    setFrontmatterProperty,
    TRASH_DIR,
    vaultPath,
    type Vault,
    type YamlTools,
} from './vault'

/** One change a run made (or, in a dry run, would make), in order. Undo applies their inverses backwards. */
export type Op =
    | { kind: 'move', why: 'rename' | 'move' | 'trash', from: string, to: string }
    | { kind: 'write', why: 'property' | 'links', path: string, before: string, after: string }

export interface EffectsOptions {
    yaml: YamlTools
    /** Names this run's trash folder, `.vertex/trash/<runId>/`. */
    runId: string
    /** Asked once, before the run's first trash; `false` faults that node. */
    confirmTrash?: () => Promise<boolean>
}

/**
 * The Vertex effect handlers over a vault. Every change is appended to `ops`, so the same code serves a real
 * run (the ops are the undo journal) and a dry run over an overlay (the ops are the planned diff).
 */
export function createVertexEffects(vault: Vault, options: EffectsOptions): { effects: VertexEffects, ops: Op[] } {
    const ops: Op[] = []
    let trashAllowed: Promise<boolean> | undefined

    const existing = (path: string) => {
        const entry = vault.entry(vaultPath(path))
        if (!entry) throw new Error(`"${path}" doesn't exist`)
        return entry
    }

    async function write(path: string, after: string, why: 'property' | 'links') {
        const before = await vault.read(path)
        if (before === after) return
        await vault.write(path, after)
        ops.push({kind: 'write', why, path, before, after})
    }

    /** Moves an entry, then rewrites the links that pointed at it (files only, like the app's own rename). */
    async function relocate(from: string, to: string, why: 'rename' | 'move') {
        const entry = existing(from)
        if (to === from) return from
        if (to.startsWith(`${from}/`)) throw new Error(`Can't move "${from}" into itself`)
        const refs = entry.isFolder ? [] : vault.linksTo(from)
        await vault.move(from, to)
        ops.push({kind: 'move', why, from, to})
        for (const ref of refs) {
            const path = ref.file === from ? to : ref.file
            const {text, count} = rewriteLinks(await vault.read(path), renameTargets(ref.targets, from, to))
            if (count) await write(path, text, 'links')
        }
        return to
    }

    const effects: VertexEffects = {
        index: {
            async tagged(tag) {
                return vault.entries()
                    .filter(e => !e.isFolder && isNotePath(e.path) && hasTag(e.properties, tag))
                    .map(e => e.path)
                    .sort()
            },
            async property(path, key) {
                return existing(path).properties[key] ?? null
            },
        },
        fs: {
            async rename(path, newName) {
                const name = newName.trim()
                const control = [...name].some(c => c.charCodeAt(0) < 0x20)
                if (!name || name === '.' || name === '..' || /[/\\]/.test(name) || control)
                    throw new Error(`"${newName}" is not a valid file name`)
                const entry = existing(path)
                const oldName = baseNameOf(path)
                const dot = oldName.lastIndexOf('.')
                const keepExt = !entry.isFolder && dot > 0 && name.lastIndexOf('.') <= 0
                return relocate(path, vaultPath(joinPath(parentOf(path), keepExt ? name + oldName.slice(dot) : name)), 'rename')
            },
            async move(path, folder) {
                const dir = vaultPath(folder)
                if (dir && !vault.entry(dir)?.isFolder) throw new Error(`"${folder}" is not a folder`)
                return relocate(vaultPath(path), joinPath(dir, baseNameOf(path)), 'move')
            },
            async trash(path) {
                existing(path)
                trashAllowed ??= options.confirmTrash?.() ?? Promise.resolve(true)
                if (!(await trashAllowed)) throw new Error('Trashing was declined')
                const to = `${TRASH_DIR}/${options.runId}/${path}`
                await vault.move(path, to)
                ops.push({kind: 'move', why: 'trash', from: path, to})
            },
            async setProperty(path, key, value) {
                if (!isNotePath(existing(path).path)) throw new Error(`"${path}" is not a markdown note`)
                await write(path, setFrontmatterProperty(await vault.read(path), key, value, options.yaml), 'property')
            },
        },
    }
    return {effects, ops}
}

export interface UndoResult {
    undone: number
    /** Ops left alone because the vault changed since the run, with why. */
    skipped: { op: Op, reason: string }[]
}

/**
 * Reverts `ops` newest first. A file edited since the run, or a path taken since, is skipped rather than
 * overwritten, and so is anything that depended on it (its earlier ops would no longer line up).
 */
export async function undoOps(vault: Vault, ops: readonly Op[]): Promise<UndoResult> {
    const result: UndoResult = {undone: 0, skipped: []}
    const blocked = new Set<string>()
    for (const op of [...ops].reverse()) {
        const paths = op.kind === 'move' ? [op.from, op.to] : [op.path]
        if (paths.some(p => blocked.has(p))) {
            result.skipped.push({op, reason: 'an earlier step on this file was skipped'})
            continue
        }
        try {
            if (op.kind === 'write') {
                if ((await vault.read(op.path)) !== op.after) throw new Error('it was edited since the run')
                await vault.write(op.path, op.before)
            } else {
                await vault.move(op.to, op.from)
            }
            result.undone++
        } catch (error) {
            paths.forEach(p => blocked.add(p))
            result.skipped.push({op, reason: error instanceof Error ? error.message : String(error)})
        }
    }
    return result
}
