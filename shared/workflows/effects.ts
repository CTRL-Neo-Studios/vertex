import {renameTargets, rewriteLinks} from '../utils/index/rewriteLinks'
import type {VertexEffects} from './vertex'
import {
    baseNameOf,
    extensionOf,
    hasTag,
    isNotePath,
    joinPath,
    matchesPattern,
    parentOf,
    retag,
    setFrontmatterProperty,
    TRASH_DIR,
    vaultPath,
    type Vault,
    type YamlTools,
} from './vault'

/** One change a run made (or, in a dry run, would make), in order. Undo applies their inverses backwards. */
export type Op =
    | { kind: 'move', why: 'rename' | 'move' | 'trash', from: string, to: string }
    | { kind: 'write', why: 'property' | 'links' | 'text' | 'tag', path: string, before: string, after: string }
    /** A new entry; undo moves it to `trash`, its own slot in the run's trash. `text` is a new file's, so undo can tell if it was edited since. */
    | { kind: 'create', why: 'note' | 'folder' | 'copy', path: string, trash: string, text?: string }

export interface EffectsOptions {
    yaml: YamlTools
    /** Names this run's trash folder, `.vertex/trash/<runId>/`. */
    runId: string
    /** The `ui` capability: prompts, pickers and messages, which the app provides. */
    ui: VertexEffects['ui']
}

/** A file or folder name from a program: no separators, control characters, `.` or `..`. */
function validName(name: string): string {
    const trimmed = name.trim()
    const control = [...trimmed].some(c => c.charCodeAt(0) < 0x20)
    if (!trimmed || trimmed === '.' || trimmed === '..' || /[/\\]/.test(trimmed) || control)
        throw new Error(`"${name}" is not a valid file name`)
    return trimmed
}

/**
 * The Vertex effect handlers over a vault. Every change is appended to `ops`, so the same code serves a real
 * run (the ops are the undo journal) and a dry run over an overlay (the ops are the planned diff).
 */
