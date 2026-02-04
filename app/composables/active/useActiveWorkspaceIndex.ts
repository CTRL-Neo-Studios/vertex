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
import {invoke} from "@tauri-apps/api/core"
import {defaultActiveWorkspaceFileIndex, defaultUITreeNode} from "#shared/utils/defaults/actives";
import useUuid from "~/composables/utility/useUuid";
import type {FrontmatterProperties, PossiblyRef} from "#shared/types/types";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {InternalLinkNode} from "#codemirror-rich-obsidian-editor/editor-types";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessions} from "~/composables/app/useAppSessions";
import type {UnlistenFn} from "@tauri-apps/api/event";
import {getFileExtensionFromPath, isPlainTextFile, isUnreadableAsText, isYamlFile} from "#shared/utils/fs/filenames";
import type {YamlFormData} from "@type32/yaml-editor-form";

const watcherRegistry = new Map<string, UnwatchFn>();
const listenerRegistry = new Map<string, Set<WorkspaceIndexListener>>();

/**
 * Result type for batch file reading from Rust backend
 */
interface FileReadResult {
    path: string;
    content?: string;
    error?: string;
}

/**
 * Reads multiple text files in a single batch call to Rust backend.
 * Much faster than individual readTextFile calls due to reduced IPC overhead.
 */
async function readTextFilesBatch(paths: string[]): Promise<Map<string, string>> {
    const results = await invoke<FileReadResult[]>('read_text_files_batch', { paths });
    const contentMap = new Map<string, string>();
    
    for (const result of results) {
        if (result.content) {
            contentMap.set(result.path, result.content);
        } else if (result.error) {
            console.error(`Failed to read ${result.path}:`, result.error);
        }
    }
    
    return contentMap;
}

/**
 * Private helper function to extract file extension from a filename.
 * Handles edge cases like .env.dev (returns 'dev') or .env (returns 'env').
 * Returns empty string if no extension.
 *
 * @param {string} fileName - The file name
 * @returns {string} The file extension without the dot
 * @private
 */
function _extractFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) {
        // No extension or file starts with dot (hidden file with no extension)
        return '';
    }
    return fileName.substring(lastDotIndex + 1);
}

/**
 * Private helper function to parse file content properties (frontmatter for text files, YAML for .yml/.yaml files)
 *
 * @param {string} path - The absolute file path
 * @param {string} content - The file content
 * @returns {object} Object containing properties
 * @private
 */
function _parseFileContentProperties(path: string, content: string): { properties: YamlFormData } {
    const extension = getFileExtensionFromPath(path);

    // Handle .yml/.yaml files as pure YAML
    if (isYamlFile(extension)) {
        try {
            const yamlResult = parseYaml(content);
            if (yamlResult.error) {
                console.error(`YAML parsing error in ${path}:`, yamlResult.error);
                return { properties: {} };
            }
            return { properties: yamlResult.data || {} };
        } catch (error) {
            console.error(`Failed to parse YAML in ${path}:`, error);
            return { properties: {} };
        }
    }

    // Only parse frontmatter for plain text files
    if (!isPlainTextFile(extension)) {
        return { properties: {} };
    }

    const fmResult = parseFrontmatter(content);
    if (fmResult.error) {
        console.error(`Frontmatter parsing error in ${path}:`, fmResult.error);
        return { properties: {} };
    }

    return { properties: fmResult.data || {} };
}

/**
 * Simplified document parser for initial indexing.
 * Only extracts properties and raw internal links without resolving them.
 * Much faster than updateIndex since it doesn't build link maps or update backlinks.
 * 
 * @param {string} path - The absolute file path
 * @param {string} content - The file content (pre-loaded)
 * @param {Record<string, ActiveWorkspaceFileIndex>} index - The index being built
 * @param {object} timings - Optional timing accumulator
 * @private
 */
function _parseDocumentInitial(path: string, content: string, index: Record<string, ActiveWorkspaceFileIndex>, timings?: {properties: number, links: number}) {
    const node = index[path];
    if (!node || node.isFolder) return;

    const extension = getFileExtensionFromPath(path);
    if (isUnreadableAsText(extension)) return;

    try {
        // Parse properties
        const propsStart = Date.now();
        const parsed = _parseFileContentProperties(path, content);
        node.properties = parsed.properties;
        if (timings) timings.properties += Date.now() - propsStart;
        
        // Extract raw internal links (don't resolve yet)
        const linksStart = Date.now();
        const internalLinks = getInternalLinks(content);
        (node as any)._rawInternalLinks = internalLinks; // Temporary storage
        if (timings) timings.links += Date.now() - linksStart;
        
    } catch (parseError) {
        console.error(`Failed to parse file content for: ${path}`, parseError);
    }
}

