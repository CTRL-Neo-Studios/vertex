import {exists, mkdir, readTextFile, writeTextFile} from "@tauri-apps/plugin-fs"
import {dirname, join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {renameTargets, rewriteLinks} from "#shared/utils/index/rewriteLinks";
import UpdateLinksModal from "~/components/Modals/UpdateLinksModal.vue";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {removePath, renamePath} from "~/utils/fs";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $tabs = useActiveTabs(session)
    const $qt = useQuickToasts()
    const {t} = useI18n()
    const updateLinksModal = useOverlay().create(UpdateLinksModal)
    const {getFileByUuid, addFileToIndex, moveFileInIndex, removeFileFromIndex, getRenameImpact, markSelfWrite, updateIndex, notifyModified} = useActiveWorkspaceIndex(session)

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

    /**
     * Renames a file/folder on disk and in the index (keeping its extension if `newName` has none).
     * If other notes link to it, asks whether to rewrite those links; if declined they stay as-is and
     * become unresolved (never silently dropped). Throws on failure so callers can revert UI.
     */
    async function renameFile(uuid: string, newName: string) {
        const file = getFileByUuid(uuid)
        if (!session?.rootPath || !file || !newName) return
        const {fullPath: oldPath, relativePath: oldRel} = file
        const impact = file.isFolder ? [] : getRenameImpact(file.uuid)
        markSelfWrite(oldPath)
        const newPath = await renamePath(oldPath, newName)
        markSelfWrite(newPath)
        await moveFileInIndex(oldPath, newPath, session.rootPath)
        if (impact.length === 0) return newPath

        const accepted = await updateLinksModal.open({
            fileName: file.fileName,
            referencingFiles: impact.map(i => i.file.relativePath),
            linkCount: impact.reduce((n, i) => n + i.targets.length, 0),
        }).result
        if (!accepted) return newPath

        const newRel = getFileByUuid(file.uuid)!.relativePath
        let rewritten = 0
        for (const {file: ref, targets} of impact) {
            try {
                const result = rewriteLinks(await readTextFile(ref.fullPath), renameTargets(targets, oldRel, newRel))
                if (result.count === 0) continue
                markSelfWrite(ref.fullPath)
                await writeTextFile(ref.fullPath, result.text)
                await updateIndex(ref.fullPath, result.text)
                notifyModified(ref.fullPath)
                rewritten += result.count
            } catch (error) {
                console.error(`[renameFile] could not update links in ${ref.fullPath}`, error)
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

    return {createFile, renameFile, deleteFiles, saveContent}
}
