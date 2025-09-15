import {stat, exists} from "@tauri-apps/plugin-fs"
import {join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useFileIO} from "~/composables/io/useFileIO";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $fileio = useFileIO()
    const {
        fileIndex,
        getFileByUuid,
        addFileToIndex
    } = useActiveWorkspaceIndex(session)

    async function createFile(atAbsolutePathRef: PossiblyRef<string>, fileNameRef?: PossiblyRef<string>, asFolderRef?: PossiblyRef<boolean>, atLevelRef: PossiblyRef<"above" | "same" | "below"> = "below") {
        if (!session?.rootPath) return;

        const atAbsolutePath = unref(atAbsolutePathRef)
        const fileName = unref(fileNameRef)
        const asFolder = unref(asFolderRef)
        const atLevel = unref(atLevelRef)

        if (await exists(atAbsolutePath)) {
            const stats = await stat(atAbsolutePath)
            if (stats.isDirectory && asFolder) return;
            else if (stats.isFile && !asFolder) return;
            else if (fileName === $fileio.processFileNameFromPath(atAbsolutePath)) return; // Forbid overwrites
        }

        if (!fileName && !asFolder) {
            if ($fileio.processFileNameFromPath(atAbsolutePath).includes('.')) await $fileio.writeTextToFile(atAbsolutePath, '');
            else await $fileio.createFolder(atAbsolutePath)
            await addFileToIndex(atAbsolutePath, session.rootPath);
            return;
        } else if (fileName && !asFolder) {
            await $fileio.writeTextToFile(atAbsolutePath, '');
            await addFileToIndex(atAbsolutePath, session.rootPath);
            return;
        } else if (fileName && asFolder) {
            await $fileio.createFolder(atAbsolutePath)
            await addFileToIndex(atAbsolutePath, session.rootPath);
            return;
        }
    }

    async function renameFile(){

    }

    async function deleteFile() {

    }
}