export function useActiveWorkspaceIndex(session?: ActiveSession) {
    if (!session) {
        console.error("useActiveWorkspaceIndex was called without a session!");
    }

    const $win = useAppWebviewWindows()
    const $asesh = useAppSessions()

    const fileIndex = useState<Record<string, ActiveWorkspaceFileIndex>>(`active.workspace.indexMap.${session?.uuid ?? useUuid()}`, () => ({}));
    const uuidToFilePathIndex = useState<Map<string, string>>(`active.workspace.uuidToFilePathIndexMap.${session?.uuid ?? useUuid()}`, () => new Map());

    const fileTree = computed<UITreeNode[]>(() => {
        const index = fileIndex.value;
        if (Object.keys(index).length === 0) return [];

        const getNode = (path: string): UITreeNode => {
            const file = index[path];
            return defaultUITreeNode({
                ...file,
                children: file?.children.map(getNode) || []
            });
        };

        const rootNodes: UITreeNode[] = [];
        for (const path in index) {
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            if (!index[parentPath]) {
                rootNodes.push(getNode(path));
            }
        }
        return rootNodes;
    });

    /**
     * Builds index from a root path using Tauri's native recursive fs scan.
     * Optimized to separate recursion from metadata collection.
     */
    async function buildIndex(workspaceRootFilePath: PossiblyRef<string>) {
        const newIndex: Record<string, ActiveWorkspaceFileIndex> = {};
        const workspaceRoot = unref(workspaceRootFilePath)
        const time = new Date().getTime()
        const propertiesFiles: string[] = [];

        // Phase 1: Fast recursion - only build structure
        async function processDirectory(currentPath: string) {
            const entries = await readDir(currentPath);
            const childrenPaths: string[] = [];

            for (const entry of entries) {
                if (entry.name.startsWith('.')) continue;

                const entryPath = await join(currentPath, entry.name);
                childrenPaths.push(entryPath);

                // Create basic index entry without expensive stat calls
                newIndex[entryPath] = defaultActiveWorkspaceFileIndex({
                    uuid: useUuid(),
                    fullPath: entryPath,
                    relativePath: entryPath.replace(workspaceRoot, '').substring(1),
                    fileName: entry.name,
                    fileExt: _extractFileExtension(entry.name),
                    isFolder: entry.isDirectory,
                    children: [],
                    properties: {},
                    forelinks: [],
                    backlinks: [],
                    // Timestamps and size will be set in phase 2
                });

                // Track properties files for later processing
                if (!entry.isDirectory && (entry.name === 'properties.yml' || entry.name === 'properties.yaml')) {
                    propertiesFiles.push(entryPath);
                }

                if (entry.isDirectory) {
                    newIndex[entryPath].children = (await processDirectory(entryPath)).sort();
                }
            }
            return childrenPaths;
        }

        const _dirProcessTime = new Date().getTime();
        await processDirectory(workspaceRoot);
        console.log(`Directory processing took: ${(new Date()).getTime() - _dirProcessTime}ms`)

        // Phase 2: Populate metadata and batch read files
        const _fileProcessTime = new Date().getTime();
        
        // Collect paths that need parsing
        const pathsToRead: string[] = [];
        const statTasks: Promise<void>[] = [];
        
        let totalStatTime = 0;
        let statCount = 0;
        
        for (const path in newIndex) {
            const node = newIndex[path];
            if (!node) continue;

            // Queue stat task for all files
            statTasks.push((async () => {
                const statStart = Date.now();
                try {
                    const fileStats = await stat(path);
                    node.createdTime = fileStats.birthtime ? new Date(fileStats.birthtime) : new Date();
                    node.modifiedTime = fileStats.mtime ? new Date(fileStats.mtime) : new Date();
                    node.size = fileStats.size || 0;
                    totalStatTime += Date.now() - statStart;
                    statCount++;
                } catch (error) {
                    console.error(`Failed to get stats for ${path}:`, error);
                    totalStatTime += Date.now() - statStart;
                    statCount++;
                }
            })());

            // Collect paths that need content parsing
            if (!node.isFolder) {
                const extension = getFileExtensionFromPath(path);
                if (isPlainTextFile(extension) || isYamlFile(extension)) {
                    pathsToRead.push(path);
                }
            }
        }

        // Execute stat tasks and batch file reading in parallel
        const batchReadStart = Date.now();
        const [, fileContents] = await Promise.all([
            Promise.all(statTasks),
            readTextFilesBatch(pathsToRead)
        ]);
        const batchReadTime = Date.now() - batchReadStart;

        // Parse all loaded file contents
        const parseTimings = {properties: 0, links: 0};
        const parseStart = Date.now();
        
        for (const path of pathsToRead) {
            const content = fileContents.get(path);
            if (content) {
                _parseDocumentInitial(path, content, newIndex, parseTimings);
            }
        }
        
        const totalParseTime = Date.now() - parseStart;
        const totalFileProcessTime = Date.now() - _fileProcessTime;
        
        console.log(`File processing took: ${totalFileProcessTime}ms`);
        console.log(`  - stat() calls: ${statCount} files, ${totalStatTime}ms total, ${(totalStatTime/statCount).toFixed(2)}ms avg`);
        console.log(`  - batch file reading: ${pathsToRead.length} files, ${batchReadTime}ms total, ${(batchReadTime/pathsToRead.length).toFixed(2)}ms avg`);
        console.log(`  - parsing: ${pathsToRead.length} files, ${totalParseTime}ms total, ${(totalParseTime/pathsToRead.length).toFixed(2)}ms avg`);
        if (pathsToRead.length > 0) {
            console.log(`    • property parsing: ${parseTimings.properties}ms (${(parseTimings.properties/pathsToRead.length).toFixed(2)}ms avg)`);
            console.log(`    • link extraction: ${parseTimings.links}ms (${(parseTimings.links/pathsToRead.length).toFixed(2)}ms avg)`);
        }

        const _propertiesProcessTime = new Date().getTime();
        // Process properties files and assign to parent folders
        for (const propertiesPath of propertiesFiles) {
            const parentPath = propertiesPath.substring(0, propertiesPath.lastIndexOf('/'));
            const parentNode = newIndex[parentPath];

            if (parentNode && parentNode.isFolder) {
                try {
                    const content = await readTextFile(propertiesPath);
                    const parsed = _parseFileContentProperties(propertiesPath, content);
                    parentNode.properties = parsed.properties;
                } catch (error) {
                    console.error(`Failed to read properties file ${propertiesPath}:`, error);
                }
            }
        }
        console.log(`Properties processing took: ${(new Date()).getTime() - _propertiesProcessTime}ms`);

        const _linkProcessTime = new Date().getTime();
        // Phase 3: Build link target map and resolve forelinks (single pass)
        const linkTargetToUuidMap = new Map<string, string>();
        
        for (const path in newIndex) {
            const file = newIndex[path];
            if (!file) continue;
            
            // Populate uuid-to-path map
            unref(uuidToFilePathIndex).set(file.uuid, path);
            
            // Build link target map for non-folders
            if (!file.isFolder) {
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
        console.log(`Link processing took: ${(new Date()).getTime() - _linkProcessTime}ms`);
        const _linksProcessTime = new Date().getTime();
        // Resolve forelinks and compute backlinks
        for (const path in newIndex) {
            const file = newIndex[path];
            if (!file || file.isFolder) continue;

            // Resolve raw internal links to UUIDs
            const rawLinks = (file as any)._rawInternalLinks as InternalLinkNode[] | undefined;
            if (rawLinks) {
                const forelinks = new Set<string>();
                for (const linkNode of rawLinks) {
                    const targetUuid = linkTargetToUuidMap.get(linkNode.path);
                    if (targetUuid) {
                        forelinks.add(targetUuid);
                    }
                }
                file.forelinks = Array.from(forelinks);
                delete (file as any)._rawInternalLinks; // Clean up temporary data
            }

            // Compute backlinks
            for (const forelinkUuid of file.forelinks) {
                const targetPath = unref(uuidToFilePathIndex).get(forelinkUuid);
                if (targetPath) {
                    const targetFile = newIndex[targetPath];
                    if (targetFile && !targetFile.backlinks.includes(file.uuid)) {
                        targetFile.backlinks.push(file.uuid);
                    }
                }
            }
        }
        console.log(
          `Links processing took: ${new Date().getTime() - _linksProcessTime}ms`
        );

        fileIndex.value = newIndex;
        console.log(`Indexing took: ${(new Date()).getTime() - time}ms`)
        return newIndex;
    }

    /**
     * Clears the File index map and uuid map.
     */
    function clearIndex() {
        fileIndex.value = {}
        unref(uuidToFilePathIndex).clear()
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
            const fileName = path.substring(path.lastIndexOf('/') + 1);

            const createdTime = fileStats.birthtime ? new Date(fileStats.birthtime) : new Date();
            const modifiedTime = fileStats.mtime ? new Date(fileStats.mtime) : new Date();
            const size = fileStats.size || 0;

            const newEntry: ActiveWorkspaceFileIndex = defaultActiveWorkspaceFileIndex({
                uuid: uuid,
                fullPath: path,
                relativePath: path.replace(workspaceRoot, '').substring(1),
                fileName: fileName,
                fileExt: _extractFileExtension(fileName),
                isFolder: isDirectory,
                size: size,
                children: [],
                properties: {},
                forelinks: [],
                backlinks: [],
                createdTime,
                modifiedTime
            });
            unref(fileIndex)[path] = newEntry;
            
            // Update uuid map
            unref(uuidToFilePathIndex).set(uuid, path);

            const parentNode = fileIndex.value[parentPath];
            if (parentNode && !parentNode.children.includes(path)) {
                parentNode.children.push(path);
                if (autoSort) parentNode.children.sort();
                parentNode.modifiedTime = new Date();
            }

            // Handle properties files
            if (!isDirectory && (fileName === 'properties.yml' || fileName === 'properties.yaml')) {
                if (parentNode) {
                    try {
                        const content = await readTextFile(path);
                        const parsed = _parseFileContentProperties(path, content);
                        parentNode.properties = parsed.properties;
                        parentNode.modifiedTime = new Date();
                    } catch (error) {
                        console.error(`Failed to read properties file ${path}:`, error);
                    }
                }
            } else if (!isDirectory) {
                const extension = getFileExtensionFromPath(path);
                if (isPlainTextFile(extension)) {
                    console.log('Preparsing Non-Dir: ', path, extension)
                    await preparseDocument(path, unref(fileIndex));
                }
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

        if (nodeToRemove.isFolder) {
            [...nodeToRemove.children].forEach(childId => {
                removedNodes.push(...removeFileFromIndex(childId));
            });
        }

        // Clean up backlinks and forelinks using uuid map (O(1) lookups)
        if (!nodeToRemove.isFolder) {
            // Remove this file from the backlinks of files it references (its forelinks)
            for (const forelinkUuid of nodeToRemove.forelinks) {
                const targetPath = unref(uuidToFilePathIndex).get(forelinkUuid);
                if (targetPath) {
                    const file = unref(fileIndex)[targetPath];
                    if (file) {
                        const backlinkIndex = file.backlinks.indexOf(nodeToRemove.uuid);
                        if (backlinkIndex > -1) {
                            file.backlinks.splice(backlinkIndex, 1);
                        }
                    }
                }
            }

            // Remove this file from the forelinks of files that reference it (its backlinks)
            for (const backlinkUuid of nodeToRemove.backlinks) {
                const targetPath = unref(uuidToFilePathIndex).get(backlinkUuid);
                if (targetPath) {
                    const file = unref(fileIndex)[targetPath];
                    if (file) {
                        const forelinkIndex = file.forelinks.indexOf(nodeToRemove.uuid);
                        if (forelinkIndex > -1) {
                            file.forelinks.splice(forelinkIndex, 1);
                        }
                    }
                }
            }
        }

        const parentPath = path.substring(0, path.lastIndexOf('/'));
        const parentNode = unref(fileIndex)[parentPath];
        if (parentNode) {
            const childIndex = parentNode.children.indexOf(path);
            if (childIndex > -1) {
                parentNode.children.splice(childIndex, 1);
            }
        }

        removedNodes.push(defaultActiveWorkspaceFileIndex(unref(fileIndex)[path]))
        
        // Remove from uuid map
        unref(uuidToFilePathIndex).delete(nodeToRemove.uuid);
        
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
        const fileIndexState = fileIndex.value;
        const nodeToMove = fileIndexState[oldPath];

        if (!nodeToMove) {
            console.warn(`Attempted to move a node that is not in the index: ${oldPath}`);
            return;
        }

        const recursivelyUpdatePaths = async (currentOldPath: string, currentNewPath: string) => {
            const node = fileIndexState[currentOldPath];
            if (!node) return;

            const newFileName = currentNewPath.substring(currentNewPath.lastIndexOf('/') + 1);
            const newNodeData: ActiveWorkspaceFileIndex = {
                ...node,
                uuid: node.uuid,
                fullPath: currentNewPath,
                relativePath: currentNewPath.replace(workspaceRoot, '').substring(1),
                fileName: newFileName,
                fileExt: _extractFileExtension(newFileName),
                modifiedTime: new Date()
            };

            if (node.isFolder) {
                const updatedChildrenPaths: string[] = [];
                for (const childOldPath of node.children) {
                    const childName = childOldPath.substring(childOldPath.lastIndexOf('/') + 1);
                    const childNewPath = await join(currentNewPath, childName);
                    await recursivelyUpdatePaths(childOldPath, childNewPath);
                    updatedChildrenPaths.push(childNewPath);
                }
                newNodeData.children = updatedChildrenPaths;
            }

            delete fileIndexState[currentOldPath];
            fileIndexState[currentNewPath] = newNodeData;
            
            // Update uuid map with new path
            unref(uuidToFilePathIndex).set(node.uuid, currentNewPath);
        };

        await recursivelyUpdatePaths(oldPath, newPath);

        const oldParentPath = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newParentPath = newPath.substring(0, newPath.lastIndexOf('/'));

        const oldParentNode = fileIndexState[oldParentPath];
        if (oldParentNode) {
            const childIndex = oldParentNode.children.indexOf(oldPath);
            if (childIndex > -1) {
                oldParentNode.children.splice(childIndex, 1);
                oldParentNode.modifiedTime = new Date();
            }
        }

        const newParentNode = fileIndexState[newParentPath];
        if (newParentNode) {
            if (!newParentNode.children.includes(newPath)) {
                newParentNode.children.push(newPath);
                newParentNode.children.sort();
                newParentNode.modifiedTime = new Date();
            }
        }
    }

    async function updateIndex(path: string, content: string, index = fileIndex.value) {
        const node = index[path];
        if (!node || node.isFolder) return;

        const parsed = _parseFileContentProperties(path, content);
        node.properties = parsed.properties;
        node.modifiedTime = new Date();

        // If this is a properties file, also update parent folder
        const fileName = node.fileName;
        if (fileName === 'properties.yml' || fileName === 'properties.yaml') {
            const parentPath = path.substring(0, path.lastIndexOf('/'));
            const parentNode = index[parentPath];
            if (parentNode && parentNode.isFolder) {
                parentNode.properties = parsed.properties;
                parentNode.modifiedTime = new Date();
            }
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

        // Store old forelinks to compute backlink changes
        const oldForelinks = new Set(node.forelinks);
        const newForelinks = Array.from(forelinks);
        node.forelinks = newForelinks;

        // Update backlinks: remove this file from old targets, add to new targets
        const addedLinks = newForelinks.filter(uuid => !oldForelinks.has(uuid));
        const removedLinks = Array.from(oldForelinks).filter(uuid => !forelinks.has(uuid));

        // Remove from old backlinks using uuid map (O(1) lookup)
        for (const removedUuid of removedLinks) {
            const targetPath = unref(uuidToFilePathIndex).get(removedUuid);
            if (targetPath) {
                const file = index[targetPath];
                if (file) {
                    const backlinkIndex = file.backlinks.indexOf(node.uuid);
                    if (backlinkIndex > -1) {
                        file.backlinks.splice(backlinkIndex, 1);
                    }
                }
            }
        }

        // Add to new backlinks using uuid map (O(1) lookup)
        for (const addedUuid of addedLinks) {
            const targetPath = unref(uuidToFilePathIndex).get(addedUuid);
            if (targetPath) {
                const file = index[targetPath];
                if (file && !file.backlinks.includes(node.uuid)) {
                    file.backlinks.push(node.uuid);
                }
            }
        }
    }

    async function preparseDocument(path: string, index = fileIndex.value) {
        const node = index[path];
        if (!node || node.isFolder) return;

        const extension = getFileExtensionFromPath(path);
        if (isUnreadableAsText(extension)) {
            console.log(`Skipping text read for binary file: ${path}`);
            return;
        }

        try {
            const content = await readTextFile(path);
            await updateIndex(path, content, index);
        } catch (readError) {
            console.error(`Failed to read file for preparsing: ${path}`, readError);
        }
    }

    function _broadcast(event: WorkspaceIndexEvent) {
        const listeners = listenerRegistry.get(session!.uuid);
        if (listeners) {
            listeners.forEach(listener => listener(event));
        }
    }

    /**
     * Starts the file system watcher for the specified workspace root.
     */
    async function startWatcher(workspaceRoot: string) {
        if (watcherRegistry.has(session!.uuid)) {
            console.log(`Watcher for session ${session!.uuid} already exists. Stopping it first.`);
            await stopWatcher();
        }

        console.log(`Starting watcher for session ${session!.uuid} on: ${workspaceRoot}`);

        let activeWatcher = await watch(workspaceRoot, (event: WatchEvent) => {
            const currentTabId = useRoute().params.tabId as string;
            if (event.paths.findIndex(i => i.endsWith('.DS_Store')) >= 0) return;

            if (typeof event.type === 'object' && event.type !== null && ('metadata' in event.type || ('modify' in event.type && (event.type.modify.kind === 'metadata' || event.type.modify.kind === 'data')))) return;

            if (typeof event.type === 'object' && event.type !== null) {

                if ('remove' in event.type) {
                    for (const path of event.paths) {
                        console.log(`Remove detected: ${path}`);
                        const removedNodes = removeFileFromIndex(path);
                        _broadcast({ type: 'remove', path, removedNodes });
                    }
                    return;
                }

                if ('modify' in event.type && event.type.modify.kind === 'rename') {
                    if (event.paths.length >= 2) {
                        const [oldPath, newPath] = event.paths;
                        console.log(`Rename detected: ${oldPath} -> ${newPath}`);
                        moveFileInIndex(oldPath || '', newPath || '', workspaceRoot).then(() => {
                            _broadcast({ type: 'rename', oldPath: oldPath || '', newPath: newPath || '' });
                        });
                        return;
                    }

                    if (event.paths.length === 1) {
                        const path = event.paths[0];
                        if (!path) return;

                        setTimeout(async () => {
                            try {
                                await stat(path);
                                const node = fileIndex.value[path];
                                if (!node) return;

                                const parentPath = path.substring(0, path.lastIndexOf('/'));
                                const entries = await readDir(parentPath);
                                const eventFileName = path.substring(path.lastIndexOf('/') + 1);
                                const actualEntry = entries.find(e => e.name.toLowerCase() === eventFileName.toLowerCase());

                                if (actualEntry && actualEntry.name !== node.fileName) {
                                    console.log(`Case-only rename detected: ${node.fileName} -> ${actualEntry.name}`);
                                    const newPath = await join(parentPath, actualEntry.name);
                                    await moveFileInIndex(path, newPath, workspaceRoot);
                                    _broadcast({ type: 'rename', oldPath: path, newPath: newPath });
                                } else {
                                    console.log('Ignoring noisy single-path rename event:', path);
                                }
                            } catch (error) {
                                console.log(`File at '${path}' no longer exists. Treating as remove.`);
                                const removedNodes = removeFileFromIndex(path);
                                _broadcast({ type: 'remove', path, removedNodes });
                            }
                        }, 100);
                        return;
                    }
                }

                if ('create' in event.type) {
                    for (const path of event.paths) {
                        console.log(`Create detected: ${path}`);
                        addFileToIndex(path, workspaceRoot).then(() => {
                            _broadcast({ type: 'create', path });
                        });
                    }
                    return;
                }

                console.log('[Executed Watcher Event]: ', event);

            } else {
                console.log(`Received simple string event type: "${event.type}"`);
            }

        }, { recursive: true, delayMs: 5 });

        watcherRegistry.set(session!.uuid, activeWatcher);
        console.log(`Watcher started and registered for session ${session!.uuid}.`);

        return activeWatcher
    }

    /**
     * Stops the currently active file system watcher.
     */
    async function stopWatcher() {
        const unwatchFn = watcherRegistry.get(session!.uuid);

        if (unwatchFn) {
            console.log(`Stopping file watcher for session ${session!.uuid}...`);
            unwatchFn();
            watcherRegistry.delete(session!.uuid);
            listenerRegistry.delete(session!.uuid);
            console.log(`File watcher for session ${session!.uuid} stopped and de-registered.`);
        } else {
            console.log(`No active watcher found in the registry for session ${session!.uuid}.`);
        }
    }

    /**
     * Reads a file at a given path, parses its properties, and updates the index.
     */
    async function updateFrontmatterForPath(path: string, index = fileIndex.value) {
        const node = index[path];
        if (!node || node.isFolder) return;

        const extension = getFileExtensionFromPath(path);
        if (isUnreadableAsText(extension)) {
            console.log(`Skipping text read for binary file: ${path}`);
            return;
        }

        try {
            const content = await readTextFile(path);
            const parsed = _parseFileContentProperties(path, content);
            node.properties = parsed.properties;
            node.modifiedTime = new Date();

            const fileName = node.fileName;
            if (fileName === 'properties.yml' || fileName === 'properties.yaml') {
                const parentPath = path.substring(0, path.lastIndexOf('/'));
                const parentNode = index[parentPath];
                if (parentNode && parentNode.isFolder) {
                    parentNode.properties = parsed.properties;
                    parentNode.modifiedTime = new Date();
                }
            }
        } catch (readError) {
            console.error(`Failed to read file for properties parsing: ${path}`, readError);
        }
    }

    /**
     * Finds a file in the index by its stable UUID.
     */
    /**
     * Finds a file in the index by its stable UUID.
     * O(1) lookup using the uuid-to-path map.
     */
    function getFileByUuid(uuidRef: PossiblyRef<string | undefined>): ActiveWorkspaceFileIndex | null {
        const uuid = unref(uuidRef)
        if (!uuid) return null;

        const path = unref(uuidToFilePathIndex).get(uuid);
        if (!path) return null;

        return unref(fileIndex)[path] || null;
    }

    /**
     * Finds a file in the index by its path.
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

    /**
     * Returns all files in the index that match the provided filter conditions.
     */
    function getFilteredFiles(filter: (file: ActiveWorkspaceFileIndex) => boolean): ActiveWorkspaceFileIndex[] {
        return Object.values(unref(fileIndex)).filter(filter);
    }

    /**
     * Convenience method to get files by a specific extension (e.g., 'md', 'png').
     */
    function getFilesByExtension(extension: string): ActiveWorkspaceFileIndex[] {
        const ext = extension.startsWith('.') ? extension.slice(1).toLowerCase() : extension.toLowerCase();
        return getFilteredFiles((file) => {
            if (file.isFolder) return false;
            const fileExt = file.fileName.split('.').pop()?.toLowerCase();
            return fileExt === ext;
        });
    }

    /**
     * Checks if a file/folder has a properties.yml or properties.yaml file.
     */
    function hasPropertiesFile(fileUuid: PossiblyRef<string>): boolean {
        const uuid = unref(fileUuid);
        const node = getFileByUuid(uuid);

        if (!node) return false;

        if (node.isFolder) {
            const index = unref(fileIndex);
            return node.children.some(childPath => {
                const childNode = index[childPath];
                if (!childNode || childNode.isFolder) return false;

                const fileName = childNode.fileName;
                return fileName === 'properties.yml' || fileName === 'properties.yaml';
            });
        }

        return node.fileName === 'properties.yml' || node.fileName === 'properties.yaml';
    }

    /**
     * Gets the parent folder of a file given its absolute path.
     */
    function getParentFolderByPath(absolutePath: PossiblyRef<string>): ActiveWorkspaceFileIndex | undefined {
        const path = unref(absolutePath);
        if (!path) return undefined;

        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (!parentPath) return undefined;

        const parentNode = unref(fileIndex)[parentPath];

        if (parentNode && parentNode.isFolder) {
            return parentNode;
        }

        return undefined;
    }

    /**
     * Gets the parent folder of a file given its UUID.
     */
    function getParentFolderByUuid(fileUuid: PossiblyRef<string>): ActiveWorkspaceFileIndex | undefined {
        const uuid = unref(fileUuid);
        const node = getFileByUuid(uuid);

        if (!node) return undefined;
        if (node.isFolder) return undefined;

        return getParentFolderByPath(node.fullPath);
    }

    function on(listener: WorkspaceIndexListener): () => void {
        if (!listenerRegistry.has(session!.uuid)) {
            listenerRegistry.set(session!.uuid, new Set());
        }
        const listeners = listenerRegistry.get(session!.uuid)!;

        listeners.add(listener);

        return () => {
            listeners.delete(listener);
        };
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
        getFilteredFiles,
        getFilesByExtension,
        hasPropertiesFile,
        getParentFolderByPath,
        getParentFolderByUuid
    };
}
