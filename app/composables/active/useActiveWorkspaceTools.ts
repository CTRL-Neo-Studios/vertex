import {copyFile, exists, mkdir, readTextFile, writeFile, writeTextFile} from "@tauri-apps/plugin-fs"
import {dirname, join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {renameTargets, rewriteLinks} from "#shared/utils/index/rewriteLinks";
import {parentPathOf} from "#shared/utils/index/parse";
import {fileNameFromPath, freeName} from "#shared/utils/fs/filenames";
import UpdateLinksModal from "~/components/Modals/UpdateLinksModal.vue";
import FileConflictModal, {type ConflictAction} from "~/components/Modals/FileConflictModal.vue";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {relocatePath, removePath, renamePath} from "~/utils/fs";
import type {OutsideItem} from "~/utils/outsideItems";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $tabs = useActiveTabs(session)
    const $qt = useQuickToasts()
    const {t} = useI18n()
    const scope = useSettingsScope()
    const updateLinksModal = useOverlay().create(UpdateLinksModal)
    const conflictModal = useOverlay().create(FileConflictModal)
    const {getFileByUuid, getFileByPath, getFilteredFiles, addFileToIndex, moveFileInIndex, removeFileFromIndex, getRenameImpact, markSelfWrite, updateIndex, notifyModified} = useActiveWorkspaceIndex(session)

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
    const renameFile = (uuid: string, newName: string) => relocateFiles([{uuid, relocate: path => renamePath(path, newName)}])

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
     * Then one `relocateFiles`, so the links get one dialog. Returns false when cancelled; throws the first failure,
     * after moving the rest.
     */
    async function moveFiles(uuids: string[], destDir: string) {
        if (!session?.rootPath) return false
        const picked = uuids.map(id => getFileByUuid(id)).filter(f => !!f)
        const top = picked.filter(f => !picked.some(o => o.isFolder && within(f.fullPath, o.fullPath))
            && parentPathOf(f.fullPath) !== destDir
            && !(f.isFolder && (destDir === f.fullPath || within(destDir, f.fullPath))))
        const plan = await planInto(top.map(asIncoming), destDir)
        if (!plan) return false

        const replaced = replacedBy(plan.steps)
        if (replaced.length) await deleteFiles(replaced)
        try {
            await relocateFiles(plan.steps.map(({item, dir, name}) => ({uuid: item.file.uuid, relocate: async (path: string) => relocatePath(path, await join(dir, name))})))
        } finally {
            // Merged folders left empty, deepest first; one with a skipped item stays.
            for (const {file} of plan.merged.reverse()) {
                const node = getFileByUuid(file.uuid)
                if (node && !node.children.length) {
                    await removePath(node.fullPath)
                    removeFileFromIndex(node.fullPath)
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
     * write and indexed parent-first. One toast reports what was added and what failed. Returns the uuids of
     * everything that ended up in `destDir`, or false when cancelled.
     */
    async function importItems(items: OutsideItem[], destDir: string, {copy = false, inPlace = false} = {}) {
        const root = session?.rootPath
        if (!root || !items.length) return []
        const found: string[] = [], outside: OutsideItem[] = []
        for (const item of items) {
            const uuid = copy ? undefined : indexedMatch(item)
            if (uuid) found.push(uuid)
            else outside.push(item)
        }
        if (found.length && !await moveFiles(found, destDir)) return false
        const plan = await planInto(outside, destDir, inPlace ? (item, dir) => item.source && parentPathOf(item.source) === dir ? 'keepBoth' : undefined : undefined)
        if (!plan) return found

        const replaced = replacedBy(plan.steps)
        if (replaced.length) await deleteFiles(replaced)
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
            if (uuid) added.push(uuid)
        }
        if (added.length) $qt.success(t('app.editor.ui.filetree.added', {count: added.length}))
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
     * the first failure is thrown after the links are done.
     */
    async function relocateFiles(relocations: Relocation[]) {
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
                markSelfWrite(file.fullPath)
                const newPath = await relocate(file.fullPath)
                markSelfWrite(newPath)
                await moveFileInIndex(file.fullPath, newPath, session.rootPath)
            } catch (error) {
                failure ??= error
            }
        }
        await updateMovedLinks(moved, items.length === 1 ? items[0]!.file.fileName : undefined, items.length)
        if (failure) throw failure
    }

    type Moved = { uuid: string, oldRel: string, impact: ReturnType<typeof getRenameImpact> }
    async function updateMovedLinks(moved: Moved[], fileName: string | undefined, count: number) {
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
        for (const [id, rename] of changes) {
            const ref = getFileByUuid(id)
            if (!ref) continue
            try {
                const result = rewriteLinks(await readTextFile(ref.fullPath), rename)
                if (result.count === 0) continue
                markSelfWrite(ref.fullPath)
                await writeTextFile(ref.fullPath, result.text)
                await updateIndex(ref.fullPath, result.text)
                notifyModified(ref.fullPath)
                rewritten += result.count
            } catch (error) {
                console.error(`[relocateFiles] could not update links in ${ref.fullPath}`, error)
                $qt.error(t('app.editor.ui.updateLinks.failed', {file: ref.relativePath}))
            }
        }
        $qt.success(t('app.editor.ui.updateLinks.done', {links: rewritten}))
    }

    async function deleteFiles(uuids: string[]) {
        for (const uuid of uuids) {
            const file = getFileByUuid(uuid)
            if (!file) continue
            try {
                await removePath(file.fullPath)
                // Everything removed (a folder's notes too) loses its tab.
                for (const removed of removeFileFromIndex(file.fullPath)) $tabs.closeTab(removed.uuid)
            } catch (error) {
                console.error(`[deleteFiles] could not delete ${file.fullPath}`, error)
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

    return {createFile, renameFile, moveFiles, importItems, deleteFiles, saveContent}
}
