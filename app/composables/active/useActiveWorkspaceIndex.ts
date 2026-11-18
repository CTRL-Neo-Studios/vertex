import {watch as watchVue, type WatchStopHandle} from "vue";
import {sessionScope, StateKey} from "#shared/constants/app";
import type {ActiveWorkspaceFileIndex, ScannedEntry, UITreeNode, WorkspaceIndexEvent, WorkspaceIndexListener} from "#shared/types/active/workspace";
import {readDir, readTextFile, stat, type UnwatchFn, watch, type WatchEvent} from "@tauri-apps/plugin-fs";
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
        // Nothing a save changes but `icon`: a note's other properties don't rebuild the tree.
        const toNode = (file: ActiveWorkspaceFileIndex): UITreeNode => ({
            uuid: file.uuid,
            fileName: file.fileName,
            relativePath: file.relativePath,
            isFolder: file.isFolder,
            icon: file.icon,
            children: file.children.flatMap(path => {
                const child = index[path]
                return child ? [toNode(child)] : []
            }),
        })
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
        const icon = typeof properties.icon === 'string' && properties.icon ? properties.icon : undefined
        if (changed) {
            node.properties = properties
            node.icon = icon
        }
        if (changed && isPropertiesFile(node.fileName)) {
            const parent = unref(fileIndex)[parentPathOf(path)]
            if (parent?.isFolder) {
                parent.properties = properties
                parent.icon = icon
            }
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
        rt.wholeFolder = true
        const started = Date.now()

        const entries = await vertexInvoke<ScannedEntry[]>('scan_directory_recursive', {rootPath: root})
        const texts = await readTexts(entries)
        rt.graph = new LinkGraph()
        fileIndex.value = {}
        unref(uuidToFilePathIndex).clear()
        addEntries(entries, texts)
        followExtractors()
        console.log(`[index] ${entries.length} entries, ${texts.size} parsed in ${Date.now() - started}ms`)
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

    /** The text of the entries whose format carries properties or links, read in one call. */
    async function readTexts(entries: ScannedEntry[]) {
        const paths = entries.filter(e => !e.is_directory && isIndexedText(e.path) && !isUnreadableAsText(getFileExtensionFromPath(e.path))).map(e => e.path)
        const texts = new Map<string, string>()
        if (!paths.length) return texts
        for (const r of await vertexInvoke<FileReadResult[]>('read_text_files_batch', {paths})) {
            if (r.error || r.content === undefined) console.warn(`[index] could not read ${r.path}: ${r.error}`)
            else texts.set(r.path, r.content)
        }
        return texts
    }

    /**
     * Puts entries in the index in one synchronous pass, so what reads the index recomputes once, however many there
     * are: the nodes and the link graph, each one's properties and links from `texts`, then the links of every file
     * they touch. One at a time, each add cost a recomputation of everything derived from the whole index (about
     * 90 ms in a workspace of 13,000 files: the undo of a deleted folder of 2,000 notes took three minutes).
     *
     * `entries` are as the scan describes them (a folder with its `children`); one already indexed is left alone.
     * `uuids` gives entries back the uuids they had (the undo of a delete), unless in use. Raises no event: the
     * caller does. Returns what it added, parents first.
     */
    function addEntries(entries: ScannedEntry[], texts: ReadonlyMap<string, string>, uuids?: ReadonlyMap<string, string>) {
        const index = unref(fileIndex), uuidMap = unref(uuidToFilePathIndex), rt = runtime()
        const added: ActiveWorkspaceFileIndex[] = []
        for (const e of entries) {
            if (index[e.path]) continue
            const uuid = uuids?.get(e.path)
            const node = defaultActiveWorkspaceFileIndex({
                uuid: uuid && !uuidMap.has(uuid) ? uuid : undefined,
                fullPath: e.path,
                relativePath: relativeOf(e.path),
                fileName: e.name,
                fileExt: fileExtOf(e.name),
                isFolder: e.is_directory,
                size: e.size,
                children: e.children,
                createdTime: e.created ? new Date(e.created) : new Date(),
                modifiedTime: e.modified ? new Date(e.modified) : new Date(),
            })
            index[e.path] = node
            uuidMap.set(node.uuid, e.path)
            if (!node.isFolder) rt.graph.addFile({id: node.uuid, relativePath: node.relativePath})
            added.push(node)
        }
        // A folder that was there before lists what arrived in it (one that arrived has its `children` from the scan):
        // once a folder, not once an arrival.
        const arrived = new Set(added.map(n => n.fullPath)), into = new Map<string, string[]>()
        for (const node of added) {
            const parent = parentPathOf(node.fullPath)
            if (!arrived.has(parent) && index[parent]) (into.get(parent) ?? into.set(parent, []).get(parent)!).push(node.fullPath)
        }
        for (const [parent, paths] of into) index[parent]!.children = [...new Set([...index[parent]!.children, ...paths])].sort()
        const g = rt.graph, touched = new Set<string>()
        for (const node of added) {
            if (node.isFolder) continue
            const text = texts.get(node.fullPath)
            if (text !== undefined) {
                applyProperties(node.fullPath, text)
                g.setLinks(node.uuid, parseLinkTargets(node.fullPath, text, parsers))
            }
        }
        for (const node of added) {
            if (!node.isFolder) for (const id of [node.uuid, ...g.forelinks(node.uuid), ...g.backlinks(node.uuid), ...g.referencingFiles(node.uuid)]) touched.add(id)
        }
        syncLinks(touched)
        return added.sort((a, b) => (a.fullPath < b.fullPath ? -1 : 1))
    }

    /**
     * Indexes what's at `paths`, a folder with everything in it (hidden names skipped, as in a scan), in one pass
     * (`addEntries`), then raises a `create` for each entry. What isn't on disk, or is indexed already, is skipped.
     * `uuids`: as `addEntries`. Returns what it added, parents first.
     */
    async function addPaths(paths: string[], root: string = runtime().root, uuids?: ReadonlyMap<string, string>) {
        runtime().root = root
        const states = await describePaths([...new Set(paths)].filter(path => !unref(fileIndex)[path]))
        const describe = async (entry: ScannedEntry): Promise<ScannedEntry[]> => {
            if (!entry.is_directory) return [entry]
            const inside = await vertexInvoke<ScannedEntry[]>('scan_directory_recursive', {rootPath: entry.path}).catch((error: unknown): ScannedEntry[] => {
                console.error(`[index] could not scan ${entry.path}`, error)
                return []
            })
            inside.push({...entry, children: inside.filter(e => parentPathOf(e.path) === entry.path).map(e => e.path).sort()})
            return inside
        }
        // A path may be named twice, or be inside a folder named too: `addEntries` takes each once.
        const entries = (await Promise.all(states.flatMap(s => (s.entry ? [describe(s.entry)] : [])))).flat()
        const texts = await readTexts(entries)
        const added = addEntries(entries, texts, uuids)
        for (const node of added) broadcast({type: 'create', path: node.fullPath})
        return added
    }

    /**
     * What the disk has at each path, in one call (`describe_paths`): gone (no `entry`), or an entry without its
     * `children`, its path and name as the folder lists them (a disk that ignores case finds `Note.md` for `note.md`).
     */
    async function describePaths(paths: string[]) {
        if (!paths.length) return []
        const states = await vertexInvoke<{ path: string, entry?: ScannedEntry | null }[]>('describe_paths', {paths})
        return states.map(({path, entry}) => ({path, entry: entry ? {...entry, path: `${parentPathOf(path)}/${entry.name}`} : undefined}))
    }

    /** Indexes the item at `path` (`addPaths`); the entry, also when it was there already, or `null` when nothing is. */
    async function addFileToIndex(path: string, root: string = runtime().root) {
        if (!unref(fileIndex)[path]) await addPaths([path], root)
        return unref(fileIndex)[path] ?? null
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
     *
     * One synchronous pass, so what reads the index recomputes once, however much a folder holds. It awaited a path
     * join (an IPC call) per child, and the page recomputed between children: 75 ms each in a workspace of 13,000
     * files, 2 s for a folder of 26 notes.
     */
    function moveFileInIndex(oldPath: string, newPath: string, root: string = runtime().root) {
        const index = fileIndex.value
        if (!index[oldPath] || oldPath === newPath) return
        runtime().root = root
        runtime().selfWrites.mark(oldPath, newPath)

        const moved: string[] = []
        const relocate = (from: string, to: string) => {
            const node = index[from]
            if (!node) return
            const fileName = to.slice(to.lastIndexOf('/') + 1)
            // Its times stay: a rename doesn't modify a file.
            const next = {...node, fullPath: to, relativePath: relativeOf(to), fileName, fileExt: fileExtOf(fileName)}
            if (node.isFolder) {
                next.children = []
                for (const child of node.children) {
                    const childTo = `${to}/${child.slice(child.lastIndexOf('/') + 1)}`
                    relocate(child, childTo)
                    next.children.push(childTo)
                }
            } else moved.push(node.uuid)
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Vue 3 proxies deleteProperty on the reactive index
            delete index[from]
            index[to] = next
            unref(uuidToFilePathIndex).set(node.uuid, to)
        }
        relocate(oldPath, newPath)
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
                moveFileInIndex(oldPath, newPath)
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
                if (actual && actual.name !== node.fileName) moveFileInIndex(path, `${parentPathOf(path)}/${actual.name}`)
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
        addPaths,
        describePaths,
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