export function createVertexEffects(vault: Vault, options: EffectsOptions): { effects: VertexEffects, ops: Op[] } {
    const ops: Op[] = []

    const existing = (path: string) => {
        const entry = vault.entry(vaultPath(path))
        if (!entry) throw new Error(`"${path}" doesn't exist`)
        return entry
    }
    const file = (path: string) => {
        const entry = existing(path)
        if (entry.isFolder) throw new Error(`"${path}" is a folder`)
        return entry
    }
    const note = (path: string) => {
        if (!isNotePath(file(path).path)) throw new Error(`"${path}" is not a markdown note`)
        return path
    }
    /** `''` is the vault root. */
    const folder = (path: string) => {
        const dir = vaultPath(path)
        if (dir && !vault.entry(dir)?.isFolder) throw new Error(`"${path}" is not a folder`)
        return dir
    }

    async function write(path: string, after: string, why: Extract<Op, {kind: 'write'}>['why']) {
        const before = await vault.read(path)
        if (before === after) return
        await vault.write(path, after)
        ops.push({kind: 'write', why, path, before, after})
    }

    const created = (why: Extract<Op, {kind: 'create'}>['why'], path: string, text?: string) =>
        ops.push({kind: 'create', why, path, trash: `${TRASH_DIR}/${options.runId}/new-${ops.length}/${path}`, ...(text !== undefined && {text})})

    async function setProperty(path: string, key: string, value: unknown, why: 'property' | 'tag') {
        await write(note(path), setFrontmatterProperty(await vault.read(path), key, value, options.yaml), why)
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
            async list(path, o) {
                const dir = folder(path)
                const extensions = o.extensions.split(/[\s,]+/).map(e => e.replace(/^\./, '').toLowerCase()).filter(Boolean)
                return vault.entries().filter(e => {
                    if (dir && !e.path.startsWith(`${dir}/`)) return false
                    const inside = dir ? e.path.slice(dir.length + 1) : e.path
                    if (!o.recursive && inside.includes('/')) return false
                    if (e.isFolder ? !o.folders : !o.files) return false
                    if (extensions.length && (e.isFolder || !extensions.includes(extensionOf(e.path).toLowerCase()))) return false
                    if (o.tag && !hasTag(e.properties, o.tag)) return false
                    return !o.pattern || matchesPattern(inside, o.pattern)
                }).map(e => e.path).sort()
            },
            async find(pattern) {
                if (!pattern.trim()) throw new Error('Find needs a name or pattern')
                return vault.entries().filter(e => matchesPattern(e.path, pattern.trim())).map(e => e.path).sort()
            },
            async read(path) {
                return vault.read(file(path).path)
            },
            async linksFrom(path) {
                return vault.linksFrom(file(path).path).sort()
            },
            async linksTo(path) {
                return vault.linksTo(existing(path).path).map(ref => ref.file).sort()
            },
            async info(path) {
                const entry = existing(path)
                return {
                    name: baseNameOf(entry.path),
                    extension: entry.isFolder ? '' : extensionOf(entry.path),
                    folder: parentOf(entry.path),
                    size: entry.size,
                    created: new Date(entry.created).toISOString(),
                    modified: new Date(entry.modified).toISOString(),
                }
            },
        },
        fs: {
            async rename(path, newName) {
                const name = validName(newName)
                const entry = existing(path)
                const oldName = baseNameOf(path)
                const dot = oldName.lastIndexOf('.')
                const keepExt = !entry.isFolder && dot > 0 && name.lastIndexOf('.') <= 0
                return relocate(path, vaultPath(joinPath(parentOf(path), keepExt ? name + oldName.slice(dot) : name)), 'rename')
            },
            async move(path, to) {
                return relocate(vaultPath(path), joinPath(folder(to), baseNameOf(path)), 'move')
            },
            async trash(path) {
                existing(path)
                const to = `${TRASH_DIR}/${options.runId}/${path}`
                await vault.move(path, to)
                ops.push({kind: 'move', why: 'trash', from: path, to})
            },
            setProperty: (path, key, value) => setProperty(path, key, value, 'property'),
            async write(path, text) {
                await write(file(path).path, text, 'text')
            },
            async append(path, text) {
                const before = await vault.read(file(path).path)
                await write(path, before + (before && !before.endsWith('\n') ? '\n' : '') + text, 'text')
            },
            async createNote(at, name, template) {
                const text = template ? await vault.read(note(template)) : ''
                const fileName = validName(name)
                const path = vaultPath(joinPath(folder(at), isNotePath(fileName) ? fileName : `${fileName}.md`))
                await vault.create(path, text)
                created('note', path, text)
                return path
            },
            async createFolder(at, name) {
                const path = vaultPath(joinPath(folder(at), validName(name)))
                await vault.createFolder(path)
                created('folder', path)
                return path
            },
            async copy(path, to) {
                const from = existing(path)
                const target = vaultPath(joinPath(folder(to), baseNameOf(from.path)))
                if (target.startsWith(`${from.path}/`)) throw new Error(`Can't copy "${path}" into itself`)
                if (!from.isFolder) {
                    const text = await vault.read(from.path)
                    await vault.create(target, text)
                    created('copy', target, text)
                    return target
                }
                await vault.createFolder(target)
                created('copy', target)
                // Parents sort before their children, so each folder exists before what goes in it.
                const inside = vault.entries().filter(e => e.path.startsWith(`${from.path}/`)).sort((a, b) => a.path.localeCompare(b.path))
                for (const e of inside) {
                    const dest = target + e.path.slice(from.path.length)
                    if (e.isFolder) await vault.createFolder(dest)
                    else await vault.create(dest, await vault.read(e.path))
                }
                return target
            },
            async tag(path, tag, add) {
                const change = retag(existing(note(path)).properties, tag, add)
                if (change) await setProperty(path, change.key, change.tags, 'tag')
            },
        },
        ui: options.ui,
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
        const paths = op.kind === 'move' ? [op.from, op.to] : op.kind === 'write' ? [op.path] : [op.path, op.trash]
        if (paths.some(p => blocked.has(p))) {
            result.skipped.push({op, reason: 'an earlier step on this file was skipped'})
            continue
        }
        try {
            if (op.kind === 'write') {
                if ((await vault.read(op.path)) !== op.after) throw new Error('it was edited since the run')
                await vault.write(op.path, op.before)
            } else if (op.kind === 'create') {
                if (op.text !== undefined && (await vault.read(op.path)) !== op.text) throw new Error('it was edited since the run')
                await vault.move(op.path, op.trash)
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
