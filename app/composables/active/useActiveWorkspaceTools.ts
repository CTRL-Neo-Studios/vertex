import {exists, stat} from "@tauri-apps/plugin-fs"
import {dirname, join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useFileIO} from "~/composables/io/useFileIO";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import type {PossiblyRef} from "#shared/types/types";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $fileio = useFileIO()
    const $tabs = useActiveTabs(session)
    const {
        fileIndex,
        getFileByUuid,
        addFileToIndex,
        moveFileInIndex,
        removeFileFromIndex
    } = useActiveWorkspaceIndex(session)

    /**
     * Creates a new file or folder in the workspace.
     *
     * @param atUuidRef The UUID of the file/folder in the file tree to create relative to.
     * @param fileNameRef The name of the new file or folder.
     * @param asFolderRef Whether to create a folder.
     * @param atLevelRef Where to create the new item relative to `atUuidRef`:
     *                   - "below": Inside the folder specified by `atUuidRef`. If `atUuidRef` is a file, creates at the same level.
     *                   - "same" | "above": In the same directory as the item specified by `atUuidRef`.
     */
    async function createFile(atUuidRef: PossiblyRef<string>, fileNameRef: PossiblyRef<string>, asFolderRef?: PossiblyRef<boolean>, atLevelRef: PossiblyRef<"above" | "same" | "below"> = "below") {
        if (!session?.rootPath) return;

        const atUuid = unref(atUuidRef);
        const fileName = unref(fileNameRef);
        const asFolder = !!unref(asFolderRef);
        const atLevel = unref(atLevelRef);

        if (!fileName) {
            console.error("[createFile] fileName is required.");
            return;
        }

        const anchorNode = getFileByUuid(atUuid);
        if (!anchorNode) {
            console.error(`[createFile] Anchor node with UUID ${atUuid} not found.`);
            return;
        }

        let parentDir: string;
        const anchorStats = await stat(anchorNode.fullPath);

        if (anchorStats.isDirectory && atLevel === 'below') {
            parentDir = anchorNode.fullPath;
        } else {
            parentDir = await dirname(anchorNode.fullPath);
        }

        const newPath = await join(parentDir, fileName);

        if (await exists(newPath)) {
            console.warn(`[createFile] Path already exists: ${newPath}. Aborting.`);
            return;
        }

        try {
            if (asFolder) {
                await $fileio.createFolder(newPath);
            } else {
                await $fileio.writeTextToFile(newPath, ' ');
            }

            return await addFileToIndex(newPath, session.rootPath)
            // if (!asFolder && newFileNode) {
            //     $tabs.openTab(newFileNode.uuid);
            // }
        } catch (error) {
            console.error(`[createFile] Error creating file/folder at ${newPath}:`, error);
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

    async function moveFiles(sourceUuidRefs: PossiblyRef<string[]>, destUuidRef: PossiblyRef<string>) {
        const sourceUuids = unref(sourceUuidRefs);
        const destUuid = unref(destUuidRef);
        if (!session?.rootPath || !sourceUuids || sourceUuids.length === 0 || !destUuid) return;

        const destFolder = getFileByUuid(destUuid);
        if (!destFolder || !destFolder.isFolder) {
            console.error(`[moveFiles] Destination with UUID ${destUuid} is not a valid folder.`);
            return;
        }

        for (const uuid of sourceUuids) {
            const sourceFile = getFileByUuid(uuid);
            if (!sourceFile) {
                console.warn(`[moveFiles] Source file with UUID ${uuid} not found. Skipping.`);
                continue;
            }

            if (sourceFile.fullPath === destFolder.fullPath) continue;

            try {
                const newPath = await $fileio.moveFileOrFolder(sourceFile.fullPath, destFolder.fullPath);
                await moveFileInIndex(sourceFile.fullPath, newPath, session.rootPath);
            } catch (error) {
                console.error(`[moveFiles] Error moving file ${sourceFile.fullPath} to ${destFolder.fullPath}:`, error);
            }
        }
    }

    async function duplicateFile(uuidRef: PossiblyRef<string>) {
        const uuid = unref(uuidRef);
        if (!session?.rootPath || !uuid) return;

        const sourceNode = getFileByUuid(uuid);
        if (!sourceNode) {
            console.error(`[duplicateFile] File with UUID ${uuid} not found.`);
            return;
        }

        try {
            const parentDir = await dirname(sourceNode.fullPath);
            const sourceName = sourceNode.fileName;
            let newPath: string;
            let counter = 1;
            const dotIndex = sourceName.lastIndexOf('.');
            const baseName = dotIndex > 0 ? sourceName.substring(0, dotIndex) : sourceName;
            const extension = dotIndex > 0 ? sourceName.substring(dotIndex) : '';

            while (true) {
                const suffix = counter === 1 ? ' copy' : ` copy ${counter}`;
                const newName = `${baseName}${suffix}${extension}`;
                newPath = await join(parentDir, newName);
                if (!(await exists(newPath))) break;
                counter++;
            }

            const recursiveCopyAndIndex = async (source: string, dest: string) => {
                if (!session?.rootPath) return
                const stats = await stat(source);
                if (stats.isDirectory) {
                    await $fileio.createFolder(dest);
                    await addFileToIndex(dest, session.rootPath);
                    const entries = await $fileio.listDirectory(source);
                    for (const entry of entries) {
                        if (entry.name?.startsWith('.')) continue;
                        const newSource = await join(source, entry.name!);
                        const newDest = await join(dest, entry.name!);
                        await recursiveCopyAndIndex(newSource, newDest);
                    }
                } else {
                    await $fileio.copyFileTo(source, dest);
                    await addFileToIndex(dest, session.rootPath);
                }
            };

            await recursiveCopyAndIndex(sourceNode.fullPath, newPath);

        } catch (error) {
            console.error(`[duplicateFile] Error duplicating file ${sourceNode.fullPath}:`, error);
        }
    }

    return {
        createFile,
        renameFile,
        deleteFiles,
        moveFiles,
        duplicateFile
    }
}