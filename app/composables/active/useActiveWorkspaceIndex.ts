import {watch as watchVue, type WatchStopHandle} from "vue";
import {sessionScope, StateKey} from "#shared/constants/app";
import type {ActiveWorkspaceFileIndex, UITreeNode, WorkspaceIndexEvent, WorkspaceIndexListener} from "#shared/types/active/workspace";
import {readDir, readTextFile, stat, type UnwatchFn, watch, type WatchEvent} from "@tauri-apps/plugin-fs";
import {join} from "@tauri-apps/api/path"
import {vertexInvoke} from "~/utils/vertexInvoke"
import {defaultActiveWorkspaceFileIndex} from "#shared/utils/defaults/actives";
import type {PossiblyRef} from "#shared/types/types";
import type {ActiveSession} from "#shared/types/active/sessions";
import {getFileExtensionFromPath, isPlainTextFile, isUnreadableAsText, isYamlFile} from "#shared/utils/fs/filenames";
import {type ContentParsers, isPropertiesFile, parentPathOf, parseLinkTargets, parseNoteMeta, parseProperties} from "#shared/utils/index/parse";
import {LinkGraph} from "#shared/utils/index/linkGraph";
import {RecentWrites} from "#shared/utils/index/selfWrites";
import {getInternalLinks} from "#shared/utils/index/rewriteLinks";
import {stateClient} from "~/utils/stateClient";
import {linkExtractors} from "~/utils/contributions";

/**
 * Per-session runtime objects that must not be deep-reactive (watcher handle, listeners, link graph).
 * Keyed by session uuid; created on first use, dropped by `clearIndex`.
 */
