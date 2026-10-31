import {save} from "@tauri-apps/plugin-dialog";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveSinglespaceFileIndex, ActiveWorkspaceFileIndex, IndexEvent} from "#shared/types/active/workspace";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useFileIO} from "~/composables/io/useFileIO";

type AnyFile = ActiveWorkspaceFileIndex | ActiveSinglespaceFileIndex

/**
 * One file-operations surface for the open session, whichever mode it is in.
 * Workspace sessions delegate to the workspace index/tools (link graph, rename prompt);
 * singlespace sessions use the single-file index.
 */
export function useActiveFileTools(session?: ActiveSession) {
    const $fileio = useFileIO()
    const $tabs = useActiveTabs(session)
    const isWorkspace = !!session?.workspaceSession
    const ws = useActiveWorkspaceIndex(session)
    const ss = useActiveSinglespaceIndex(session)
    const wsTools = isWorkspace ? useActiveWorkspaceTools(session) : undefined
    const index = isWorkspace ? ws : ss

    function getFileByUuid(uuid: string | undefined | null): AnyFile | null {
        return index.getFileByUuid(uuid ?? undefined)
    }

    async function saveContent(uuid: string, content: string) {
        const path = getFileByUuid(uuid)?.fullPath
        if (!path) return
        index.markSelfWrite(path)
        await $fileio.writeTextToFile(path, content)
        await index.updateIndex(path, content)
    }

    async function renameFile(uuid: string, newName: string) {
        if (wsTools) return wsTools.renameFile(uuid, newName)
        const file = ss.getFileByUuid(uuid)
        if (!file) return
        ss.markSelfWrite(file.fullPath)
        const newPath = await $fileio.renameFileOrFolder(file.fullPath, newName)
        await ss.moveFileInIndex(file.fullPath, newPath)
        return newPath
    }

    async function deleteFiles(uuids: string[]) {
        if (wsTools) return wsTools.deleteFiles(uuids)
        for (const uuid of uuids) {
            const file = ss.getFileByUuid(uuid)
            if (!file) continue
            await $fileio.deleteFileOrFolder(file.fullPath)
            ss.removeFileFromIndex(file.fullPath)
            $tabs.closeTab(uuid)
        }
    }

    /** "Untitled" buffer in a singlespace window; saved to disk by `saveTemporaryFileAs`. */
    function isTemporary(uuid: string) {
        return !isWorkspace && ss.isIndexTemporary(uuid)
    }

    async function saveTemporaryFileAs(uuid: string, content: string) {
        const path = await save({filters: [{name: 'Markdown Files', extensions: ['md', 'mdx']}, {name: 'Text Files', extensions: ['txt']}]})
        if (!path || !isTemporary(uuid)) return
        const node = await ss.convertTemporaryToValidIndex(uuid, path, content)
        ss.markSelfWrite(path)
        await $fileio.writeTextToFile(path, content)
        return node
    }

    return {
        isWorkspace,
        getFileByUuid,
        relativePathOf: (file: AnyFile | null | undefined) => (file && 'relativePath' in file ? file.relativePath : file?.fullPath),
        linkableFiles: () => (isWorkspace ? ws.getFilteredFiles(f => !f.isFolder) : []),
        saveContent,
        renameFile,
        deleteFiles,
        isTemporary,
        saveTemporaryFileAs,
        on: (listener: (event: IndexEvent<AnyFile>) => void) => (isWorkspace ? ws.on(listener) : ss.on(listener)),
    }
}
