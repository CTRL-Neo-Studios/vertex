import {sessionScope, StateKey} from "#shared/constants/app";
import type {ActiveWorkspaceFileIndex, UITreeNode, WorkspaceIndexEvent, WorkspaceIndexListener} from "#shared/types/active/workspace";
import {readDir, readTextFile, stat, type UnwatchFn, watch, type WatchEvent} from "@tauri-apps/plugin-fs";
import {join} from "@tauri-apps/api/path"
import {invoke} from "@tauri-apps/api/core"
import {defaultActiveWorkspaceFileIndex, defaultUITreeNode} from "#shared/utils/defaults/actives";
import type {PossiblyRef} from "#shared/types/types";
import type {ActiveSession} from "#shared/types/active/sessions";
import {getFileExtensionFromPath, isPlainTextFile, isUnreadableAsText, isYamlFile} from "#shared/utils/fs/filenames";
import {type ContentParsers, isPropertiesFile, parentPathOf, parseLinkTargets, parseProperties} from "#shared/utils/index/parse";
import {LinkGraph} from "#shared/utils/index/linkGraph";
import {RecentWrites} from "#shared/utils/index/selfWrites";

/**
 * Per-session runtime objects that must not be deep-reactive (watcher handle, listeners, link graph).
 * Keyed by session uuid; created on first use, dropped by `clearIndex`.
 */
interface SessionRuntime {
    unwatch?: UnwatchFn
    listeners: Set<WorkspaceIndexListener>
    graph: LinkGraph
    selfWrites: RecentWrites
    root: string
}
const runtimes = new Map<string, SessionRuntime>()

interface FileReadResult { path: string, content?: string, error?: string }
interface DirectoryEntry {
    path: string
    name: string
    is_directory: boolean
    size: number
    created?: number
    modified?: number
    children: string[]
}

const parsers: ContentParsers = {parseYaml, parseFrontmatter, getInternalLinks}

/** Only formats that carry properties or links are read during indexing. */
const isIndexedText = (path: string) => {
    const ext = getFileExtensionFromPath(path)
    return isPlainTextFile(ext) || isYamlFile(ext)
}

function fileExtOf(fileName: string) {
    const dot = fileName.lastIndexOf('.')
    return dot > 0 ? fileName.slice(dot + 1) : ''
}

