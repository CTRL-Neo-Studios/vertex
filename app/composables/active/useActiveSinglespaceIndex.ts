import type {ActiveSession} from "#shared/types/active/sessions";
import type {
    ActiveSinglespaceFileIndex,
    ActiveWorkspaceFileIndex,
    WorkspaceIndexListener,
    SinglespaceIndexEvent,
    SinglespaceIndexListener
} from "#shared/types/active/workspace";
import useUuid from "~/composables/utility/useUuid";
import {defaultActiveSinglespaceFileIndex} from "#shared/utils/defaults/actives";
import {readTextFile, stat, type UnwatchFn, watch, type WatchEvent} from "@tauri-apps/plugin-fs";
import {useFileIO} from "~/composables/io/useFileIO";
import type {InternalLinkNode} from "#codemirror-rich-obsidian-editor/editor-types";
import type {WebviewWindow} from "@tauri-apps/api/webviewWindow";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessions} from "~/composables/app/useAppSessions";
import type {ActiveTab} from "#shared/types/active/tabs";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import type {UnlistenFn} from "@tauri-apps/api/event";
import {getFileExtensionFromPath, isPlainTextFile, isUnreadableAsText} from "#shared/utils/fs/filenames";
import type {FrontmatterProperties} from "#shared/types/types";

const watcherRegistry = new Map<string, UnwatchFn>();
const listenerRegistry = new Map<string, Set<SinglespaceIndexListener>>();

/**
 * Private helper function to parse file content properties (frontmatter, etc.)
 * Only parses plain text files (.txt, .md) to avoid attempting to parse binary or other file types.
 * 
 * @param {string} path - The absolute file path
 * @param {string} content - The file content
 * @returns {object} Object containing frontmatterProperties and any other parsed properties
 * @private
 */
