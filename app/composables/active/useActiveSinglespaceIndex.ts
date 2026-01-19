import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveSinglespaceFileIndex, ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import useUuid from "~/composables/utility/useUuid";
import {defaultActiveSinglespaceFileIndex} from "#shared/utils/defaults/actives";
import {readTextFile} from "@tauri-apps/plugin-fs";
import {useFileIO} from "~/composables/io/useFileIO";
import type {InternalLinkNode} from "#codemirror-rich-obsidian-editor/editor-types";
import type {WebviewWindow} from "@tauri-apps/api/webviewWindow";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessions} from "~/composables/app/useAppSessions";
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import type {UnlistenFn} from "@tauri-apps/api/event";

export function useActiveSinglespaceIndex(session?: ActiveSession) {
    if (!session) {
        console.error("useActiveSinglespaceIndex was called without a session!");
    }

    const $fio = useFileIO()
    const $win = useAppWebviewWindows()
    const $asesh = useAppSessions()

    const fileIndex = useState<Record<string, ActiveSinglespaceFileIndex>>(`active.singlespace.indexMap.${session?.uuid ?? useUuid()}`, () => ({}));

    async function initializeIndex(firstFilePath: PossiblyRef<string>) {
        const firstFp = unref(firstFilePath)

        const entryContent = await $fio.readTextFromFile(firstFp)
        fileIndex.value[firstFp] = defaultActiveSinglespaceFileIndex({
            uuid: useUuid(),
            fullPath: firstFp,
            fileName: await $fio.getFileNameFromPath(firstFp),
            frontmatterProperties: parseFrontmatter(entryContent).data || {},
        })

        return fileIndex.value[firstFp]
    }

    function setTemporaryIndex() {
        const uuid = useUuid()
        const illegalPath = getIllegalPath(uuid)
        fileIndex.value[illegalPath] = defaultActiveSinglespaceFileIndex({
            uuid: uuid,
            fullPath: illegalPath,
            fileName: 'Untitled.md',
            frontmatterProperties: {}
        })

        return fileIndex.value[illegalPath]
    }

    function isIndexTemporary(fileUuid: PossiblyRef<string>) {
        const uuid = unref(fileUuid)
        const illegalPath = getIllegalPath(uuid)
        return unref(fileIndex)[illegalPath] != null && unref(fileIndex)[illegalPath]?.fullPath == illegalPath
    }

    function getIllegalPath(uuid: PossiblyRef<string>) {
        return `/!temporary!/-${unref(uuid)}`
    }

    function fileIndexWithUuidExists(fileUuid: PossiblyRef<string>) {
        return getFileByUuid(fileUuid) != null
    }


    function fileIndexWithPathExists(absolutePath: PossiblyRef<string>) {
        return getFileByPath(absolutePath) != null
    }

    async function convertTemporaryToValidIndex(fileUuid: PossiblyRef<string>, newPath: PossiblyRef<string>, fileContent: PossiblyRef<string>): Promise<ActiveSinglespaceFileIndex | undefined> {
        if (!isIndexTemporary(fileUuid)) throw new Error('The file is not temporary.'); // return if the targeted file is not marked as temporary

        const np = unref(newPath)
        const fid = unref(fileUuid)

        if (fileIndexWithPathExists(np)) throw new Error('A file with the same path exists. Please switch to another save path or file name.'); // return if the target path already exists in the index

        const oldIndex = getFileByUuid(fid)

        if (!oldIndex) throw new Error('No such file exists.')

        fileIndex.value[np] = defaultActiveSinglespaceFileIndex({
            uuid: fid,
            fileName: await $fio.getFileNameFromPath(np),
            fullPath: np,
            frontmatterProperties: parseFrontmatter(unref(fileContent)).data || {}
        })

        delete unref(fileIndex)[getIllegalPath(fid)] // delete the temporary index

        return unref(fileIndex)[np] // returns the updated index
    }

    async function updateIndex(path: string, content: string) {
        const index = unref(fileIndex);
        const node = index[path];

        if (!node) return;

        const fmResult = parseFrontmatter(content);
        if (fmResult.error) {
            console.error(`Frontmatter parsing error in ${path}:`, fmResult.error);
        } else {
            node.frontmatterProperties = fmResult.data || {};
        }
    }

    /**
     * Removes a file or folder (and all its children recursively) from the index.
     */
    function removeFileFromIndex(path: string): ActiveSinglespaceFileIndex[] {
        const nodeToRemove = unref(fileIndex)[path];
        if (!nodeToRemove) return [];
        const removedNodes: ActiveSinglespaceFileIndex[] = []

        removedNodes.push(defaultActiveSinglespaceFileIndex(nodeToRemove))
        delete unref(fileIndex)[path];
        console.log(`Removed from index: ${path}`);

        return removedNodes
    }

    /**
     * Handles a file or folder being renamed/moved.
     * This version preserves UUIDs to maintain UI state (e.g., open tabs)
     * and recursively updates all child paths in-memory for moved folders.
     */
    async function moveFileInIndex(oldPath: string, newPath: string, workspaceRoot: string) {
        const fileIndexState = fileIndex.value; // Work with a local reference for clarity
        const nodeToMove = fileIndexState[oldPath];

        if (!nodeToMove) {
            console.warn(`Attempted to move a node that is not in the index: ${oldPath}`);
            return;
        }

        const newNodeData: ActiveSinglespaceFileIndex = {
            ...nodeToMove,
            uuid: nodeToMove.uuid,
            fullPath: newPath,
            fileName: newPath.substring(newPath.lastIndexOf('/') + 1)
        }

        delete fileIndexState[oldPath]
        fileIndexState[newPath] = newNodeData
    }

    /**
     * Finds a file in the index by its stable UUID.
     * Returns the full file object or null if not found.
     *
     * Optimize: Can be optimized via adding a separate uuidToFilePathIndexMap later but it's hard to manage right now, i.e. premature optimization.
     */
    function getFileByUuid(uuidRef: PossiblyRef<string | undefined>): ActiveSinglespaceFileIndex | null {
        const uuid = unref(uuidRef)
        if (!uuid) return null;

        for (const path in unref(fileIndex)) {
            if (unref(fileIndex)[path]?.uuid === uuid) {
                return unref(fileIndex)[path] || null;
            }
        }

        return null;
    }

    function getFileByPath(absolutePathRef: PossiblyRef<string>) {
        return unref(fileIndex)[unref(absolutePathRef)]
    }

    /**
     * Clears the File index map.
     */
    function clearIndex() {
        fileIndex.value = {}
    }

    return {
        initializeIndex,
        updateIndex,
        removeFileFromIndex,
        getFileByUuid,
        moveFileInIndex,
        isIndexTemporary,
        setTemporaryIndex,
        clearIndex,
        convertTemporaryToValidIndex,
        fileIndexWithPathExists,
        fileIndexWithUuidExists,
    }
}