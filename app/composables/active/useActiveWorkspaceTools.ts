import {exists, stat} from "@tauri-apps/plugin-fs"
import {dirname, join} from "@tauri-apps/api/path"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useFileIO} from "~/composables/io/useFileIO";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import type {PossiblyRef} from "#shared/types/types";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import {renameTargets, rewriteLinks} from "#shared/utils/index/rewriteLinks";
import UpdateLinksModal from "~/components/Modals/UpdateLinksModal.vue";
import useQuickToasts from "~/composables/utility/useQuickToasts";

export function useActiveWorkspaceTools(session?: ActiveSession) {
    const $fileio = useFileIO()
    const $tabs = useActiveTabs(session)
    const $ovl = useOverlay()
    const $qt = useQuickToasts()
    const {t} = useI18n()
    const updateLinksModal = $ovl.create(UpdateLinksModal)
    const {
        getFileByUuid,
        addFileToIndex,
        moveFileInIndex,
        removeFileFromIndex,
        getPropertiesFile,
        getRenameImpact,
        markSelfWrite,
        updateIndex,
    } = useActiveWorkspaceIndex(session)

    /**
     * Moves/renames a file on disk and in the index. If other notes link to it, asks whether to rewrite
     * those links; if declined they stay as-is and become unresolved (never silently dropped).
     */
    async function relocate(file: ActiveWorkspaceFileIndex, move: () => Promise<string>) {
        const impact = file.isFolder ? [] : getRenameImpact(file.uuid)
        const oldRel = file.relativePath
        const oldPath = file.fullPath
        markSelfWrite(oldPath)
        const newPath = await move()
        markSelfWrite(newPath)
        await moveFileInIndex(oldPath, newPath, session!.rootPath!)
        if (impact.length === 0) return newPath

        const newRel = getFileByUuid(file.uuid)!.relativePath
        const linkCount = impact.reduce((n, i) => n + i.targets.length, 0)
        const accepted = await updateLinksModal.open({
            fileName: file.fileName,
            referencingFiles: impact.map(i => i.file.relativePath),
            linkCount,
        }).result
        if (!accepted) return newPath

        let rewritten = 0
        for (const {file: ref, targets} of impact) {
            try {
                const content = await $fileio.readTextFromFile(ref.fullPath)
                const result = rewriteLinks(content, renameTargets(targets, oldRel, newRel))
                if (result.count === 0) continue
                markSelfWrite(ref.fullPath)
                await $fileio.writeTextToFile(ref.fullPath, result.text)
                await updateIndex(ref.fullPath, result.text)
                rewritten += result.count
            } catch (error) {
                console.error(`[relocate] could not update links in ${ref.fullPath}`, error)
                $qt.error(t('app.editor.ui.updateLinks.failed', {file: ref.relativePath}))
            }
        }
        $qt.success(t('app.editor.ui.updateLinks.done', {links: rewritten}))
        return newPath
    }

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
    async function createFile(atUuidRef: PossiblyRef<string | undefined>, fileNameRef: PossiblyRef<string>, asFolderRef?: PossiblyRef<boolean>, atLevelRef: PossiblyRef<"above" | "same" | "below"> = "below") {
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
            const newPath = await join(session.rootPath, fileName);
            try {
                if (asFolder) {
                    await $fileio.createFolder(newPath);
                } else {
                    await $fileio.writeTextToFile(newPath, ' ');
                }

                return await addFileToIndex(newPath, session.rootPath)
            } catch (error) {
                console.error(`[createFile] Error creating file/folder at ${newPath}:`, error);
            }
        } else {
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
    }

    async function createPropertiesFile(atUuidRef: PossiblyRef<string | undefined>): Promise<ActiveWorkspaceFileIndex | null | undefined> {
        if (!session?.rootPath) return;

        const atUuid = unref(atUuidRef);
        const anchorNode = getFileByUuid(atUuid);

        if (!anchorNode || !anchorNode.isFolder) return;

        const prop = getPropertiesFile(anchorNode.uuid)
        if (!prop) {
            try {
                return await createFile(atUuidRef, 'properties.yml', false, "below")
            } catch (e) {
                console.error(e)
            }
        } else {
            return getFileByUuid(prop)
        }
    }

    /** Renames a file/folder (keeping its extension if `newName` has none). Throws on failure so callers can revert UI. */
    async function renameFile(uuidRef: PossiblyRef<string>, newNameRef: PossiblyRef<string>) {
        const file = getFileByUuid(uuidRef)
        const newName = unref(newNameRef)
        if (!session?.rootPath || !file || !newName) return
        return relocate(file, () => $fileio.renameFileOrFolder(file.fullPath, newName))
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
                await relocate(sourceFile, () => $fileio.moveFileOrFolder(sourceFile.fullPath, destFolder.fullPath));
            } catch (error) {
                console.error(`[moveFiles] Error moving file ${sourceFile.fullPath} to ${destFolder.fullPath}:`, error);
                $qt.error(t('app.editor.ui.moveFailed', {file: sourceFile.fileName}))
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
        duplicateFile,
        createPropertiesFile
    }
}