function _parseFileContentProperties(path: string, content: string): { frontmatterProperties: FrontmatterProperties } {
    const extension = getFileExtensionFromPath(path);
    
    // Only parse frontmatter for plain text files
    if (!isPlainTextFile(extension)) {
        return { frontmatterProperties: {} };
    }
    
    const fmResult = parseFrontmatter(content);
    if (fmResult.error) {
        console.error(`Frontmatter parsing error in ${path}:`, fmResult.error);
        return { frontmatterProperties: {} };
    }
    
    return { frontmatterProperties: fmResult.data || {} };
}

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
        const parsed = _parseFileContentProperties(firstFp, entryContent)
        fileIndex.value[firstFp] = defaultActiveSinglespaceFileIndex({
            uuid: useUuid(),
            fullPath: firstFp,
            fileName: await $fio.getFileNameFromPath(firstFp),
            properties: parsed.frontmatterProperties,
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
            properties: {}
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

        const parsed = _parseFileContentProperties(np, unref(fileContent))
        fileIndex.value[np] = defaultActiveSinglespaceFileIndex({
            uuid: fid,
            fileName: await $fio.getFileNameFromPath(np),
            fullPath: np,
            properties: parsed.frontmatterProperties
        })

        delete unref(fileIndex)[getIllegalPath(fid)] // delete the temporary index

        return unref(fileIndex)[np] // returns the updated index
    }

    async function updateIndex(path: string, content: string) {
        const index = unref(fileIndex);
        const node = index[path];

        if (!node) return;

        // Parse file content properties (frontmatter, etc.) - only for plain text files
        const parsed = _parseFileContentProperties(path, content);
        node.properties = parsed.frontmatterProperties;
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

    /**
     * Broadcasts an event to all registered listeners for this session.
     * @private
     */
    function _broadcast(event: SinglespaceIndexEvent) {
        const listeners = listenerRegistry.get(session!.uuid);
        if (listeners) {
            listeners.forEach(listener => listener(event));
        }
    }

    /**
     * Starts the file system watcher for a single file.
     * It will automatically update the fileIndex on modify, remove, or rename events.
     *
     * @param {string} filePath The absolute path of the file to watch.
     */
    async function startWatcher(filePath: string) {
        // Before starting a new one, check if a watcher for this session already exists
        if (watcherRegistry.has(session!.uuid)) {
            console.log(`Watcher for session ${session!.uuid} already exists. Stopping it first.`);
            await stopWatcher();
        }

        console.log(`Starting watcher for session ${session!.uuid} on: ${filePath}`);

        const activeWatcher = await watch(filePath, async (event: WatchEvent) => {
            // Ignore .DS_Store files
            if (event.paths.findIndex(i => i.endsWith('.DS_Store')) >= 0) return;

            // Ignore metadata-only changes
            if (typeof event.type === 'object' && event.type !== null && ('metadata' in event.type || ('modify' in event.type && event.type.modify.kind === 'metadata'))) return;

            if (typeof event.type === 'object' && event.type !== null) {
                
                // --- Remove Event Handling ---
                if ('remove' in event.type) {
                    for (const path of event.paths) {
                        console.log(`Remove detected: ${path}`);
                        const removedNodes = removeFileFromIndex(path);
                        if (removedNodes[0]) {
                            _broadcast({ type: 'remove', path, removedNode: removedNodes[0] });
                        }
                    }
                    return;
                }

                // --- Rename Event Handling ---
                if ('modify' in event.type && event.type.modify.kind === 'rename') {
                    // Standard rename with both paths
                    if (event.paths.length >= 2) {
                        const [oldPath, newPath] = event.paths;
                        console.log(`Rename detected: ${oldPath} -> ${newPath}`);
                        await moveFileInIndex(oldPath || '', newPath || '', '');
                        _broadcast({ type: 'rename', oldPath: oldPath || '', newPath: newPath || '' });
                        return;
                    }

                    // Incomplete rename with only one path
                    if (event.paths.length === 1) {
                        const path = event.paths[0];
                        if (!path) return;

                        setTimeout(async () => {
                            try {
                                await stat(path);
                                // File still exists - might be a case-only rename or noisy event
                                const node = fileIndex.value[path];
                                if (!node) return;

                                const fileName = path.substring(path.lastIndexOf('/') + 1);
                                const actualFileName = await $fio.getFileNameFromPath(path);

                                // If the file name changed (case-only rename), update it
                                if (actualFileName !== node.fileName) {
                                    console.log(`Case-only rename detected: ${node.fileName} -> ${actualFileName}`);
                                    const parentPath = path.substring(0, path.lastIndexOf('/'));
                                    const newPath = `${parentPath}/${actualFileName}`;
                                    await moveFileInIndex(path, newPath, '');
                                    _broadcast({ type: 'rename', oldPath: path, newPath: newPath });
                                } else {
                                    console.log('Ignoring noisy single-path rename event:', path);
                                }
                            } catch (error) {
                                // File no longer exists - treat as remove
                                console.log(`File at '${path}' no longer exists. Treating as remove.`);
                                const removedNodes = removeFileFromIndex(path);
                                if (removedNodes[0]) {
                                    _broadcast({ type: 'remove', path, removedNode: removedNodes[0] });
                                }
                            }
                        }, 100);
                        return;
                    }
                }

                // --- Modify Event Handling (Content Change) ---
                if ('modify' in event.type && event.type.modify.kind === 'data') {
                    for (const path of event.paths) {
                        // console.log(`Modify detected: ${path}`);
                        
                        // Don't attempt to read binary files (images, PDFs, videos) as text
                        const extension = getFileExtensionFromPath(path);
                        if (isUnreadableAsText(extension)) {
                            // console.log(`Skipping text read for binary file: ${path}`);
                            continue;
                        }

                        try {
                            const content = await readTextFile(path);
                            await updateIndex(path, content);
                            _broadcast({ type: 'modify', path });
                        } catch (error) {
                            console.error(`Failed to read file for update: ${path}`, error);
                        }
                    }
                    return;
                }

                console.log('[Executed Watcher Event]: ', event);
            } else {
                // Simple string event type
                console.log(`Received simple string event type: "${event.type}"`);
            }
        }, { recursive: false, delayMs: 5 });

        // Store the new unwatch function in the registry
        watcherRegistry.set(session!.uuid, activeWatcher);
        console.log(`Watcher started and registered for session ${session!.uuid}.`);

        return activeWatcher;
    }

    /**
     * Stops the currently active file system watcher.
     * This is crucial for cleanup when closing a file to prevent memory leaks.
     */
    async function stopWatcher() {
        const unwatchFn = watcherRegistry.get(session!.uuid);

        if (unwatchFn) {
            console.log(`Stopping file watcher for session ${session!.uuid}...`);
            unwatchFn();
            watcherRegistry.delete(session!.uuid);
            // Clean up listeners to prevent memory leaks
            listenerRegistry.delete(session!.uuid);
            console.log(`File watcher for session ${session!.uuid} stopped and de-registered.`);
        } else {
            console.log(`No active watcher found in the registry for session ${session!.uuid}.`);
        }
    }

    /**
     * Subscribes a listener to file system events for this session.
     * Returns an unsubscribe function to remove the listener.
     * 
     * @param {SinglespaceIndexListener} listener - The callback function to handle events
     * @returns {Function} Unsubscribe function to remove the listener
     */
    function on(listener: SinglespaceIndexListener): () => void {
        // Get or create the listener set for this session
        if (!listenerRegistry.has(session!.uuid)) {
            listenerRegistry.set(session!.uuid, new Set());
        }
        const listeners = listenerRegistry.get(session!.uuid)!;

        // Add the new listener
        listeners.add(listener);

        // Return an unsubscribe function
        // This is CRITICAL for preventing memory leaks in components
        return () => {
            listeners.delete(listener);
        };
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
        startWatcher,
        stopWatcher,
        on,
    }
}