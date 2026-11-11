import {exists, mkdir, readTextFile, writeTextFile} from "@tauri-apps/plugin-fs"
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

    /**
     * Moves files and folders into the folder `destDir` (absolute), as a file manager does.
     * - An item inside another moved folder goes with it. One already in `destDir`, or a folder into itself, stays.
     * - A name already taken there (ignoring case, by an item or by another one in this move) asks through
     *   `FileConflictModal`: Replace, Keep both ("Note 2.md") or Skip, optionally for every clash left.
     * - A folder onto a folder of the same name merges: its contents move in (their clashes ask), and it's removed
     *   once empty.
     * Everything is asked before anything moves, so Cancel moves nothing. Then one `relocateFiles`, so the links get
     * one dialog. Returns false when cancelled; throws the first failure, after moving the rest.
     */
    async function moveFiles(uuids: string[], destDir: string) {
        const root = session?.rootPath
        if (!root) return false
        const picked = uuids.map(id => getFileByUuid(id)).filter(f => !!f)
        const top = picked.filter(f => !picked.some(o => o.isFolder && within(f.fullPath, o.fullPath))
            && parentPathOf(f.fullPath) !== destDir
            && !(f.isFolder && (destDir === f.fullPath || within(destDir, f.fullPath))))

        type Step = { file: ActiveWorkspaceFileIndex, dir: string, clash?: ActiveWorkspaceFileIndex, rival?: Step, action?: ConflictAction }
        const steps: Step[] = [], merged: ActiveWorkspaceFileIndex[] = []
        const claimed = new Map<string, Step>()
        const plan = (file: ActiveWorkspaceFileIndex, dir: string) => {
            const key = `${dir}/${file.fileName.toLowerCase()}`
            const clash = entriesIn(dir).find(e => e.fileName.toLowerCase() === file.fileName.toLowerCase())
            if (clash?.isFolder && file.isFolder) {
                merged.push(file)
                for (const path of file.children) {
                    const child = getFileByPath(path)
                    if (child) plan(child, clash.fullPath)
                }
                return
            }
            const rival = clash ? undefined : claimed.get(key)
            const step: Step = {file, dir, clash: clash ?? rival?.file, rival}
            steps.push(step)
            claimed.set(key, step)
        }
        for (const file of top) plan(file, destDir)

        const clashes = steps.filter(s => s.clash)
        let always: ConflictAction | undefined
        for (const [i, step] of clashes.entries()) {
            if (!always) {
                const answer = await conflictModal.open({
                    name: step.file.fileName,
                    folder: step.dir === root ? fileNameFromPath(root) : getFileByPath(step.dir)?.relativePath ?? step.dir,
                    existing: {isFolder: step.clash!.isFolder, size: step.clash!.size, modified: step.clash!.modifiedTime},
                    incoming: {isFolder: step.file.isFolder, size: step.file.size, modified: step.file.modifiedTime},
                    remaining: clashes.length - i - 1,
                }).result
                if (!answer || answer.action === 'cancel') return false
                if (answer.all) always = answer.action
                step.action = answer.action
            } else step.action = always
        }
        // Replacing another item of this move means that one stays where it is.
        for (const step of steps) if (step.action === 'replace' && step.rival) step.rival.action = 'skip'

        const replaced: string[] = [], items: Relocation[] = [], used = new Map<string, string[]>()
        for (const step of steps) {
            if (step.action === 'skip') continue
            if (step.action === 'replace' && !step.rival) replaced.push(step.clash!.uuid)
            const names = used.get(step.dir) ?? []
            const name = step.action === 'keepBoth'
                ? freeName(step.file.fileName, [...entriesIn(step.dir).map(e => e.fileName), ...names], step.file.isFolder)
                : step.file.fileName
            used.set(step.dir, [...names, name])
            items.push({uuid: step.file.uuid, relocate: async path => relocatePath(path, await join(step.dir, name))})
        }
        if (replaced.length) await deleteFiles(replaced)
        try {
            await relocateFiles(items)
        } finally {
            // Merged folders left empty, deepest first; one with a skipped item stays.
            for (const folder of merged.reverse()) {
                const node = getFileByUuid(folder.uuid)
                if (node && !node.children.length) {
                    await removePath(node.fullPath)
                    removeFileFromIndex(node.fullPath)
                }
            }
        }
        return true
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

    return {createFile, renameFile, moveFiles, deleteFiles, saveContent}
}
