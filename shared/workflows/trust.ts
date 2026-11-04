/**
 * Which workflows may run without asking (§11). Kept in app data by Rust (`trust.json`), never in a workspace, so
 * a vault can't trust its own workflows. Keys are absolute paths with `/` separators and no trailing slash.
 */
export interface TrustRecords {
    /**
     * `nested`: subfolders too, at any depth. `files`: file → `hashProgram` of each workflow the folder covered
     * when it was trusted, or got in Vertex since; checked when `fileTrust` is `content`.
     */
    folders: Record<string, { trustedAt: string, nested: boolean, files: Record<string, string> }>
    /** `hash`: `hashProgram` when it was trusted, checked when `fileTrust` is `content`. */
    files: Record<string, { trustedAt: string, hash: string }>
}

/** What trust remembers: paths only (edits anywhere keep it), or paths and programs (an outside edit asks again). */
export type FileTrustMode = 'path' | 'content'

export type TrustReason = { kind: 'file' } | { kind: 'folder', path: string }

const ABSOLUTE = /^(\/|[a-zA-Z]:\/)/

export const normalizeTrustPath = (path: string) => path.replace(/\\/g, '/').replace(/(?<=.)\/+$/, '')

const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/'

/** Raw `trust.json` as records: only absolute paths with well-formed records. */
export function defaultTrustRecords(raw?: unknown): TrustRecords {
    const entries = (list: unknown) => Object.entries(list && typeof list === 'object' ? list : {})
        .filter(([path]) => ABSOLUTE.test(normalizeTrustPath(path)))
    const records = (kind: keyof TrustRecords) => entries(raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[kind] : undefined)
        .filter(([, r]) => typeof r?.trustedAt === 'string')
    return {
        folders: Object.fromEntries(records('folders').map(([path, r]) => [path, {
            trustedAt: r.trustedAt,
            nested: r.nested === true,
            files: Object.fromEntries(entries(r.files).filter(([, hash]) => typeof hash === 'string')),
        }])),
        files: Object.fromEntries(records('files').map(([path, r]) => [path, {trustedAt: r.trustedAt, hash: typeof r.hash === 'string' ? r.hash : ''}])),
    }
}

/**
 * The trusted folder that covers files directly in `folder`: `folder` itself, or a parent with its subfolders.
 * A workspace is trusted when this finds its root (that also turns on the workspace's custom CSS).
 */
export function folderTrustedBy(records: TrustRecords, folder: string): string | undefined {
    const own = normalizeTrustPath(folder)
    for (let at = own; ; at = parentOf(at)) {
        const trusted = records.folders[at]
        if (trusted && (at === own || trusted.nested)) return at
        if (at === parentOf(at)) return undefined
    }
}

/** The trusted folder covering the file at `path`, if any. */
export const coveringFolder = (records: TrustRecords, path: string) => folderTrustedBy(records, parentOf(normalizeTrustPath(path)))

/**
 * Why the workflow at `path` may run without asking, or `undefined`: its file is trusted, or its folder is (or a
 * parent folder with its subfolders). In `content` mode either one also has to hold this program: the file's
 * record, or the folder's pin for it.
 */
export function trustedBy(records: TrustRecords, path: string, hash: string, mode: FileTrustMode): TrustReason | undefined {
    const file = normalizeTrustPath(path)
    const record = records.files[file]
    if (record && (mode === 'path' || record.hash === hash)) return {kind: 'file'}
    const folder = coveringFolder(records, file)
    if (folder === undefined || (mode === 'content' && records.folders[folder]!.files[file] !== hash)) return undefined
    return {kind: 'folder', path: folder}
}