export function useActiveWorkspaceIndex(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveWorkspaceIndex')
    const fileIndex = useState<Record<string, ActiveWorkspaceFileIndex>>(StateKey.workspaceIndex(scope), () => ({}))
    const uuidToFilePathIndex = useState<Map<string, string>>(StateKey.workspaceUuidToPath(scope), () => new Map())

    function runtime(): SessionRuntime {
        let rt = runtimes.get(scope)
        if (!rt) {
            rt = {listeners: new Set(), graph: new LinkGraph(), selfWrites: new RecentWrites(), root: session?.rootPath ?? ''}
            runtimes.set(scope, rt)
        }
        return rt
    }

    const relativeOf = (path: string) => path.slice(runtime().root.length).replace(/^\//, '')

    /** Copy the graph's view of these files' links into the reactive index. */
    function syncLinks(uuids: Iterable<string>) {
        const g = runtime().graph
        for (const uuid of uuids) {
            const node = getFileByUuid(uuid)
            if (!node) continue
            node.forelinks = g.forelinks(uuid)
            node.backlinks = g.backlinks(uuid)
        }
    }

    /** Re-sync a file and every file its links touch (before and after a change). */
    function syncAround(uuid: string, before: string[] = []) {
        const g = runtime().graph
        syncLinks(new Set([uuid, ...before, ...g.forelinks(uuid), ...g.backlinks(uuid), ...g.referencingFiles(uuid)]))
    }

    const fileTree = computed<UITreeNode[]>(() => {
        const index = unref(fileIndex)
        const toNode = (path: string): UITreeNode => {
            const file = index[path]
            return defaultUITreeNode({...file, children: file?.children.map(toNode) ?? []})
        }
        return Object.keys(index).filter(p => !index[parentPathOf(p)]).map(toNode)
    })

    function applyProperties(path: string, content: string) {
        const node = unref(fileIndex)[path]
        if (!node || node.isFolder) return
        const {properties, error} = parseProperties(path, content, parsers)
        if (error) console.warn(`[index] could not parse properties of ${path}:`, error)
        node.properties = properties
        if (isPropertiesFile(node.fileName)) {
            const parent = unref(fileIndex)[parentPathOf(path)]
            if (parent?.isFolder) parent.properties = properties
        }
    }

    /** Full scan. Used once per window open; everything after is incremental. */
    async function buildIndex(rootRef: PossiblyRef<string>) {
        const root = unref(rootRef)
        const rt = runtime()
        rt.root = root
        rt.graph = new LinkGraph()
        const started = Date.now()

        const entries = await invoke<DirectoryEntry[]>('scan_directory_recursive', {rootPath: root})
        const next: Record<string, ActiveWorkspaceFileIndex> = {}
        const uuidMap = unref(uuidToFilePathIndex)
        uuidMap.clear()
        for (const e of entries) {
            const node = defaultActiveWorkspaceFileIndex({
                fullPath: e.path,
                relativePath: e.path.slice(root.length).replace(/^\//, ''),
                fileName: e.name,
                fileExt: fileExtOf(e.name),
                isFolder: e.is_directory,
                size: e.size,
                children: e.children,
                createdTime: e.created ? new Date(e.created) : new Date(),
                modifiedTime: e.modified ? new Date(e.modified) : new Date(),
            })
            next[e.path] = node
            uuidMap.set(node.uuid, e.path)
            if (!node.isFolder) rt.graph.addFile({id: node.uuid, relativePath: node.relativePath})
        }

        const textPaths = Object.values(next).filter(n => !n.isFolder && isIndexedText(n.fullPath)).map(n => n.fullPath)
        const results = await invoke<FileReadResult[]>('read_text_files_batch', {paths: textPaths})
        fileIndex.value = next
        for (const r of results) {
            if (r.error || r.content === undefined) {
                console.warn(`[index] could not read ${r.path}: ${r.error}`)
                continue
            }
            applyProperties(r.path, r.content)
            rt.graph.setLinks(next[r.path]!.uuid, parseLinkTargets(r.path, r.content, parsers))
        }
        syncLinks(uuidMap.keys())
        console.log(`[index] ${entries.length} entries, ${textPaths.length} parsed in ${Date.now() - started}ms`)
        return next
    }

    function clearIndex() {
        fileIndex.value = {}
        unref(uuidToFilePathIndex).clear()
        runtimes.delete(scope)
    }

    async function addFileToIndex(path: string, root: string = runtime().root) {
        const existing = unref(fileIndex)[path]
        if (existing) return existing
        runtime().root = root
        try {
            const info = await stat(path)
            const fileName = path.slice(path.lastIndexOf('/') + 1)
            const node = defaultActiveWorkspaceFileIndex({
                fullPath: path,
                relativePath: relativeOf(path),
                fileName,
                fileExt: fileExtOf(fileName),
                isFolder: info.isDirectory,
                size: info.size || 0,
                createdTime: info.birthtime ? new Date(info.birthtime) : new Date(),
                modifiedTime: info.mtime ? new Date(info.mtime) : new Date(),
            })
            unref(fileIndex)[path] = node
            unref(uuidToFilePathIndex).set(node.uuid, path)
            const parent = unref(fileIndex)[parentPathOf(path)]
            if (parent && !parent.children.includes(path)) {
                parent.children.push(path)
                parent.children.sort()
            }
            if (!node.isFolder) {
                runtime().graph.addFile({id: node.uuid, relativePath: node.relativePath})
                if (isIndexedText(path)) await reparse(path)
                syncAround(node.uuid)
            }
            return node
        } catch (error) {
            console.error(`[index] could not add ${path}`, error)
            return null
        }
    }

    function removeFileFromIndex(path: string): ActiveWorkspaceFileIndex[] {
        const node = unref(fileIndex)[path]
        if (!node) return []
        const removed: ActiveWorkspaceFileIndex[] = []
        if (node.isFolder) for (const child of [...node.children]) removed.push(...removeFileFromIndex(child))
        else {
            const g = runtime().graph
            const touched = [...g.forelinks(node.uuid), ...g.backlinks(node.uuid), ...g.referencingFiles(node.uuid)]
            g.removeFile(node.uuid)
            syncLinks(touched)
        }
        const parent = unref(fileIndex)[parentPathOf(path)]
        if (parent) parent.children = parent.children.filter(c => c !== path)
        unref(uuidToFilePathIndex).delete(node.uuid)
        delete unref(fileIndex)[path]
        removed.push(node)
        return removed
    }

    /**
     * Rename/move, keeping uuids (and therefore open tabs). Links written against the old name are kept
     * as unresolved targets; `getRenameImpact` lets the UI offer to rewrite them.
     */
    async function moveFileInIndex(oldPath: string, newPath: string, root: string = runtime().root) {
        const index = fileIndex.value
        if (!index[oldPath] || oldPath === newPath) return
        runtime().root = root
        runtime().selfWrites.mark(oldPath, newPath)

        const moved: string[] = []
        const relocate = async (from: string, to: string) => {
            const node = index[from]
            if (!node) return
            const fileName = to.slice(to.lastIndexOf('/') + 1)
            const next = {...node, fullPath: to, relativePath: relativeOf(to), fileName, fileExt: fileExtOf(fileName), modifiedTime: new Date()}
            if (node.isFolder) {
                next.children = []
                for (const child of node.children) {
                    const childTo = await join(to, child.slice(child.lastIndexOf('/') + 1))
                    await relocate(child, childTo)
                    next.children.push(childTo)
                }
            } else moved.push(node.uuid)
            delete index[from]
            index[to] = next
            unref(uuidToFilePathIndex).set(node.uuid, to)
        }
        await relocate(oldPath, newPath)

        const oldParent = index[parentPathOf(oldPath)]
        if (oldParent) oldParent.children = oldParent.children.filter(c => c !== oldPath)
        const newParent = index[parentPathOf(newPath)]
        if (newParent && !newParent.children.includes(newPath)) {
            newParent.children.push(newPath)
            newParent.children.sort()
        }

        const g = runtime().graph
        const touched = new Set<string>()
        for (const uuid of moved) {
            for (const id of [...g.backlinks(uuid), ...g.referencingFiles(uuid)]) touched.add(id)
            g.moveFile(uuid, index[unref(uuidToFilePathIndex).get(uuid)!]!.relativePath)
            for (const id of [uuid, ...g.forelinks(uuid), ...g.backlinks(uuid), ...g.referencingFiles(uuid)]) touched.add(id)
        }
        syncLinks(touched)
    }

    /** Re-parse one document's properties and links after its content changed (in-app save or external edit). */
    async function updateIndex(path: string, content: string) {
        const node = unref(fileIndex)[path]
        if (!node || node.isFolder) return
        node.modifiedTime = new Date()
        applyProperties(path, content)
        const g = runtime().graph
        const before = g.forelinks(node.uuid)
        g.setLinks(node.uuid, parseLinkTargets(path, content, parsers))
        syncAround(node.uuid, before)
    }

    async function reparse(path: string) {
        if (isUnreadableAsText(getFileExtensionFromPath(path))) return
        try {
            await updateIndex(path, await readTextFile(path))
        } catch (error) {
            console.error(`[index] could not read ${path}`, error)
        }
    }

    /** Call right before the app writes a file itself, so the watcher does not re-process it. */
    function markSelfWrite(...paths: string[]) {
        runtime().selfWrites.mark(...paths)
    }

    /** Files whose links currently point at `uuid`, with the exact link text — used to offer link rewriting on rename. */
    function getRenameImpact(uuid: string) {
        const g = runtime().graph
        return g.referencingFiles(uuid)
            .map(id => ({file: getFileByUuid(id)!, targets: g.targetsPointingAt(id, uuid)}))
            .filter(r => r.file && r.targets.length > 0)
    }

    function broadcast(event: WorkspaceIndexEvent) {
        for (const listener of runtime().listeners) listener(event)
    }

    async function handleWatchEvent(event: WatchEvent) {
        const type = event.type
        if (typeof type !== 'object' || type === null) return
        const paths = event.paths.filter(p => !p.endsWith('.DS_Store'))
        if (paths.length === 0 || 'access' in type || 'metadata' in type) return
        const rt = runtime()

        if ('remove' in type) {
            for (const path of paths) {
                if (rt.selfWrites.has(path)) continue
                broadcast({type: 'remove', path, removedNodes: removeFileFromIndex(path)})
            }
            return
        }

        if ('create' in type) {
            for (const path of paths) {
                if (rt.selfWrites.has(path) || unref(fileIndex)[path]) continue
                await addFileToIndex(path)
                broadcast({type: 'create', path})
            }
            return
        }

        if (!('modify' in type)) return
        const kind = type.modify.kind

        if (kind === 'rename') {
            if (paths.length >= 2) {
                const [oldPath, newPath] = paths as [string, string]
                if (rt.selfWrites.has(oldPath) && rt.selfWrites.has(newPath)) return
                await moveFileInIndex(oldPath, newPath)
                broadcast({type: 'rename', oldPath, newPath})
                return
            }
            // macOS reports some renames as two single-path events; resolve from disk.
            const path = paths[0]!
            if (rt.selfWrites.has(path)) return
            const settled = Promise.withResolvers<void>()
            setTimeout(settled.resolve, 100)
            await settled.promise
            try {
                await stat(path)
                const node = unref(fileIndex)[path]
                if (!node) {
                    await addFileToIndex(path)
                    broadcast({type: 'create', path})
                    return
                }
                const actual = (await readDir(parentPathOf(path))).find(e => e.name.toLowerCase() === node.fileName.toLowerCase())
                if (actual && actual.name !== node.fileName) {
                    const newPath = await join(parentPathOf(path), actual.name)
                    await moveFileInIndex(path, newPath)
                    broadcast({type: 'rename', oldPath: path, newPath})
                }
            } catch {
                broadcast({type: 'remove', path, removedNodes: removeFileFromIndex(path)})
            }
            return
        }

        // Content changes from other editors, git, sync tools… — previously dropped, leaving links stale.
        if (kind === 'data' || kind === 'any') {
            for (const path of paths) {
                if (rt.selfWrites.has(path) || !isIndexedText(path) || !unref(fileIndex)[path]) continue
                await reparse(path)
                broadcast({type: 'modify', path})
            }
        }
    }

    async function startWatcher(root: string) {
        await stopWatcher()
        const rt = runtime()
        rt.root = root
        // Serialize events so an async handler never interleaves with the next one.
        let queue: Promise<void> = Promise.resolve()
        rt.unwatch = await watch(root, (event) => {
            queue = queue.then(() => handleWatchEvent(event)).catch(e => console.error('[index] watcher event failed', e))
        }, {recursive: true, delayMs: 50})
    }

    async function stopWatcher() {
        const rt = runtimes.get(scope)
        rt?.unwatch?.()
        if (rt) rt.unwatch = undefined
    }

    function getFileByUuid(uuidRef: PossiblyRef<string | undefined>): ActiveWorkspaceFileIndex | null {
        const uuid = unref(uuidRef)
        const path = uuid ? unref(uuidToFilePathIndex).get(uuid) : undefined
        return path ? unref(fileIndex)[path] ?? null : null
    }

    function getFileByPath(path: PossiblyRef<string>): ActiveWorkspaceFileIndex | undefined {
        return unref(fileIndex)[unref(path)]
    }

    function getFilesByPaths(paths: PossiblyRef<string[]>): ActiveWorkspaceFileIndex[] {
        return unref(paths).map(p => unref(fileIndex)[p]).filter((f): f is ActiveWorkspaceFileIndex => !!f)
    }

    function getFilteredFiles(filter: (file: ActiveWorkspaceFileIndex) => boolean): ActiveWorkspaceFileIndex[] {
        return Object.values(unref(fileIndex)).filter(filter)
    }

    function getFilesByExtension(extension: string): ActiveWorkspaceFileIndex[] {
        const ext = extension.replace(/^\./, '').toLowerCase()
        return getFilteredFiles(f => !f.isFolder && getFileExtensionFromPath(f.fileName) === ext)
    }

    /** Files whose `tags` property (frontmatter) contains `tag`. Accepts a list or a single string. */
    function getFilesByTag(tag: string): ActiveWorkspaceFileIndex[] {
        return getFilteredFiles(f => {
            const tags = (f.properties as Record<string, unknown>)?.tags
            return Array.isArray(tags) ? tags.includes(tag) : tags === tag
        })
    }

    function getPropertiesFile(uuidRef: PossiblyRef<string | undefined>): string | undefined {
        const node = getFileByUuid(uuidRef)
        if (!node) return
        if (!node.isFolder) return isPropertiesFile(node.fileName) ? node.uuid : undefined
        return node.children.map(c => unref(fileIndex)[c]).find(c => c && !c.isFolder && isPropertiesFile(c.fileName))?.uuid
    }

    function hasPropertiesFile(uuidRef: PossiblyRef<string>): boolean {
        return getPropertiesFile(uuidRef) !== undefined
    }

    function getParentFolderByPath(path: PossiblyRef<string>): ActiveWorkspaceFileIndex | undefined {
        const parent = unref(fileIndex)[parentPathOf(unref(path))]
        return parent?.isFolder ? parent : undefined
    }

    function getParentFolderByUuid(uuidRef: PossiblyRef<string>): ActiveWorkspaceFileIndex | undefined {
        const node = getFileByUuid(uuidRef)
        return node && !node.isFolder ? getParentFolderByPath(node.fullPath) : undefined
    }

    function on(listener: WorkspaceIndexListener): () => void {
        const listeners = runtime().listeners
        listeners.add(listener)
        return () => listeners.delete(listener)
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
        markSelfWrite,
        getRenameImpact,
        getFileByPath,
        getFilesByPaths,
        getFilteredFiles,
        getFilesByExtension,
        getFilesByTag,
        hasPropertiesFile,
        getPropertiesFile,
        getParentFolderByPath,
        getParentFolderByUuid,
    }
}
