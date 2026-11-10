import {exists, mkdir, readTextFile, writeTextFile} from "@tauri-apps/plugin-fs"
import {dirname, join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {renameTargets, rewriteLinks} from "#shared/utils/index/rewriteLinks";
import UpdateLinksModal from "~/components/Modals/UpdateLinksModal.vue";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {movePath, removePath, renamePath} from "~/utils/fs";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $tabs = useActiveTabs(session)
    const $qt = useQuickToasts()
    const {t} = useI18n()
    const scope = useSettingsScope()
    const updateLinksModal = useOverlay().create(UpdateLinksModal)
    const {getFileByUuid, getFileByPath, addFileToIndex, moveFileInIndex, removeFileFromIndex, getRenameImpact, markSelfWrite, updateIndex, notifyModified} = useActiveWorkspaceIndex(session)

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
    const renameFile = (uuid: string, newName: string) => relocateFile(uuid, path => renamePath(path, newName))

    /** Moves a file or folder into the folder `destDir` (an absolute path), keeping its name. Throws on failure. */
    const moveFile = (uuid: string, destDir: string) => relocateFile(uuid, path => movePath(path, destDir))

    const filesIn = (node: ActiveWorkspaceFileIndex): ActiveWorkspaceFileIndex[] => node.isFolder
        ? node.children.flatMap(path => {
            const child = getFileByPath(path)
            return child ? filesIn(child) : []
        })
        : [node]

    /**
     * Moves or renames a file or folder on disk and in the index (uuids stay, so open tabs and expanded folders
     * follow), then updates the links that pointed at it, or at the notes inside it, as `fileConfig.updateLinks`
     * says: asking (the dialog can remember the answer for the workspace), always, or never. Links not updated stay
     * as written and become unresolved, never silently dropped. Only links whose text changes count: `[[Note]]`
     * still finds a note moved to another folder.
     */
    async function relocateFile(uuid: string, relocate: (path: string) => Promise<string>) {
        const file = getFileByUuid(uuid)
        if (!session?.rootPath || !file) return
        // What links to the moved notes has to be read before the move: afterwards those targets don't resolve.
        const moved = filesIn(file).map(f => ({uuid: f.uuid, oldRel: f.relativePath, impact: getRenameImpact(f.uuid)}))
        markSelfWrite(file.fullPath)
        const newPath = await relocate(file.fullPath)
        markSelfWrite(newPath)
        await moveFileInIndex(file.fullPath, newPath, session.rootPath)

        // Per linking note (by uuid: it may have moved too), each old target and its new text.
        const changes = new Map<string, Map<string, string>>()
        for (const {uuid: id, oldRel, impact} of moved) {
            const newRel = getFileByUuid(id)?.relativePath
            if (!newRel) continue
            for (const {file: ref, targets} of impact) {
                for (const [from, to] of renameTargets(targets, oldRel, newRel)) {
                    if (from === to) continue
                    if (!changes.has(ref.uuid)) changes.set(ref.uuid, new Map())
                    changes.get(ref.uuid)!.set(from, to)
                }
            }
        }
        if (changes.size === 0) return newPath

        const choice = scope.effective.value?.fileConfig.updateLinks ?? 'ask'
        let update = choice === 'update'
        if (choice === 'ask') {
            const answer = await updateLinksModal.open({
                fileName: file.fileName,
                referencingFiles: [...changes.keys()].map(id => getFileByUuid(id)?.relativePath ?? ''),
                linkCount: [...changes.values()].reduce((n, m) => n + m.size, 0),
                canRemember: session.workspaceSession,
            }).result
            update = !!answer?.update
            if (answer?.remember) await scope.set({'fileConfig.updateLinks': update ? 'update' : 'keep'})
        }
        if (!update) return newPath

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
                console.error(`[relocateFile] could not update links in ${ref.fullPath}`, error)
                $qt.error(t('app.editor.ui.updateLinks.failed', {file: ref.relativePath}))
            }
        }
        $qt.success(t('app.editor.ui.updateLinks.done', {links: rewritten}))
        return newPath
    }

    async function deleteFiles(uuids: string[]) {
        for (const uuid of uuids) {
            const file = getFileByUuid(uuid)
            if (!file) continue
            try {
                await removePath(file.fullPath)
                removeFileFromIndex(file.fullPath)
                $tabs.closeTab(uuid)
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

    return {createFile, renameFile, moveFile, deleteFiles, saveContent}
}
