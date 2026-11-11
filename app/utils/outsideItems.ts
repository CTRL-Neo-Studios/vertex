import {readDir, stat} from "@tauri-apps/plugin-fs";
import {join} from "@tauri-apps/api/path";

/** What a drag from the Files tree carries besides its own state: the rows' workspace-relative paths, a folder's ending in `/`. */
export const FILES_DRAG = 'application/x-vertex-files'

/**
 * Files and folders from outside the workspace, as a drop or a paste hands them over. A dropped file is read through
 * `read`; a pasted one is a path on disk (`source`), copied by path. `path` is where it is on disk when known, which
 * tells whether it's the workspace's own.
 */
export interface OutsideItem {
    name: string
    isFolder: boolean
    size: number
    modified: number
    children: () => OutsideItem[]
    read?: () => Promise<Uint8Array>
    source?: string
    path?: string
}

/** System clutter a folder drop brings along. */
const SKIPPED = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])

function fromFile(file: File): OutsideItem {
    return {name: file.name, isFolder: false, size: file.size, modified: file.lastModified, children: () => [], read: async () => new Uint8Array(await file.arrayBuffer())}
}

async function fromEntry(entry: FileSystemEntry): Promise<OutsideItem | undefined> {
    if (SKIPPED.has(entry.name)) return
    if (entry.isFile) return fromFile(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)))
    const reader = (entry as FileSystemDirectoryEntry).createReader(), entries: FileSystemEntry[] = []
    // A directory reader hands its entries over in batches until an empty one.
    for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject))
        if (!batch.length) break
        entries.push(...batch)
    }
    const children = (await Promise.all(entries.map(fromEntry))).filter(c => !!c)
    return {name: entry.name, isFolder: true, size: 0, modified: Date.now(), children: () => children}
}

/**
 * The OS files of a drop or a paste (`DataTransfer`). Call it inside the event: the transfer's items are taken before
 * its first `await`, since they're gone once the event is over. Folders are read whole.
 */
export async function outsideItems(transfer: DataTransfer): Promise<OutsideItem[]> {
    const sources = [...transfer.items].filter(i => i.kind === 'file').map(i => i.webkitGetAsEntry?.() ?? i.getAsFile())
    const paths = transfer.getData('text/uri-list').split(/\r?\n/).filter(u => u.startsWith('file:')).map(u => decodeURIComponent(new URL(u).pathname))
    const items = (await Promise.all(sources.map(s => !s ? undefined : s instanceof File ? (SKIPPED.has(s.name) ? undefined : fromFile(s)) : fromEntry(s)))).filter(i => !!i)
    for (const item of items) item.path = paths.find(p => p.endsWith(`/${item.name}`))
    return items
}

/** Items at paths on disk (a pasted file list), folders read whole. Nothing is read into the webview: copies go by path. */
export async function outsideItemsAt(paths: string[]): Promise<OutsideItem[]> {
    const at = async (path: string, name: string): Promise<OutsideItem | undefined> => {
        if (SKIPPED.has(name)) return
        const info = await stat(path), modified = info.mtime?.getTime() ?? Date.now()
        const children = info.isDirectory
            ? (await Promise.all((await readDir(path)).map(async e => at(await join(path, e.name), e.name)))).filter(c => !!c)
            : []
        return {name, isFolder: info.isDirectory, size: info.size, modified, children: () => children, source: path, path}
    }
    return (await Promise.all(paths.map(p => at(p, p.split(/[\\/]/).pop() ?? p)))).filter(i => !!i)
}

/** Image data with no file behind it (a screenshot), named as Obsidian names a pasted image: `Pasted image 20261111143012.png`. */
export function pastedImage(file: File, at = new Date()): OutsideItem {
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
    const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1] || 'png'
    return {
        name: `Pasted image ${stamp}.${ext}`, isFolder: false, size: file.size, modified: at.getTime(), children: () => [],
        read: async () => new Uint8Array(await file.arrayBuffer()),
    }
}
