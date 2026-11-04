/**
 * Which workflows may run without asking (§11). Kept in app data by Rust (`trust.json`), never in a workspace, so
 * a vault can't trust its own workflows. Keys are absolute paths with `/` separators and no trailing slash.
 */
export interface TrustRecords {
    /** `nested`: subfolders too, at any depth. */
    folders: Record<string, { trustedAt: string, nested: boolean }>
    /** `hash`: `hashProgram` when it was trusted, checked when `fileTrust` is `content`. */
    files: Record<string, { trustedAt: string, hash: string }>
}

/** What a trusted file remembers: its path (edits keep it trusted), or its path and program (an edit asks again). */
export type FileTrustMode = 'path' | 'content'

export type TrustReason = { kind: 'file' } | { kind: 'folder', path: string }

const ABSOLUTE = /^(\/|[a-zA-Z]:\/)/

export const normalizeTrustPath = (path: string) => path.replace(/\\/g, '/').replace(/(?<=.)\/+$/, '')

const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0)) || '/'

/** Raw `trust.json` as records: only absolute paths with well-formed records. */
export function defaultTrustRecords(raw?: unknown): TrustRecords {
    const entries = (kind: keyof TrustRecords) => {
        const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[kind] : undefined
        return Object.entries(list && typeof list === 'object' ? list : {})
            .filter(([path, r]) => ABSOLUTE.test(normalizeTrustPath(path)) && typeof r?.trustedAt === 'string')
    }
    return {
        folders: Object.fromEntries(entries('folders').map(([path, r]) => [path, {trustedAt: r.trustedAt, nested: r.nested === true}])),
        files: Object.fromEntries(entries('files').map(([path, r]) => [path, {trustedAt: r.trustedAt, hash: typeof r.hash === 'string' ? r.hash : ''}])),
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

/**
 * Why the workflow at `path` may run without asking, or `undefined`: its file is trusted (by path, or with the
 * same program in `content` mode), its folder is, or a parent folder is with its subfolders.
 */
export function trustedBy(records: TrustRecords, path: string, hash: string, mode: FileTrustMode): TrustReason | undefined {
    const file = normalizeTrustPath(path)
    const record = records.files[file]
    if (record && (mode === 'path' || record.hash === hash)) return {kind: 'file'}
    const folder = folderTrustedBy(records, parentOf(file))
    return folder === undefined ? undefined : {kind: 'folder', path: folder}
}
