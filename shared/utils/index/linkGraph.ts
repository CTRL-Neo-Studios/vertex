/**
 * Incremental wiki-link graph for a workspace.
 *
 * Files are registered under three lookup keys (basename without extension, relative path without
 * extension, relative path). A link target resolves to the first file registered for that key, which
 * matches the original full-rebuild behaviour (scan order wins).
 *
 * Every file keeps its *raw* link targets, so a link whose target disappears (rename, delete) is not
 * forgotten: it becomes unresolved and re-resolves automatically when a matching file appears again.
 * Updates touch only the files that reference a changed key — never the whole vault.
 */

export interface LinkGraphFile {
    id: string
    /** Path relative to the workspace root, using `/`. */
    relativePath: string
}

export function linkKeys(relativePath: string): string[] {
    const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1)
    const dot = fileName.lastIndexOf('.')
    const baseName = dot > 0 ? fileName.slice(0, dot) : fileName
    const relDot = relativePath.lastIndexOf('.')
    const relNoExt = dot > 0 ? relativePath.slice(0, relDot) : relativePath
    return [...new Set([baseName, relNoExt, relativePath])]
}

export class LinkGraph {
    /** key → ids registered under it, in registration order; [0] is the owner. */
    private keyOwners = new Map<string, string[]>()
    /** id → keys it is registered under. */
    private fileKeys = new Map<string, string[]>()
    /** id → raw link targets as written in the file. */
    private rawLinks = new Map<string, string[]>()
    /** key → ids whose raw links mention it (resolved or not). */
    private referrers = new Map<string, Set<string>>()
    private forward = new Map<string, Set<string>>()
    private backward = new Map<string, Set<string>>()

    /** Register a linkable file (no-op if already present under the same path). */
    addFile(file: LinkGraphFile) {
        if (this.fileKeys.has(file.id)) this.removeFile(file.id)
        const keys = linkKeys(file.relativePath)
        this.fileKeys.set(file.id, keys)
        const changed: string[] = []
        for (const key of keys) {
            const owners = this.keyOwners.get(key) ?? []
            owners.push(file.id)
            this.keyOwners.set(key, owners)
            if (owners.length === 1) changed.push(key)
        }
        this.reresolveReferrersOf(changed)
    }

    /** Unregister a file: drops its outgoing links and frees its keys for the next owner. */
    removeFile(id: string) {
        this.setLinks(id, [])
        this.rawLinks.delete(id)
        const keys = this.fileKeys.get(id) ?? []
        this.fileKeys.delete(id)
        const changed: string[] = []
        for (const key of keys) {
            const owners = this.keyOwners.get(key)
            if (!owners) continue
            const wasOwner = owners[0] === id
            const remaining = owners.filter(o => o !== id)
            if (remaining.length) this.keyOwners.set(key, remaining)
            else this.keyOwners.delete(key)
            if (wasOwner) changed.push(key)
        }
        // Re-resolving referrers drops their edges to `id`; their raw targets stay, so they reconnect
        // if a file with that name comes back.
        this.reresolveReferrersOf(changed)
        this.backward.delete(id)
    }

    /** A file moved or was renamed; its id (and therefore its own outgoing links) is unchanged. */
    moveFile(id: string, newRelativePath: string) {
        const raw = this.rawLinks.get(id) ?? []
        this.removeFile(id)
        this.addFile({id, relativePath: newRelativePath})
        this.setLinks(id, raw)
    }

    /** Replace a file's outgoing raw link targets (e.g. after its content changed). */
    setLinks(id: string, targets: string[]) {
        for (const key of new Set(this.rawLinks.get(id) ?? [])) this.referrers.get(key)?.delete(id)
        const unique = [...new Set(targets)]
        this.rawLinks.set(id, unique)
        for (const key of unique) {
            const set = this.referrers.get(key) ?? new Set<string>()
            set.add(id)
            this.referrers.set(key, set)
        }
        this.resolve(id)
    }

    resolveTarget(target: string): string | undefined {
        return this.keyOwners.get(target)?.[0]
    }

    forelinks(id: string): string[] {
        return [...(this.forward.get(id) ?? [])]
    }

    backlinks(id: string): string[] {
        return [...(this.backward.get(id) ?? [])]
    }

    /** Ids of files whose raw links point at any of this file's keys — i.e. what a rename would affect. */
    referencingFiles(id: string): string[] {
        const out = new Set<string>()
        for (const key of this.fileKeys.get(id) ?? [])
            for (const from of this.referrers.get(key) ?? []) if (from !== id) out.add(from)
        return [...out]
    }

    /** Raw targets in `fromId` that currently resolve to `toId`. */
    targetsPointingAt(fromId: string, toId: string): string[] {
        return (this.rawLinks.get(fromId) ?? []).filter(t => this.resolveTarget(t) === toId)
    }

    private resolve(id: string) {
        const next = new Set<string>()
        for (const target of this.rawLinks.get(id) ?? []) {
            const to = this.resolveTarget(target)
            if (to && to !== id) next.add(to)
        }
        const prev = this.forward.get(id) ?? new Set<string>()
        for (const to of prev) if (!next.has(to)) this.backward.get(to)?.delete(id)
        for (const to of next) {
            const set = this.backward.get(to) ?? new Set<string>()
            set.add(id)
            this.backward.set(to, set)
        }
        this.forward.set(id, next)
    }

    private reresolveReferrersOf(keys: string[]) {
        const affected = new Set<string>()
        for (const key of keys) for (const id of this.referrers.get(key) ?? []) affected.add(id)
        for (const id of affected) this.resolve(id)
    }
}
