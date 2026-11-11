/**
 * Files and folders from outside the workspace, as a drop or a paste hands them over. `read` gives a file's bytes;
 * `path` is its place on disk when the webview tells (a `text/uri-list` with `file:` URLs).
 */
export interface OutsideItem {
    name: string
    isFolder: boolean
    size: number
    modified: number
    children: () => OutsideItem[]
    read?: () => Promise<Uint8Array>
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
