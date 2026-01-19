import type {
    ActiveWorkspaceFileIndex,
    UITreeNode,
    WorkspaceIndexEvent,
    WorkspaceIndexListener
} from "#shared/types/active/workspace";
import {
    type DirEntry,
    readDir,
    readTextFile,
    stat,
    type UnwatchFn,
    watch,
    type WatchEvent
} from "@tauri-apps/plugin-fs";
import {join} from "@tauri-apps/api/path"
import {defaultActiveWorkspaceFileIndex, defaultUITreeNode} from "#shared/utils/defaults/actives";
import useUuid from "~/composables/utility/useUuid";
import type {PossiblyRef} from "#shared/types/types";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {InternalLinkNode} from "#codemirror-rich-obsidian-editor/editor-types";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessions} from "~/composables/app/useAppSessions";
import type {UnlistenFn} from "@tauri-apps/api/event";

const watcherRegistry = new Map<string, UnwatchFn>();
// NEW: A registry for our event listeners, mapping session ID to a Set of callbacks.
const listenerRegistry = new Map<string, Set<WorkspaceIndexListener>>();


export function useActiveWorkspaceIndex(session?: ActiveSession) {
    if (!session) {
        console.error("useActiveWorkspaceIndex was called without a session!");
    }

    const $win = useAppWebviewWindows()
    const $asesh = useAppSessions()

    const fileIndex = useState<Record<string, ActiveWorkspaceFileIndex>>(`active.workspace.indexMap.${session?.uuid ?? useUuid()}`, () => ({}));
    // Turns the fileIndex into a recursive File tree to serve the UI
    const fileTree = computed<UITreeNode[]>(() => {
        const index = fileIndex.value; // No need for unref
        if (Object.keys(index).length === 0) return [];

        const getNode = (path: string): UITreeNode => {
            const file = index[path];
            return defaultUITreeNode({
                ...file,
                // The children array now correctly contains paths, so this works
                children: file?.children.map(getNode) || []
            });
        };

        const rootNodes: UITreeNode[] = [];
        for (const path in index) {
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            // This lookup now works because the keys of the index are paths
            if (!index[parentPath]) {
                rootNodes.push(getNode(path));
            }
        }
        return rootNodes;
    });

    /**
     * Builds index from a root path using Tauri's native recursive fs scan.
     */
    async function buildIndex(workspaceRootFilePath: PossiblyRef<string>) {
        const newIndex: Record<string, ActiveWorkspaceFileIndex> = {};
        const workspaceRoot = unref(workspaceRootFilePath)
        const time = new Date().getTime()

        async function processDirectory(currentPath: string) {
            const entries = await readDir(currentPath);
            const childrenPaths: string[] = [];

            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;

                const entryPath = await join(currentPath, entry.name);
                childrenPaths.push(entryPath);

                newIndex[entryPath] = defaultActiveWorkspaceFileIndex({
                    uuid: useUuid(),
                    fullPath: entryPath,
                    relativePath: entryPath.replace(workspaceRoot, '').substring(1),
                    fileName: entry.name,
                    isFolder: entry.isDirectory,
                    children: [],
                    frontmatterProperties: {},
                    forelinks: []
                });

                if (entry.isDirectory) {
                    newIndex[entryPath].children = (await processDirectory(entryPath)).sort();
                }
            }
            return childrenPaths;
        }

        await processDirectory(workspaceRoot);

        for (const path in newIndex) {
            if (path.endsWith(".md") || path.endsWith(".mdx")) {
                await preparseDocument(path, newIndex);
            }
        }

        fileIndex.value = newIndex;
        console.log(`Indexing took: ${(new Date()).getTime() - time}ms`)
    }

    /**
     * Clears the File index map.
     */
    function clearIndex() {
        fileIndex.value = {}
    }

    /**
     * Fetches metadata for a single path and adds it to the index.
     * Handles linking to its parent.
     */
    async function addFileToIndex(path: string, workspaceRoot: string, autoSort: boolean = true) {
        if (unref(fileIndex)[path]) {
            console.warn(`[addFileToIndex] Skipped: ${path} already exists in the index.`);
            return unref(fileIndex)[path];
        }
        console.log(`[addFileToIndex] ${path}`)
        try {
            const fileStats = await stat(path);
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            const isDirectory = fileStats.isDirectory;
            const uuid = useUuid()

            // 1. Create the new index entry
            const newEntry: ActiveWorkspaceFileIndex = defaultActiveWorkspaceFileIndex({
                uuid: uuid,
                fullPath: path,
                relativePath: path.replace(workspaceRoot, '').substring(1),
                fileName: path.substring(path.lastIndexOf('/') + 1),
                isFolder: isDirectory,
                children: [], // New files/folders have no children initially
                frontmatterProperties: {}, // Later, you could parse this here
                forelinks: []
            });
            unref(fileIndex)[path] = newEntry;

            // 2. Link this new entry to its parent
            const parentNode = fileIndex.value[parentPath];
            if (parentNode && !parentNode.children.includes(path)) {
                parentNode.children.push(path);
                if (autoSort) parentNode.children.sort();
            }

            // MODIFIED: Also parse frontmatter when a new file is added
            if (!isDirectory && path.endsWith('.md')) {
                await preparseDocument(path);
            }

            console.log(`Added to index: ${path}`);
            return newEntry;

        } catch (error) {
            console.error(`Failed to add file to index: ${path}`, error);
            return null;
        }
    }

    /**
     * Removes a file or folder (and all its children recursively) from the index.
     */
    function removeFileFromIndex(path: string): ActiveWorkspaceFileIndex[] {
        const nodeToRemove = unref(fileIndex)[path];
        if (!nodeToRemove) return [];
        const removedNodes: ActiveWorkspaceFileIndex[] = []

        // 1. Recursively remove all children first
        if (nodeToRemove.isFolder) {
            // Create a copy of children array to avoid modification during iteration
            [...nodeToRemove.children].forEach(childId => {
                removedNodes.push(...removeFileFromIndex(childId));
            });
        }

        // 2. Unlink from parent
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        const parentNode = unref(fileIndex)[parentPath];
        if (parentNode) {
            const childIndex = parentNode.children.indexOf(path);
            if (childIndex > -1) {
                parentNode.children.splice(childIndex, 1);
            }
        }

        // 3. Remove the node itself
        removedNodes.push(defaultActiveWorkspaceFileIndex(unref(fileIndex)[path]))
        delete unref(fileIndex)[path];
        console.log(`Removed from index: ${path}`);

        return removedNodes
    }

    // Place this inside your useActiveWorkspaceIndex composable

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

        // --- Step 1: Recursively update the node and all its children ---

        // A helper function to update a node and its descendants in-memory
        const recursivelyUpdatePaths = async (currentOldPath: string, currentNewPath: string) => {
            const node = fileIndexState[currentOldPath];
            if (!node) return;

            // Create the new node data, preserving the UUID
            const newNodeData: ActiveWorkspaceFileIndex = {
                ...node,
                uuid: node.uuid, // Preserve the stable ID
                fullPath: currentNewPath,
                relativePath: currentNewPath.replace(workspaceRoot, '').substring(1),
                fileName: currentNewPath.substring(currentNewPath.lastIndexOf('/') + 1),
                // The `children` paths need to be updated, which we'll do next
            };

            // If it's a folder, iterate its children and recursively call this function
            if (node.isFolder) {
                const updatedChildrenPaths: string[] = [];
                for (const childOldPath of node.children) {
                    // Construct the child's new path based on the parent's move
                    const childName = childOldPath.substring(childOldPath.lastIndexOf('/') + 1);
                    const childNewPath = await join(currentNewPath, childName); // Use join for safety
                    await recursivelyUpdatePaths(childOldPath, childNewPath);
                    updatedChildrenPaths.push(childNewPath);
                }
                newNodeData.children = updatedChildrenPaths;
            }

            // Add the updated node under its new path and delete the old one
            delete fileIndexState[currentOldPath];
            fileIndexState[currentNewPath] = newNodeData;
        };

        // Initial call to start the recursive update
        await recursivelyUpdatePaths(oldPath, newPath);

        // --- Step 2: Update the parent's `children` array ---

        const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newParentPath = newPath.substring(0, newPath.lastIndexOf('/'));

        // Remove from old parent's children list
        const oldParentNode = fileIndexState[oldParentPath];
        if (oldParentNode) {
            const childIndex = oldParentNode.children.indexOf(oldPath);
            if (childIndex > -1) {
                oldParentNode.children.splice(childIndex, 1);
            }
        }

        // Add to new parent's children list (even if it's the same parent)
        const newParentNode = fileIndexState[newParentPath];
        if (newParentNode) {
            if (!newParentNode.children.includes(newPath)) {
                newParentNode.children.push(newPath);
                newParentNode.children.sort(); // Keep it sorted
            }
        }

        // The change is now complete. Forcing a refresh on the ref is good practice
        // if you were mutating deeply without Vue's reactivity system catching it,
        // but since we are adding/deleting keys, it should be fine.
        // fileIndex.value = { ...fileIndexState }; // Use if reactivity fails
    }

    async function updateIndex(path: string, content: string) {
        const index = unref(fileIndex);
        const node = index[path];
        if (!node || node.isFolder) return;

        const fmResult = parseFrontmatter(content);
        if (fmResult.error) {
            console.error(`Frontmatter parsing error in ${path}:`, fmResult.error);
        } else {
            node.frontmatterProperties = fmResult.data || {};
        }

        const internalLinks: InternalLinkNode[] = getInternalLinks(content);
        const forelinks = new Set<string>();
        const linkTargetToUuidMap = new Map<string, string>();

        for (const p in index) {
            const file = index[p];
            if (file && !file.isFolder) {
                const baseName = file.fileName.substring(0, file.fileName.lastIndexOf('.')) || file.fileName;
                if (!linkTargetToUuidMap.has(baseName)) {
                    linkTargetToUuidMap.set(baseName, file.uuid);
                }
                const relativePathWithoutExt = file.relativePath.substring(0, file.relativePath.lastIndexOf('.')) || file.relativePath;
                if (!linkTargetToUuidMap.has(relativePathWithoutExt)) {
                    linkTargetToUuidMap.set(relativePathWithoutExt, file.uuid);
                }

                if (!linkTargetToUuidMap.has(file.relativePath)) {
                    linkTargetToUuidMap.set(file.relativePath, file.uuid);
                }
            }
        }

        for (const linkNode of internalLinks) {
            const linkTarget = linkNode.path;
            if (linkTargetToUuidMap.has(linkTarget)) {
                forelinks.add(linkTargetToUuidMap.get(linkTarget)!);
            }
        }
        node.forelinks = Array.from(forelinks);
    }

    async function preparseDocument(path: string, index = fileIndex.value) {
        const node = index[path];
        if (!node || node.isFolder) return;

        try {
            const content = await readTextFile(path);
            await updateIndex(path, content);
        } catch (readError) {
            console.error(`Failed to read file for preparsing: ${path}`, readError);
        }
    }

    function _broadcast(event: WorkspaceIndexEvent) {
        const listeners = listenerRegistry.get(session!.uuid);
        if (listeners) {
            // Call each subscribed listener with the event.
            listeners.forEach(listener => listener(event));
        }
    }

    /**
     * Starts the file system watcher for the specified workspace root.
     * It will automatically update the fileIndex on create, remove, or rename events.
     *
     * @param {string} workspaceRoot The absolute path of the workspace folder to watch.
     */
    async function startWatcher(workspaceRoot: string) {
        // Before starting a new one, check if a watcher for this session already exists in the registry.
        if (watcherRegistry.has(session!.uuid)) {
            console.log(`Watcher for session ${session!.uuid} already exists. Stopping it first.`);
            await stopWatcher(); // This will correctly use the registry
        }

        console.log(`Starting watcher for session ${session!.uuid} on: ${workspaceRoot}`);

        let activeWatcher = await watch(workspaceRoot, (event: WatchEvent) => {
            const currentTabId = useRoute().params.tabId as string;
            if (event.paths.findIndex(i => i.endsWith('.DS_Store')) >= 0) return;

            // console.log('[Detected Watcher Event]: ', event);

            if (typeof event.type === 'object' && event.type !== null && ('metadata' in event.type || ('modify' in event.type && (event.type.modify.kind === 'metadata' || event.type.modify.kind === 'data')))) return;

            if (typeof event.type === 'object' && event.type !== null) {

                // Inside this block, TypeScript now knows event.type is an object.
                // It is now safe to use the `in` operator.

                // --- Remove Event Handling ---
                if ('remove' in event.type) {
                    for (const path of event.paths) {
                        console.log(`Remove detected: ${path}`);
                        const removedNodes = removeFileFromIndex(path);
                        _broadcast({ type: 'remove', path, removedNodes }); // Broadcast event
                    }
                    return;
                }

                // --- Rename Event Handling ---
                if ('modify' in event.type && event.type.modify.kind === 'rename') {
                    // Standard rename with both paths. This is the ideal case.
                    if (event.paths.length >= 2) {
                        const [oldPath, newPath] = event.paths;
                        console.log(`Rename detected: ${oldPath} -> ${newPath}`);
                        moveFileInIndex(oldPath || '', newPath || '', workspaceRoot).then(() => {
                            _broadcast({ type: 'rename', oldPath: oldPath || '', newPath: newPath || '' });
                        });
                        return;
                    }

                    // Incomplete rename with only one path. This is ambiguous.
                    // It could be a "move to trash" or just a noisy event from a regular rename.
                    if (event.paths.length === 1) {
                        const path = event.paths[0];
                        if (!path) return;

                        // To figure out what it is, we check if the file still exists.
                        // A short delay helps ensure the file system has settled.
                        setTimeout(async () => {
                            try {
                                await stat(path);
                                // File still exists (case-insensitively). This could be a case-only
                                // rename or a noisy event. We need to check the actual file name on disk.
                                const node = fileIndex.value[path];
                                if (!node) return; // Should not happen, but a good safeguard.

                                const parentPath = path.substring(0, path.lastIndexOf('/'));
                                const entries = await readDir(parentPath);
                                const eventFileName = path.substring(path.lastIndexOf('/') + 1);
                                const actualEntry = entries.find(e => e.name.toLowerCase() === eventFileName.toLowerCase());

                                // If we found the file and its casing is different, it's a case-only rename.
                                if (actualEntry && actualEntry.name !== node.fileName) {
                                    console.log(`Case-only rename detected: ${node.fileName} -> ${actualEntry.name}`);
                                    const newPath = await join(parentPath, actualEntry.name);
                                    await moveFileInIndex(path, newPath, workspaceRoot);
                                    _broadcast({ type: 'rename', oldPath: path, newPath: newPath });
                                } else {
                                    // The file exists and the name is the same. It was a noisy event.
                                    console.log('Ignoring noisy single-path rename event:', path);
                                }
                            } catch (error) {
                                // `stat` threw an error, which means the file is no longer at this path.
                                // This is our signal for a "move to trash" or delete operation.
                                console.log(`File at '${path}' no longer exists. Treating as remove.`);
                                const removedNodes = removeFileFromIndex(path);
                                _broadcast({ type: 'remove', path, removedNodes });
                            }
                        }, 100); // A small delay to avoid race conditions with the file system.
                        return;
                    }
                }


                // --- Create Event Handling ---
                if ('create' in event.type) {
                    for (const path of event.paths) {
                        console.log(`Create detected: ${path}`);
                        addFileToIndex(path, workspaceRoot).then(() => {
                            _broadcast({ type: 'create', path }); // Broadcast event
                        });
                    }
                    return;
                }


                console.log('[Executed Watcher Event]: ', event);

                // --- Modify Event Handling (Content Change) ---
                // if ('modify' in event.type && event.type.modify.kind === 'data') {
                //     for (const path of event.paths) {
                //         // updateFrontmatterForPath(path).then(() => { // Assuming this is your parsing function
                //         //     _broadcast({ type: 'modify', path }); // Broadcast event
                //         // });
                //     }
                //     return;
                // }

            } else {
                // This block handles the case where event.type is a string ("any" or "other").
                // Usually, these are less critical and can often be ignored or just logged.
                console.log(`Received simple string event type: "${event.type}"`);
            }

        }, { recursive: true, delayMs: 5 });

        // Store the new unwatch function in our central registry.
        watcherRegistry.set(session!.uuid, activeWatcher);
        console.log(`Watcher started and registered for session ${session!.uuid}.`);

        return activeWatcher
    }

    /**
     * Stops the currently active file system watcher.
     * This is crucial for cleanup when closing a workspace to prevent memory leaks.
     */
    async function stopWatcher() {
        const unwatchFn = watcherRegistry.get(session!.uuid);

        if (unwatchFn) {
            console.log(`Stopping file watcher for session ${session!.uuid}...`);
            unwatchFn(); // Execute the unwatch function.
            watcherRegistry.delete(session!.uuid); // Clean up the registry.
            // Also clean up listeners for this session to prevent memory leaks!
            listenerRegistry.delete(session!.uuid);
            console.log(`File watcher for session ${session!.uuid} stopped and de-registered.`);
        } else {
            console.log(`No active watcher found in the registry for session ${session!.uuid}.`);
        }

    }

    /**
     * Reads a file at a given path, parses its frontmatter, and updates the index.
     * Does nothing if the path points to a folder or is not in the index.
     */
    async function updateFrontmatterForPath(path: string, index = fileIndex.value) {
        const node = index[path];
        if (!node || node.isFolder) return;
        try {
            const content = await readTextFile(path);
            const result = parseFrontmatter(content);
            if (result.error) {
                console.error(`Frontmatter parsing error in ${path}:`, result.error);
            } else {
                node.frontmatterProperties = result.data || {};
                // console.log(`Updated frontmatter for ${path}`);
            }
        } catch (readError) {
            console.error(`Failed to read file for frontmatter parsing: ${path}`, readError);
        }
    }

    /**
     * Finds a file in the index by its stable UUID.
     * Returns the full file object or null if not found.
     *
     * Optimize: Can be optimized via adding a separate uuidToFilePathIndexMap later but it's hard to manage right now, i.e. premature optimization.
     */
    function getFileByUuid(uuidRef: PossiblyRef<string | undefined>): ActiveWorkspaceFileIndex | null {
        const uuid = unref(uuidRef)
        if (!uuid) return null;

        for (const path in unref(fileIndex)) {
            if (unref(fileIndex)[path]?.uuid === uuid) {
                return unref(fileIndex)[path] || null;
            }
        }

        return null;
    }

    /**
     * Finds a file in the index by its path.
     * Returns the full file object or null if not found.
     */
    function getFileByPath(absoluteFilePath: PossiblyRef<string>): ActiveWorkspaceFileIndex | undefined {
        return unref(fileIndex)[unref(absoluteFilePath)]
    }

    function getFilesByPaths(absoluteFilePaths: PossiblyRef<string[]>): ActiveWorkspaceFileIndex[] {
        let results: ActiveWorkspaceFileIndex[] = []
        for (const fp of unref(absoluteFilePaths)) {
            const f = getFileByPath(fp)
            if (f)
                results.push(f)

        }
        return results
    }

    function on(listener: WorkspaceIndexListener): () => void {
        // Get or create the listener set for this session.
        if (!listenerRegistry.has(session!.uuid)) {
            listenerRegistry.set(session!.uuid, new Set());
        }
        const listeners = listenerRegistry.get(session!.uuid)!;

        // Add the new listener.
        listeners.add(listener);

        // Return an `unsubscribe` function.
        // This is CRITICAL for preventing memory leaks in components.
        return () => {
            listeners.delete(listener);
        };
    }

    async function addWindowCloseCallbacks(): Promise<{ unlistenClose: UnlistenFn, unlistenDestroyed: UnlistenFn} | undefined> {
        const currentWindow = $win.getCurrentAppWindow()
        const currentAppSession = unref($asesh.currentAppSession)

        if (!currentAppSession) return;

        const unlistenClose = await currentWindow.listen('tauri://close-requested', async function (event) {
            await $asesh.updateAppSession(currentAppSession.uuid, {
                context: {
                    openedAbsoluteFilePaths: unref(useActiveTabs(session).tabs)
                        .map(i => getFileByUuid(i.fileUuid)?.fullPath)
                        .filter(i => i != undefined)
                }
            })
        })

        const unlistenDestroyed = await currentWindow.listen('tauri://destroyed', async function (event) {
            await $asesh.updateAppSession(currentAppSession.uuid, {
                context: {
                    openedAbsoluteFilePaths: unref(useActiveTabs(session).tabs)
                        .map(i => getFileByUuid(i.fileUuid)?.fullPath)
                        .filter(i => i != undefined)
                }
            })
        })

        console.log('Added window callbacks.')

        return {
            unlistenClose,
            unlistenDestroyed
        }
    }

    return {
        buildIndex,
        fileIndex,
        fileTree,
        getFileByUuid,
        addFileToIndex,
        removeFileFromIndex,
        moveFileInIndex,
        startWatcher,
        stopWatcher,
        clearIndex,
        on,
        updateIndex,
        getFileByPath,
        getFilesByPaths,
        addWindowCloseCallbacks
    };
}