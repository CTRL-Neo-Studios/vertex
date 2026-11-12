import {copyFile, exists, mkdir, readDir, readTextFile, rename, stat, writeFile, writeTextFile} from "@tauri-apps/plugin-fs"
import {invoke} from "@tauri-apps/api/core"
import {dirname, join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {renameTargets, rewriteLinks} from "#shared/utils/index/rewriteLinks";
import {parentPathOf} from "#shared/utils/index/parse";
import {fileNameFromPath, freeName, getFileExtensionFromPath, isCanvasFile} from "#shared/utils/fs/filenames";
import {rewriteCanvasLinks} from "#shared/utils/index/canvasLinks";
import UpdateLinksModal from "~/components/Modals/UpdateLinksModal.vue";
import FileConflictModal, {type ConflictAction} from "~/components/Modals/FileConflictModal.vue";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {relocatePath, removePath, renamePath} from "~/utils/fs";
import type {OutsideItem} from "~/utils/outsideItems";
import {useFilesHistory, type FilesStep} from "~/composables/active/useFilesHistory";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $tabs = useActiveTabs(session)
    const $qt = useQuickToasts()
    const {t} = useI18n()
    const scope = useSettingsScope()
    const updateLinksModal = useOverlay().create(UpdateLinksModal)
    const conflictModal = useOverlay().create(FileConflictModal)
    const {getFileByUuid, getFileByPath, getFilteredFiles, addFileToIndex, moveFileInIndex, removeFileFromIndex, getRenameImpact, markSelfWrite, updateIndex, notifyModified} = useActiveWorkspaceIndex(session)
    const history = useFilesHistory(session?.uuid)
    const deletedFiles = () => scope.effective.value?.fileConfig.deletedFiles ?? 'trash'

    /**
     * An item put in a trash, with what restoring it needs: the system Trash's record (`trash_item` in Rust), or its
     * path in the workspace's `.trash/` (`workspace`); and the indexed items it took along, parent first, to index
     * them again with their uuids.
     */
    interface Trashed { original: string, trashed?: string | null, deletedAt: number, workspace?: boolean, nodes: { path: string, uuid: string }[] }
    /** What one operation did, as undoing it needs (`remember`). Paths are absolute. */
    interface Change {
        /** Items moved or renamed; what's inside a folder went along. */
        moves: { uuid: string, from: string, to: string }[]
        /** Notes whose links were rewritten. */
        notes: { uuid: string, before: string, after: string }[]
        /** Folders removed once a merge emptied them. */
        merged: { path: string, uuid: string }[]
        /** Items deleted, or replaced in a clash, into a trash. */
        trashed: Trashed[]
        /** Items created (an import, paste or duplicate) as they were then; `trash` holds one while it's undone. */
        created: { path: string, size: number, modified: number, trash?: Trashed }[]
    }
    const newChange = (): Change => ({moves: [], notes: [], merged: [], trashed: [], created: []})

    /** Puts `file` in the system Trash or in the workspace's `.trash/` (under a free name), out of the index and tabs. */
    async function toTrash(file: ActiveWorkspaceFileIndex, where: 'trash' | 'workspaceTrash'): Promise<Trashed> {
        markSelfWrite(file.fullPath)
        let item: Trashed
        if (where === 'workspaceTrash') {
            const dir = await join(session!.rootPath!, '.trash')
            if (!await exists(dir)) await mkdir(dir)
            const path = await join(dir, freeName(file.fileName, (await readDir(dir)).map(e => e.name), file.isFolder))
            await rename(file.fullPath, path)
            item = {original: file.fullPath, trashed: path, deletedAt: Math.floor(Date.now() / 1000), workspace: true, nodes: []}
        } else item = {...await invoke<Omit<Trashed, 'nodes'>>('trash_item', {path: file.fullPath}), nodes: []}
        const removed = removeFileFromIndex(file.fullPath)
        // The route leaves a shown tab first; left on it, the page kept showing the gone note in a plain editor.
        for (const node of removed) await $tabs.closeTabElsewhere(node.uuid)
        item.nodes = removed.reverse().map(n => ({path: n.fullPath, uuid: n.uuid}))
        return item
    }

    /** Puts a trashed item back where it was and indexes it again; false (or a throw) when its place is taken or it's gone. */
    async function fromTrash(item: Trashed) {
        markSelfWrite(...item.nodes.map(n => n.path))
        if (item.workspace) {
            if (await exists(item.original) || !item.trashed || !await exists(item.trashed)) return false
            await rename(item.trashed, item.original)
        } else await invoke('trash_restore', {item: {original: item.original, trashed: item.trashed, deletedAt: item.deletedAt}})
        for (const node of item.nodes) await addFileToIndex(node.path, session!.rootPath!, node.uuid)
    }

    /** Moves the item `uuid` from `from` to `to`, on disk and in the index; false unless it's still at `from`. */
    async function shift(uuid: string, from: string, to: string) {
        if (getFileByUuid(uuid)?.fullPath !== from) return false
        markSelfWrite(from)
        await relocatePath(from, to)
        markSelfWrite(to)
        await moveFileInIndex(from, to, session!.rootPath!)
    }

    /** Writes `text` into the note `uuid` if it still reads `expected`; false otherwise. */
    async function rewrite(uuid: string, expected: string, text: string) {
        const note = getFileByUuid(uuid)
        if (!note || await readTextFile(note.fullPath) !== expected) return false
        markSelfWrite(note.fullPath)
        await writeTextFile(note.fullPath, text)
        await updateIndex(note.fullPath, text)
        notifyModified(note.fullPath)
    }

    const sizeAndTime = async (path: string) => {
        const info = await stat(path)
        return {size: info.size, modified: info.mtime?.getTime() ?? 0}
    }

    /** Runs `work` on each item; returns the names of those it skipped (false) or failed on. */
    async function each<T>(items: T[], path: (item: T) => string, work: (item: T) => Promise<unknown>) {
        const skipped: string[] = []
        for (const item of items) {
            try {
                if (await work(item) === false) skipped.push(fileNameFromPath(path(item)))
            } catch (error) {
                console.error(`[files history] ${path(item)}`, error)
                skipped.push(fileNameFromPath(path(item)))
            }
        }
        return skipped
    }

    /**
     * Reverses `c`, last part first, each item only where it's as the change left it: created items to a trash if
     * unchanged (size and modified time; never deleted for good), notes back if their text is still the change's,
     * merged folders made again, items moved back, and trashed ones restored. Returns what it skipped.
     */
    const undoChange = async (c: Change) => [
        ...await each([...c.created].reverse(), i => i.path, async item => {
            const node = getFileByPath(item.path), now = node && await sizeAndTime(item.path)
            if (!node || now?.size !== item.size || now.modified !== item.modified) return false
            item.trash = await toTrash(node, deletedFiles() === 'workspaceTrash' ? 'workspaceTrash' : 'trash')
        }),
        ...await each(c.notes, n => getFileByUuid(n.uuid)?.fullPath ?? '', n => rewrite(n.uuid, n.after, n.before)),
        ...await each([...c.merged].reverse(), f => f.path, async folder => {
            if (getFileByPath(folder.path)) return
            markSelfWrite(folder.path)
            await mkdir(folder.path)
            await addFileToIndex(folder.path, session!.rootPath!, folder.uuid)
        }),
        ...await each([...c.moves].reverse(), m => m.to, m => shift(m.uuid, m.to, m.from)),
        ...await each([...c.trashed].reverse(), i => i.original, fromTrash),
    ]

    /** Does `c` again after an undo, in its own order and with the same care. Returns what it skipped. */
    const redoChange = async (c: Change) => [
        ...await each(c.trashed, i => i.original, async item => {
            const node = getFileByPath(item.original)
            if (!node) return false
            Object.assign(item, await toTrash(node, item.workspace ? 'workspaceTrash' : 'trash'))
        }),
        ...await each(c.moves, m => m.from, m => shift(m.uuid, m.from, m.to)),
        ...await each(c.merged, f => f.path, async folder => {
            const node = getFileByPath(folder.path)
            if (!node) return
            if (node.children.length) return false
            await removePath(node.fullPath)
            removeFileFromIndex(node.fullPath)
        }),
        ...await each(c.notes, n => getFileByUuid(n.uuid)?.fullPath ?? '', n => rewrite(n.uuid, n.before, n.after)),
        ...await each(c.created, i => i.path, async item => {
            if (!item.trash || await fromTrash(item.trash) === false) return false
            item.trash = undefined
            Object.assign(item, await sizeAndTime(item.path))
        }),
    ]

    /** Keeps `change` as an undo step named `label` if it did anything; `toast` reports it, with an Undo button. */
    function remember(change: Change, label: string, toast?: string) {
        if (!Object.values(change).some(list => list.length)) return
        const step: FilesStep = {label, undo: () => undoChange(change), redo: () => redoChange(change)}
        history.push(step)
        if (toast) $qt.success(toast, undefined, [{label: t('app.editor.ui.filetree.undo'), onClick: () => void history.undo(step)}])
    }

    /**
     * Creates a file or folder relative to `atUuid` (workspace root when absent):
     * `below` = inside it if it is a folder, `same` = next to it, `above` = next to its parent.
     * Throws if the path exists or the write fails.
     */
    async function createFile(atUuid: string | undefined, fileName: string, asFolder = false, atLevel: 'above' | 'same' | 'below' = 'below') {
        const root = session?.rootPath
        if (!root || !fileName) return
        const anchor = getFileByUuid(atUuid)
        let dir = root
        if (anchor) {
            dir = anchor.isFolder && atLevel === 'below' ? anchor.fullPath : await dirname(anchor.fullPath)
            if (atLevel === 'above' && dir !== root) dir = await dirname(dir)
        }
        const path = await join(dir, fileName)
        if (await exists(path)) throw new Error(`"${path}" already exists.`)
        if (asFolder) await mkdir(path, {recursive: true})
        else await writeTextFile(path, '')
        return addFileToIndex(path, root)
    }

    /** Renames a file or folder in place (a file keeps its extension when `newName` has none). Throws on failure. */
    async function renameFile(uuid: string, newName: string) {
        const change = newChange(), name = getFileByUuid(uuid)?.fileName ?? ''
        try {
            await relocateFiles([{uuid, relocate: path => renamePath(path, newName)}], change)
        } finally {
            remember(change, t('app.editor.ui.filetree.stepRename', {name}))
        }
    }

    /** What's directly in the folder `dir` (absolute; the workspace root too). */
    const entriesIn = (dir: string) => getFilteredFiles(f => parentPathOf(f.fullPath) === dir)
    const within = (path: string, folder: string) => path.startsWith(`${folder}/`)

    /** An item going into a folder: the workspace's own (a move) or from outside (an import). */
    interface Incoming<T> { name: string, isFolder: boolean, size: number, modified: Date | number, children: () => T[] }
    type Side = { isFolder: boolean, size: number, modified: Date | number }
    /** Where an item goes (`dir`, `name`), and what's in the way: an indexed item (`uuid`) or another incoming one. */
    type Step<T> = { item: T, dir: string, name: string, clash?: Side & { uuid?: string }, rival?: Step<T>, action?: ConflictAction }

    /**
     * Plans items going into the folder `destDir` (absolute), as a file manager does, before anything happens:
     * - a folder onto a folder of the same name merges: its contents are planned into that folder instead (`merged`);
     * - a name already taken (ignoring case, by an indexed item or by another incoming one) asks through
     *   `FileConflictModal`: Replace, Keep both ("Note 2.md", the name is chosen here) or Skip, optionally for every
     *   clash left. Replacing another incoming item means that one stays out.
     * `preset` answers a clash without asking (paste's Keep both in the item's own folder); such an item never merges.
     * Returns the steps to carry out (skipped ones dropped), or false when cancelled.
     */
    async function planInto<T extends Incoming<T>>(items: T[], destDir: string, preset?: (item: T, dir: string) => ConflictAction | undefined) {
        const root = session!.rootPath!
        const steps: Step<T>[] = [], merged: T[] = []
        const claimed = new Map<string, Step<T>>()
        const plan = (item: T, dir: string) => {
            const lower = item.name.toLowerCase(), key = `${dir}/${lower}`
            const clash = entriesIn(dir).find(e => e.fileName.toLowerCase() === lower)
            const answer = preset?.(item, dir)
            if (clash?.isFolder && item.isFolder && !answer) {
                merged.push(item)
                for (const child of item.children()) plan(child, clash.fullPath)
                return
            }
            const rival = clash ? undefined : claimed.get(key)
            const step: Step<T> = {
                item, dir, name: item.name, rival,
                clash: clash ? {uuid: clash.uuid, isFolder: clash.isFolder, size: clash.size, modified: clash.modifiedTime} : rival && {...rival.item},
            }
            if (step.clash) step.action = answer
            steps.push(step)
            claimed.set(key, step)
        }
        for (const item of items) plan(item, destDir)

        const clashes = steps.filter(s => s.clash && !s.action)
        let always: ConflictAction | undefined
        for (const [i, step] of clashes.entries()) {
            if (!always) {
                const answer = await conflictModal.open({
                    name: step.item.name,
                    folder: step.dir === root ? fileNameFromPath(root) : getFileByPath(step.dir)?.relativePath ?? step.dir,
                    existing: step.clash!,
                    incoming: step.item,
                    remaining: clashes.length - i - 1,
                }).result
                if (!answer || answer.action === 'cancel') return false
                if (answer.all) always = answer.action
                step.action = answer.action
            } else step.action = always
        }
        for (const step of steps) if (step.action === 'replace' && step.rival) step.rival.action = 'skip'

        const used = new Map<string, string[]>()
        for (const step of steps) {
            if (step.action === 'skip') continue
            const names = used.get(step.dir) ?? []
            if (step.action === 'keepBoth') step.name = freeName(step.name, [...entriesIn(step.dir).map(e => e.fileName), ...names], step.item.isFolder)
            used.set(step.dir, [...names, step.name])
        }
        return {steps: steps.filter(s => s.action !== 'skip'), merged}
    }

    /** The indexed items a plan replaces (a clash with another incoming item has no uuid: that one just stays out). */
    const replacedBy = <T>(steps: Step<T>[]) => steps.flatMap(s => s.action === 'replace' && s.clash?.uuid ? [s.clash.uuid] : [])

    type Indexed = Incoming<Indexed> & { file: ActiveWorkspaceFileIndex }
    const asIncoming = (file: ActiveWorkspaceFileIndex): Indexed => ({
        name: file.fileName, isFolder: file.isFolder, size: file.size, modified: file.modifiedTime, file,
        children: () => file.children.flatMap(path => {
            const child = getFileByPath(path)
            return child ? [asIncoming(child)] : []
        }),
    })

    /**
     * Moves files and folders into the folder `destDir` (absolute), as a file manager does. An item inside another
     * moved folder goes with it; one already in `destDir`, or a folder into itself, stays. Clashes and merges are
     * `planInto`'s, all asked before anything moves, so Cancel moves nothing; a merged folder is removed once empty.
     * Then one `relocateFiles`, so the links get one dialog. One undo step, and a "Moved N item(s)" toast with Undo.
     * Returns false when cancelled; throws the first failure, after moving the rest.
     */
    async function moveFiles(uuids: string[], destDir: string) {
        const change = newChange()
        try {
            return await moveInto(uuids, destDir, change)
        } finally {
            const count = change.moves.length
            remember(change, t('app.editor.ui.filetree.stepMove', {count}), t('app.editor.ui.filetree.moved', {count}))
        }
    }

    async function moveInto(uuids: string[], destDir: string, change: Change) {
        if (!session?.rootPath) return false
        const picked = uuids.map(id => getFileByUuid(id)).filter(f => !!f)
        const top = picked.filter(f => !picked.some(o => o.isFolder && within(f.fullPath, o.fullPath))
            && parentPathOf(f.fullPath) !== destDir
            && !(f.isFolder && (destDir === f.fullPath || within(destDir, f.fullPath))))
        const plan = await planInto(top.map(asIncoming), destDir)
        if (!plan) return false

        await removeItems(replacedBy(plan.steps), change)
        try {
            await relocateFiles(plan.steps.map(({item, dir, name}) => ({uuid: item.file.uuid, relocate: async (path: string) => relocatePath(path, await join(dir, name))})), change)
        } finally {
            // Merged folders left empty, deepest first; one with a skipped item stays.
            for (const {file} of plan.merged.reverse()) {
                const node = getFileByUuid(file.uuid)
                if (node && !node.children.length) {
                    await removePath(node.fullPath)
                    removeFileFromIndex(node.fullPath)
                    change.merged.push({path: node.fullPath, uuid: node.uuid})
                }
            }
        }
        return true
    }

    /** The indexed item an outside one is: by its path when known, else the one item with its name, size and modified
     *  time (a folder: the same contents, recursively). Several matches are no match. */
    function indexedMatch(item: OutsideItem): string | undefined {
        if (item.path) return getFileByPath(item.path)?.uuid
        const same = (file: ActiveWorkspaceFileIndex, it: OutsideItem): boolean => {
            if (file.fileName !== it.name || file.isFolder !== it.isFolder) return false
            if (!it.isFolder) return file.size === it.size && Math.abs(+file.modifiedTime - +it.modified) < 2000
            const mine = file.children.flatMap(path => getFileByPath(path) ?? []), theirs = it.children()
            return mine.length === theirs.length && theirs.every(t => mine.some(m => same(m, t)))
        }
        const hits = getFilteredFiles(f => same(f, item))
        return hits.length === 1 ? hits[0]!.uuid : undefined
    }

    /**
     * Brings files and folders from outside (a drop or a paste) into the folder `destDir` (absolute). Items already in
     * the workspace (`indexedMatch`) move there instead, as on the same disk in a file manager, unless `copy` (Option
     * or Alt held, or a paste) copies them. With `inPlace` (paste, Duplicate), an item copied into the folder it's in
     * is named like Keep both without asking, as Finder does. The rest are copied in: clashes and merges as `planInto`
     * plans them, a pasted file by path (`copyFile`), a dropped one from its bytes, each path marked as Vertex's own
     * write and indexed parent-first. One undo step; one toast reports what was added (with Undo) and one what failed.
     * Returns the uuids of everything that ended up in `destDir`, or false when cancelled.
     */
    async function importItems(items: OutsideItem[], destDir: string, options: { copy?: boolean, inPlace?: boolean } = {}) {
        const change = newChange()
        try {
            return await importInto(items, destDir, options, change)
        } finally {
            const added = change.created.length, moved = change.moves.length
            remember(
                change,
                added ? t('app.editor.ui.filetree.stepAdd', {count: added}) : t('app.editor.ui.filetree.stepMove', {count: moved}),
                added ? t('app.editor.ui.filetree.added', {count: added}) : moved ? t('app.editor.ui.filetree.moved', {count: moved}) : undefined,
            )
        }
    }

    async function importInto(items: OutsideItem[], destDir: string, {copy = false, inPlace = false}, change: Change) {
        const root = session?.rootPath
        if (!root || !items.length) return []
        const found: string[] = [], outside: OutsideItem[] = []
        for (const item of items) {
            const uuid = copy ? undefined : indexedMatch(item)
            if (uuid) found.push(uuid)
            else outside.push(item)
        }
        if (found.length && !await moveInto(found, destDir, change)) return false
        const plan = await planInto(outside, destDir, inPlace ? (item, dir) => item.source && parentPathOf(item.source) === dir ? 'keepBoth' : undefined : undefined)
        if (!plan) return found

        await removeItems(replacedBy(plan.steps), change)
        const added: string[] = [], failed: string[] = []
        const write = async (item: OutsideItem, path: string) => {
            try {
                markSelfWrite(path)
                if (item.isFolder) await mkdir(path)
                else if (item.source) await copyFile(item.source, path)
                else await writeFile(path, await item.read!())
                await addFileToIndex(path, root)
                if (item.isFolder) for (const child of item.children()) await write(child, await join(path, child.name))
            } catch (error) {
                console.error(`[importItems] could not add ${path}`, error)
                failed.push(item.name)
            }
        }
        for (const {item, dir, name} of plan.steps) {
            const path = await join(dir, name)
            await write(item, path)
            const uuid = getFileByPath(path)?.uuid
            if (!uuid) continue
            added.push(uuid)
            // As it is once written (a folder's time moves as its contents arrive): Undo trashes it only if unchanged.
            change.created.push({path, ...await sizeAndTime(path)})
        }
        if (failed.length) $qt.error(t('app.editor.ui.filetree.addFailed', {names: failed.join(', ')}))
        return [...found, ...added]
    }

    const filesIn = (node: ActiveWorkspaceFileIndex): ActiveWorkspaceFileIndex[] => node.isFolder
        ? node.children.flatMap(path => {
            const child = getFileByPath(path)
            return child ? filesIn(child) : []
        })
        : [node]

    /** One item to move or rename: `relocate` does it on disk and returns the new path. */
    type Relocation = { uuid: string, relocate: (path: string) => Promise<string> }

    /**
     * Moves or renames files and folders on disk and in the index (uuids stay, so open tabs and expanded folders
     * follow), then updates the links that pointed at them, or at the notes inside them, as `fileConfig.updateLinks`
     * says: asking once for all of them (the dialog can remember the answer for the workspace), always, or never.
     * Links not updated stay as written and become unresolved, never silently dropped. Only links whose text
     * changes count: `[[Note]]` still finds a note moved to another folder. One failing item doesn't stop the rest;
     * the first failure is thrown after the links are done. What it did goes into `change`.
     */
    async function relocateFiles(relocations: Relocation[], change: Change) {
        if (!session?.rootPath) return
        const items = relocations.flatMap(r => {
            const file = getFileByUuid(r.uuid)
            return file ? [{...r, file}] : []
        })
        if (!items.length) return
        // What links to the moved notes has to be read before the moves: afterwards those targets don't resolve.
        const moved = items.flatMap(({file}) => filesIn(file).map(f => ({uuid: f.uuid, oldRel: f.relativePath, impact: getRenameImpact(f.uuid)})))
        let failure: unknown
        for (const {file, relocate} of items) {
            try {
                const from = file.fullPath
                markSelfWrite(from)
                const to = await relocate(from)
                markSelfWrite(to)
                await moveFileInIndex(from, to, session.rootPath)
                change.moves.push({uuid: file.uuid, from, to})
            } catch (error) {
                failure ??= error
            }
        }
        await updateMovedLinks(moved, items.length === 1 ? items[0]!.file.fileName : undefined, items.length, change)
        if (failure) throw failure
    }

    type Moved = { uuid: string, oldRel: string, impact: ReturnType<typeof getRenameImpact> }
    async function updateMovedLinks(moved: Moved[], fileName: string | undefined, count: number, change: Change) {
        if (!session) return
        // Per linking note (by uuid: it may have moved too), each old target and its new text.
        const changes = new Map<string, Map<string, string>>()
        for (const {uuid: id, oldRel, impact} of moved) {
            const newRel = getFileByUuid(id)?.relativePath
            if (!newRel || newRel === oldRel) continue
            for (const {file: ref, targets} of impact) {
                for (const [from, to] of renameTargets(targets, oldRel, newRel)) {
                    if (from === to) continue
                    if (!changes.has(ref.uuid)) changes.set(ref.uuid, new Map())
                    changes.get(ref.uuid)!.set(from, to)
                }
            }
        }
        if (changes.size === 0) return

        const choice = scope.effective.value?.fileConfig.updateLinks ?? 'ask'
        let update = choice === 'update'
        if (choice === 'ask') {
            const answer = await updateLinksModal.open({
                fileName: fileName ?? '',
                count,
                referencingFiles: [...changes.keys()].map(id => getFileByUuid(id)?.relativePath ?? ''),
                linkCount: [...changes.values()].reduce((n, m) => n + m.size, 0),
                canRemember: session.workspaceSession,
            }).result
            update = !!answer?.update
            if (answer?.remember) await scope.set({'fileConfig.updateLinks': update ? 'update' : 'keep'})
        }
        if (!update) return

        let rewritten = 0
        for (const [id, targets] of changes) {
            const ref = getFileByUuid(id)
            if (!ref) continue
            try {
                const before = await readTextFile(ref.fullPath)
                const result = (isCanvasFile(getFileExtensionFromPath(ref.fileName)) ? rewriteCanvasLinks : rewriteLinks)(before, targets)
                if (result.count === 0) continue
                markSelfWrite(ref.fullPath)
                await writeTextFile(ref.fullPath, result.text)
                await updateIndex(ref.fullPath, result.text)
                notifyModified(ref.fullPath)
                change.notes.push({uuid: id, before, after: result.text})
                rewritten += result.count
            } catch (error) {
                console.error(`[relocateFiles] could not update links in ${ref.fullPath}`, error)
                $qt.error(t('app.editor.ui.updateLinks.failed', {file: ref.relativePath}))
            }
        }
        $qt.success(t('app.editor.ui.updateLinks.done', {links: rewritten}))
    }

    /**
     * Deletes as `fileConfig.deletedFiles` says: into the system Trash or the workspace's `.trash/`, as one undo step
     * with a toast offering Undo, or for good (after `DeleteFilesModal` asked), which can't be undone.
     */
    async function deleteFiles(uuids: string[]) {
        const change = newChange(), where = deletedFiles()
        await removeItems(uuids, change)
        const count = change.trashed.length
        remember(change, t('app.editor.ui.filetree.stepDelete', {count}), t(where === 'workspaceTrash' ? 'app.editor.ui.filetree.trashedWorkspace' : 'app.editor.ui.filetree.trashed', {count}))
    }

    /** Removes items (deleted ones, or ones a clash's Replace displaces) as the setting says; a trashed one goes into `change`. */
    async function removeItems(uuids: string[], change: Change) {
        const where = deletedFiles()
        for (const uuid of uuids) {
            const file = getFileByUuid(uuid)
            if (!file) continue
            try {
                if (where !== 'permanent') change.trashed.push(await toTrash(file, where))
                else {
                    await removePath(file.fullPath)
                    // Everything removed (a folder's notes too) loses its tab.
                    for (const removed of removeFileFromIndex(file.fullPath)) await $tabs.closeTabElsewhere(removed.uuid)
                }
            } catch (error) {
                console.error(`[deleteFiles] could not delete ${file.fullPath}`, error)
                $qt.error(t('app.editor.ui.filetree.deleteFailed', {name: file.fileName}), String(error))
            }
        }
    }

    /** Writes a document the user edited and re-indexes it, without the watcher treating it as an external edit. */
    async function saveContent(uuid: string, content: string) {
        const path = getFileByUuid(uuid)?.fullPath
        if (!path) return
        markSelfWrite(path)
        await writeTextFile(path, content)
        await updateIndex(path, content)
    }

    /** The workspace folder at `relative` (`''`: the top level), created and indexed if missing. Returns its full path. */
    async function ensureFolder(relative: string) {
        const root = session!.rootPath!
        let path = root
        for (const part of relative.split('/').filter(Boolean)) {
            path = await join(path, part)
            if (getFileByPath(path)) continue
            markSelfWrite(path)
            if (!await exists(path)) await mkdir(path)
            await addFileToIndex(path, root)
        }
        return path
    }

    return {createFile, renameFile, moveFiles, importItems, indexedMatch, ensureFolder, deleteFiles, deletedFiles, saveContent, undo: history.undo, redo: history.redo, undoLabel: history.undoLabel, redoLabel: history.redoLabel}
}
