import {sessionScope, StateKey} from "#shared/constants/app";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveSinglespaceFileIndex, SinglespaceIndexEvent, SinglespaceIndexListener} from "#shared/types/active/workspace";
import type {PossiblyRef} from "#shared/types/types";
import {defaultActiveSinglespaceFileIndex} from "#shared/utils/defaults/actives";
import {readTextFile, stat, type UnwatchFn, watch, type WatchEvent} from "@tauri-apps/plugin-fs";
import {getFileExtensionFromPath, isUnreadableAsText} from "#shared/utils/fs/filenames";
import {type ContentParsers, parentPathOf, parseProperties} from "#shared/utils/index/parse";
import {RecentWrites} from "#shared/utils/index/selfWrites";

interface SessionRuntime {
    unwatch?: UnwatchFn
    listeners: Set<SinglespaceIndexListener>
    selfWrites: RecentWrites
}
const runtimes = new Map<string, SessionRuntime>()

const parsers: ContentParsers = {parseYaml, parseFrontmatter, getInternalLinks}
const TEMPORARY_PREFIX = '/!temporary!/-'
const fileNameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/**
 * Index for a single-file session: one entry (plus an optional unsaved "Untitled" entry).
 * Shares parsing and the self-write guard with the workspace index; it has no link graph.
 */
