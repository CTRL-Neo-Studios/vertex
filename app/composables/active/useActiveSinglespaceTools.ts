import type {ActiveSession} from "#shared/types/active/sessions";
import {useFileIO} from "~/composables/io/useFileIO";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {save} from "@tauri-apps/plugin-dialog"
import {stat} from "@tauri-apps/plugin-fs";
import useQuickToasts from "~/composables/utility/useQuickToasts";

export function useActiveSinglespaceTools(session?: ActiveSession) {
    if (!session) {
        console.error("useActiveSinglespaceIndex was called without a session!");
    }

    const $fileio = useFileIO()
    const $tabs = useActiveTabs(session)
    const $qt = useQuickToasts()
    const {
        getFileByUuid,
        moveFileInIndex,
        setTemporaryIndex,
        isIndexTemporary,
        convertTemporaryToValidIndex,
        removeFileFromIndex
    } = useActiveSinglespaceIndex(session)

    /**
     * Creates a new temporary unsaved file in the singlespace editor window.
     */
    function createTemporaryFile() {
        if (!session?.rootPath) return;
        return setTemporaryIndex()
    }

    async function saveTemporaryFile(fileUuid: PossiblyRef<string>, fileContent: PossiblyRef<string>) {
        const path = await save({
            filters: [{
                name: 'Markdown Files',
                extensions: ['md', 'mdx']
            }, {
                name: 'Text Files',
                extensions: ['txt']
            }]
        })

        if (!path) return;
        if (!isIndexTemporary(fileUuid)) return;

        const fid = unref(fileUuid)

        try {
            const newIndex = await convertTemporaryToValidIndex(fid, path, fileContent)
            await $fileio.writeTextToFile(newIndex?.fullPath, unref(fileContent))

            return newIndex
        } catch (e: any) {
            $qt.error((e as Error).message)
        }
    }

    async function renameFile(uuidRef: PossiblyRef<string>, newNameRef: PossiblyRef<string>) {
        const uuid = unref(uuidRef);
        const newName = unref(newNameRef);
        if (!session?.rootPath || !uuid || !newName) return;

        const file = getFileByUuid(uuid);
        if (!file) {
            console.error(`[renameFile] File with UUID ${uuid} not found.`);
            return;
        }

        try {
            const newPath = await $fileio.renameFileOrFolder(file.fullPath, newName);
            await moveFileInIndex(file.fullPath, newPath, session.rootPath);
        } catch (error) {
            console.error(`[renameFile] Error renaming file:`, error);
        }
    }

    async function deleteFiles(uuidRefs: PossiblyRef<string[]>) {
        const uuids = unref(uuidRefs);
        if (!session?.rootPath || !uuids || uuids.length === 0) return;

        for (const uuid of uuids) {
            const file = getFileByUuid(uuid);
            if (!file) {
                console.warn(`[deleteFiles] File with UUID ${uuid} not found. Skipping.`);
                continue;
            }

            try {
                await $fileio.deleteFileOrFolder(file.fullPath);
                removeFileFromIndex(file.fullPath);
                $tabs.closeTab(uuid);
            } catch (error) {
                console.error(`[deleteFiles] Error deleting file ${file.fullPath}:`, error);
            }
        }
    }

    return {
        createTemporaryFile,
        renameFile,
        deleteFiles,
        saveTemporaryFile
    }
}