interface SessionRuntime {
    unwatch?: UnwatchFn
    listeners: Set<WorkspaceIndexListener>
    /** `watchUnder`'s listeners, each with its workspace-relative folder. */
    folderWatchers: Set<{ prefix: string, fn: (paths: string[]) => void }>
    graph: LinkGraph
    selfWrites: RecentWrites
    root: string
    /** True after `buildIndex` scanned the whole folder; a singlespace session only tracks its one file. */
    wholeFolder: boolean
    /** Stops `followExtractors`. */
    stopExtractors?: WatchStopHandle
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

/** The link extractor a plugin registered for files of this extension (a canvas's), if any. */
export const linkExtractorFor = (extension: string) => [...linkExtractors.items.values()].find(d => d.match(extension))

const parsers: ContentParsers = {parseYaml, parseFrontmatter, getInternalLinks, linkExtractorFor}

/** Only formats that carry properties or links are read during indexing. */
const isIndexedText = (path: string) => {
    const ext = getFileExtensionFromPath(path)
    return isPlainTextFile(ext) || isYamlFile(ext) || !!linkExtractorFor(ext)
}

function fileExtOf(fileName: string) {
    const dot = fileName.lastIndexOf('.')
    return dot > 0 ? fileName.slice(dot + 1) : ''
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/**
 * The file index of one session, in both modes. A workspace scans its folder (`buildIndex`); a singlespace
 * session is a workspace rooted at the file's folder that indexes and watches only that file (`openFile`).
 */
export function useActiveWorkspaceIndex(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveWorkspaceIndex')
    const fileIndex = useState<Record<string, ActiveWorkspaceFileIndex>>(StateKey.workspaceIndex(scope), () => ({}))
    const uuidToFilePathIndex = useState<Map<string, string>>(StateKey.workspaceUuidToPath(scope), () => new Map())

    function runtime(): SessionRuntime {
        let rt = runtimes.get(scope)
        if (!rt) {
            rt = {listeners: new Set(), folderWatchers: new Set(), graph: new LinkGraph(), selfWrites: new RecentWrites(), root: session?.rootPath ?? '', wholeFolder: false}
            runtimes.set(scope, rt)
        }
        return rt
    }

    const relativeOf = (path: string) => path.slice(runtime().root.length).replace(/^\//, '')

    /** Copy the graph's view of these files' links into the reactive index; unchanged lists aren't written. */
    function syncLinks(uuids: Iterable<string>) {
        const g = runtime().graph
        for (const uuid of uuids) {
            const node = getFileByUuid(uuid)
            if (!node) continue
            const forelinks = g.forelinks(uuid), backlinks = g.backlinks(uuid)
            if (!sameList(node.forelinks, forelinks)) node.forelinks = forelinks
            if (!sameList(node.backlinks, backlinks)) node.backlinks = backlinks
        }
    }

    /** Re-sync a file and every file its links touch (before and after a change). */
    function syncAround(uuid: string, before: string[] = []) {
        const g = runtime().graph
        syncLinks(new Set([uuid, ...before, ...g.forelinks(uuid), ...g.backlinks(uuid), ...g.referencingFiles(uuid)]))
    }

    const fileTree = computed<UITreeNode[]>(() => {
        const index = unref(fileIndex)
        const toNode = (file: ActiveWorkspaceFileIndex): UITreeNode => {
            const icon = file.properties.icon
            return {
                uuid: file.uuid,
                fileName: file.fileName,
                relativePath: file.relativePath,
                isFolder: file.isFolder,
                icon: typeof icon === 'string' && icon ? icon : undefined,
                children: file.children.flatMap(path => {
                    const child = index[path]
                    return child ? [toNode(child)] : []
                }),
            }
        }
        // Sorted like a folder's children (the scan and every move sort those), so a file moved to the top level
        // lands in place rather than at the end.
        return Object.keys(index).filter(p => !index[parentPathOf(p)]).sort().map(p => toNode(index[p]!))
    })

    /** Properties, and for notes the tags and links Bases reads; what didn't change isn't written. */
    function applyProperties(path: string, content: string) {
        const node = unref(fileIndex)[path]
        if (!node || node.isFolder) return
        const {properties, error} = parseProperties(path, content, parsers)
        if (error) console.warn(`[index] could not parse properties of ${path}:`, error)
        // An autosave that changed no property mustn't re-render what reads them (the tree, Bases).
        const changed = JSON.stringify(properties) !== JSON.stringify(node.properties)
        if (changed) node.properties = properties
        if (changed && isPropertiesFile(node.fileName)) {
            const parent = unref(fileIndex)[parentPathOf(path)]
            if (parent?.isFolder) parent.properties = properties
        }
        if (!isPlainTextFile(getFileExtensionFromPath(path))) return
        const meta = parseNoteMeta(content, properties)
        if (JSON.stringify(meta) !== JSON.stringify(node.meta)) node.meta = meta
    }

    /** Full scan. Used once per window open; everything after is incremental. */
    async function buildIndex(rootRef: PossiblyRef<string>) {
        const root = unref(rootRef)
        const rt = runtime()
        rt.root = root
        rt.graph = new LinkGraph()
        rt.wholeFolder = true
        const started = Date.now()

        const entries = await vertexInvoke<DirectoryEntry[]>('scan_directory_recursive', {rootPath: root})
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
        const results = await vertexInvoke<FileReadResult[]>('read_text_files_batch', {paths: textPaths})
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
        followExtractors()
        console.log(`[index] ${entries.length} entries, ${textPaths.length} parsed in ${Date.now() - started}ms`)
        return next
    }

    /**
     * A link extractor registered after the scan (a plugin turned on mid-session) reads the indexed files it now
     * handles. Removal needs nothing: turning a plugin off reloads the window.
     */
    function followExtractors() {
        const rt = runtime()
        rt.stopExtractors?.()
        let known = new Set(linkExtractors.items.values())
        rt.stopExtractors = watchVue(() => [...linkExtractors.items.values()], (extractors) => {
            const added = extractors.filter(d => !known.has(d))
            known = new Set(extractors)
            if (!added.length) return
            for (const node of Object.values(unref(fileIndex))) {
                const extractor = node.isFolder ? undefined : linkExtractorFor(getFileExtensionFromPath(node.fullPath))
                if (!extractor || !added.includes(extractor)) continue
                readTextFile(node.fullPath)
                    .then(content => relink(node.fullPath, content))
                    .catch(error => console.error(`[index] could not read ${node.fullPath}`, error))
            }
        })
    }

    /** Singlespace: index only `path`, rooted at its folder. */
    function openFile(path: string) {
        return addFileToIndex(path, parentPathOf(path))
    }

    function clearIndex() {
        fileIndex.value = {}
        unref(uuidToFilePathIndex).clear()
        runtimes.get(scope)?.stopExtractors?.()
        runtimes.delete(scope)
    }

    /** Indexes the item at `path`. `uuid` gives it back the one it had (Undo of a delete), unless that's in use. */
    async function addFileToIndex(path: string, root: string = runtime().root, uuid?: string) {
        const existing = unref(fileIndex)[path]
        if (existing) return existing
        runtime().root = root
        try {
            const info = await stat(path)
            const fileName = path.slice(path.lastIndexOf('/') + 1)
            const node = defaultActiveWorkspaceFileIndex({
                uuid: uuid && !unref(uuidToFilePathIndex).has(uuid) ? uuid : undefined,
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
            broadcast({type: 'create', path})
            return node
        } catch (error) {
            console.error(`[index] could not add ${path}`, error)
            return null
        }
    }

    /** Takes the item at `path` out of the index, a folder's contents first; everything it removed. */
    function detach(path: string): ActiveWorkspaceFileIndex[] {
        const node = unref(fileIndex)[path]
        if (!node) return []
        const removed: ActiveWorkspaceFileIndex[] = []
        if (node.isFolder) for (const child of [...node.children]) removed.push(...detach(child))
        else {
            const g = runtime().graph
            const touched = [...g.forelinks(node.uuid), ...g.backlinks(node.uuid), ...g.referencingFiles(node.uuid)]
            g.removeFile(node.uuid)
            syncLinks(touched)
        }
        const parent = unref(fileIndex)[parentPathOf(path)]
        if (parent) parent.children = parent.children.filter(c => c !== path)
        unref(uuidToFilePathIndex).delete(node.uuid)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Vue 3 proxies deleteProperty on the reactive index
        delete unref(fileIndex)[path]
        removed.push(node)
        return removed
    }

    /** Removes the item at `path` (a folder with what's in it) from the index, as one `remove` event; everything removed. */
    function removeFileFromIndex(path: string): ActiveWorkspaceFileIndex[] {
        const removedNodes = detach(path)
        if (removedNodes.length) broadcast({type: 'remove', path, removedNodes})
        return removedNodes
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
            // Its times stay: a rename doesn't modify a file.
            const next = {...node, fullPath: to, relativePath: relativeOf(to), fileName, fileExt: fileExtOf(fileName)}
            if (node.isFolder) {
                next.children = []
                for (const child of node.children) {
                    const childTo = await join(to, child.slice(child.lastIndexOf('/') + 1))
                    await relocate(child, childTo)
                    next.children.push(childTo)
                }
            } else moved.push(node.uuid)
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Vue 3 proxies deleteProperty on the reactive index
            delete index[from]
            index[to] = next
            unref(uuidToFilePathIndex).set(node.uuid, to)
        }
        await relocate(oldPath, newPath)
        // Moves inside the open workspace (Vertex's own, and ones its watcher sees) carry trust along.
        void stateClient.moveTrust(oldPath, newPath).catch(e => console.error('[index] could not move trust', e))

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
        // One event for the item moved: what's inside a folder went with it.
        broadcast({type: 'rename', oldPath, newPath})
    }

    /** Re-parse one document's properties and links after its content changed (in-app save or external edit). */
    async function updateIndex(path: string, content: string) {
        const node = unref(fileIndex)[path]
        if (!node || node.isFolder) return
        node.modifiedTime = new Date()
        applyProperties(path, content)
        relink(path, content)
    }

    /** Re-reads a file's links into the graph, and re-syncs every file they touch (before and after). */
    function relink(path: string, content: string) {
        const node = unref(fileIndex)[path]
        if (!node || node.isFolder) return
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

    /**
     * Tells the listeners. `create`, `remove` and `rename` come from the index's own `addFileToIndex`,
     * `removeFileFromIndex` and `moveFileInIndex`, so they're raised whoever changed the files: the app (Files' New,
     * Delete, Rename, moves, their undo) or another program (the watcher). A listener that throws is logged and the
     * rest still hear it: a file operation is never left half done by one.
     */
    function broadcast(event: WorkspaceIndexEvent) {
        for (const listener of runtime().listeners) {
            try {
                listener(event)
            } catch (error) {
                console.error('[index] a listener threw', error)
            }
        }
    }

    async function handleWatchEvent(event: WatchEvent) {
        const type = event.type
        if (typeof type !== 'object' || type === null) return
        if (event.paths.length === 0 || 'access' in type || 'metadata' in type) return
        const rt = runtime()
        if (rt.wholeFolder) broadcast({type: 'changed', paths: event.paths})
        // The workspace's own settings changed on disk (an editor, git, sync): Rust re-reads and broadcasts them.
        if (rt.wholeFolder && event.paths.includes(`${rt.root}/.vertex/settings.json`)) {
            void stateClient.reloadWorkspaceSettings(rt.root).catch(e => console.error('[index] workspace settings', e))
        }
        if (rt.wholeFolder) for (const {prefix, fn} of rt.folderWatchers) {
            const under = event.paths.filter(p => relativeOf(p).startsWith(prefix))
            if (under.length) fn(under)
        }
        // Same rule as the initial scan (`scan_directory_recursive`): nothing under a dot-name is indexed, so
        // `.vertex/` (settings temp files, trash), `.git/` and `.DS_Store` never reach the index.
        const paths = event.paths.filter(p => !relativeOf(p).split('/').some(part => part.startsWith('.')))
        if (paths.length === 0) return
        if ('remove' in type) {
            for (const path of paths) if (!rt.selfWrites.has(path)) removeFileFromIndex(path)
            return
        }

        if ('create' in type) {
            if (!rt.wholeFolder) return
            for (const path of paths) {
                if (rt.selfWrites.has(path) || unref(fileIndex)[path]) continue
                await addFileToIndex(path)
            }
            return
        }

        if (!('modify' in type)) return
        const kind = type.modify.kind

        if (kind === 'rename') {
            if (paths.length >= 2) {
                const [oldPath, newPath] = paths as [string, string]
                if (rt.selfWrites.has(oldPath) && rt.selfWrites.has(newPath)) return
                if (!unref(fileIndex)[oldPath]) return
                await moveFileInIndex(oldPath, newPath)
                return
            }
            // macOS reports some renames as two single-path events; resolve from disk.
            const path = paths[0]!
            if (rt.selfWrites.has(path)) return
            // eslint-disable-next-line @typescript-eslint/no-invalid-void-type -- void marks the "no value" settle signal
            const settled = Promise.withResolvers<void>()
            setTimeout(settled.resolve, 100)
            await settled.promise
            try {
                await stat(path)
                const node = unref(fileIndex)[path]
                if (!node) {
                    if (!rt.wholeFolder) return
                    await addFileToIndex(path)
                    return
                }
                const actual = (await readDir(parentPathOf(path))).find(e => e.name.toLowerCase() === node.fileName.toLowerCase())
                if (actual && actual.name !== node.fileName) await moveFileInIndex(path, await join(parentPathOf(path), actual.name))
            } catch {
                removeFileFromIndex(path)
            }
            return
        }

        // Content changes from other editors, git, sync tools…: re-parse indexed formats, and tell open tabs
        // about every tracked file so they can reload (including code/LaTeX files).
        // The disk decides what happened, not the event's kind: macOS reports a file's recent events together, so a
        // file deleted seconds after it was made arrives as a modify, and so can a new one.
        if (kind === 'data' || kind === 'any') {
            for (const path of paths) {
                if (rt.selfWrites.has(path)) continue
                if (!await stat(path).catch(() => null)) removeFileFromIndex(path)
                else if (!unref(fileIndex)[path]) {
                    if (rt.wholeFolder) await addFileToIndex(path)
                } else {
                    if (isIndexedText(path)) await reparse(path)
                    broadcast({type: 'modify', path})
                }
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
        }, {recursive: rt.wholeFolder, delayMs: 50})
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

    /**
     * The file a link target (`[[target]]` without `#heading`) points at, as the link graph resolves it. Reactive to
     * files being added, removed or renamed (the uuid map), so a link to a note that appears later resolves then.
     */
    function resolveLink(target: string): ActiveWorkspaceFileIndex | undefined {
        void unref(uuidToFilePathIndex).size
        const id = runtime().graph.resolveTarget(target)
        return id ? getFileByUuid(id) ?? undefined : undefined
    }

    function getPropertiesFile(uuidRef: PossiblyRef<string | undefined>): string | undefined {
        const node = getFileByUuid(uuidRef)
        if (!node) return
        if (!node.isFolder) return isPropertiesFile(node.fileName) ? node.uuid : undefined
        return node.children.map(c => unref(fileIndex)[c]).find(c => c && !c.isFolder && isPropertiesFile(c.fileName))?.uuid
    }

    function on(listener: WorkspaceIndexListener): () => void {
        const listeners = runtime().listeners
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    /**
     * Raw watcher paths under a workspace-relative folder (`.vertex/chats/`), for what lives where the index doesn't
     * look (dot folders). Whole-folder watches only.
     */
    function watchUnder(prefix: string, fn: (paths: string[]) => void): () => void {
        const watchers = runtime().folderWatchers
        const watcher = {prefix, fn}
        watchers.add(watcher)
        return () => watchers.delete(watcher)
    }

    return {
        buildIndex,
        openFile,
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
        watchUnder,
        /** For writes the app makes to a file on behalf of another feature (the watcher ignores self-writes), so open tabs reload. */
        notifyModified: (path: string) => broadcast({type: 'modify', path}),
        updateIndex,
        markSelfWrite,
        getRenameImpact,
        getFileByPath,
        getFilesByPaths,
        getFilteredFiles,
        resolveLink,
        /** Every resolved link as a pair of uuids, and a file's targets that find no file: read off the link graph. */
        links: () => runtime().graph.links(),
        unresolved: (uuid: string) => runtime().graph.unresolved(uuid),
        getPropertiesFile,
    }
}