export function useActiveSinglespaceIndex(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveSinglespaceIndex')
    const fileIndex = useState<Record<string, ActiveSinglespaceFileIndex>>(StateKey.singlespaceIndex(scope), () => ({}))

    function runtime(): SessionRuntime {
        let rt = runtimes.get(scope)
        if (!rt) {
            rt = {listeners: new Set(), selfWrites: new RecentWrites()}
            runtimes.set(scope, rt)
        }
        return rt
    }

    const propertiesOf = (path: string, content: string) => parseProperties(path, content, parsers).properties

    async function initializeIndex(pathRef: PossiblyRef<string>) {
        const path = unref(pathRef)
        const content = await readTextFile(path)
        const node = defaultActiveSinglespaceFileIndex({fullPath: path, fileName: fileNameOf(path), properties: propertiesOf(path, content)})
        fileIndex.value[path] = node
        return node
    }

    function setTemporaryIndex() {
        const uuid = crypto.randomUUID()
        const path = `${TEMPORARY_PREFIX}${uuid}`
        fileIndex.value[path] = defaultActiveSinglespaceFileIndex({uuid, fullPath: path, fileName: 'Untitled.md', properties: {}})
        return fileIndex.value[path]
    }

    function isIndexTemporary(uuidRef: PossiblyRef<string>) {
        return getFileByUuid(uuidRef)?.fullPath.startsWith(TEMPORARY_PREFIX) ?? false
    }

    async function convertTemporaryToValidIndex(uuidRef: PossiblyRef<string>, newPathRef: PossiblyRef<string>, contentRef: PossiblyRef<string>) {
        const uuid = unref(uuidRef)
        const path = unref(newPathRef)
        const old = getFileByUuid(uuid)
        if (!old || !isIndexTemporary(uuid)) throw new Error('The file is not temporary.')
        if (unref(fileIndex)[path]) throw new Error('A file with the same path exists. Please switch to another save path or file name.')
        fileIndex.value[path] = defaultActiveSinglespaceFileIndex({uuid, fullPath: path, fileName: fileNameOf(path), properties: propertiesOf(path, unref(contentRef))})
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Vue 3 proxies deleteProperty on the reactive index
        delete fileIndex.value[old.fullPath]
        return fileIndex.value[path]
    }

    /** Re-parse frontmatter after the content changed (in-app save or external edit). */
    async function updateIndex(path: string, content: string) {
        const node = unref(fileIndex)[path]
        if (node) node.properties = propertiesOf(path, content)
    }

    function removeFileFromIndex(path: string): ActiveSinglespaceFileIndex[] {
        const node = unref(fileIndex)[path]
        if (!node) return []
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Vue 3 proxies deleteProperty on the reactive index
        delete fileIndex.value[path]
        return [node]
    }

    async function moveFileInIndex(oldPath: string, newPath: string) {
        const node = unref(fileIndex)[oldPath]
        if (!node || oldPath === newPath) return
        runtime().selfWrites.mark(oldPath, newPath)
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- Vue 3 proxies deleteProperty on the reactive index
        delete fileIndex.value[oldPath]
        fileIndex.value[newPath] = {...node, fullPath: newPath, fileName: fileNameOf(newPath)}
    }

    function markSelfWrite(...paths: string[]) {
        runtime().selfWrites.mark(...paths)
    }

    function getFileByUuid(uuidRef: PossiblyRef<string | undefined>): ActiveSinglespaceFileIndex | null {
        const uuid = unref(uuidRef)
        return uuid ? Object.values(unref(fileIndex)).find(f => f.uuid === uuid) ?? null : null
    }

    function clearIndex() {
        fileIndex.value = {}
        runtimes.delete(scope)
    }

    function broadcast(event: SinglespaceIndexEvent) {
        for (const listener of runtime().listeners) listener(event)
    }

    async function handleWatchEvent(event: WatchEvent) {
        const type = event.type
        if (typeof type !== 'object' || type === null || 'access' in type || 'metadata' in type) return
        const rt = runtime()
        const tracked = (p: string) => !!unref(fileIndex)[p] && !rt.selfWrites.has(p)

        if ('remove' in type) {
            for (const path of event.paths.filter(tracked)) {
                const removedNodes = removeFileFromIndex(path)
                if (removedNodes.length) broadcast({type: 'remove', path, removedNodes})
            }
            return
        }
        if (!('modify' in type)) return

        if (type.modify.kind === 'rename') {
            const [oldPath, newPath] = event.paths
            if (oldPath && newPath) {
                if (!tracked(oldPath)) return
                await moveFileInIndex(oldPath, newPath)
                broadcast({type: 'rename', oldPath, newPath})
                return
            }
            // Single-path rename: the file was moved away (or deleted) from under us.
            if (oldPath && tracked(oldPath)) {
                try {
                    await stat(oldPath)
                } catch {
                    const removedNodes = removeFileFromIndex(oldPath)
                    if (removedNodes.length) broadcast({type: 'remove', path: oldPath, removedNodes})
                }
            }
            return
        }

        if (type.modify.kind === 'data' || type.modify.kind === 'any') {
            for (const path of event.paths.filter(tracked)) {
                if (isUnreadableAsText(getFileExtensionFromPath(path))) continue
                try {
                    await updateIndex(path, await readTextFile(path))
                    broadcast({type: 'modify', path})
                } catch (error) {
                    console.error(`[singlespace index] could not read ${path}`, error)
                }
            }
        }
    }

    /**
     * Watches the folder containing the file: editors that save via temp-file + rename replace the
     * inode, which a watch on the file itself would lose.
     */
    async function startWatcher(folder: string) {
        await stopWatcher()
        let queue: Promise<void> = Promise.resolve()
        runtime().unwatch = await watch(folder, (event) => {
            queue = queue.then(() => handleWatchEvent(event)).catch(e => console.error('[singlespace index] watcher event failed', e))
        }, {recursive: false, delayMs: 50})
    }

    async function stopWatcher() {
        const rt = runtimes.get(scope)
        rt?.unwatch?.()
        if (rt) rt.unwatch = undefined
    }

    function on(listener: SinglespaceIndexListener): () => void {
        const listeners = runtime().listeners
        listeners.add(listener)
        return () => listeners.delete(listener)
    }

    return {
        fileIndex,
        initializeIndex,
        updateIndex,
        removeFileFromIndex,
        getFileByUuid,
        moveFileInIndex,
        markSelfWrite,
        isIndexTemporary,
        setTemporaryIndex,
        clearIndex,
        convertTemporaryToValidIndex,
        startWatcher,
        stopWatcher,
        on,
        parentPathOf,
    }
}
