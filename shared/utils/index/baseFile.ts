import type {BaseFile} from "@type32/obsidian-bases-parser";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";

const pad = (n: number, size = 2) => String(n).padStart(size, '0')

/**
 * Frontmatter as Obsidian has it, where dates stay text: the index's YAML reader turns `2026-11-20` and
 * `2026-10-01T10:30:00` into Dates, read back here as written (`2026-10-01T10:30` never was one).
 * ponytail: a Date doesn't remember its text, so `…T00:00:00` reads as a date and `…Z`/`+02:00` as local time;
 * read frontmatter with js-yaml's CORE_SCHEMA for Bases if those show up.
 */
function asWritten(value: unknown): unknown {
    if (value instanceof Date) {
        const day = `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
        if (value.getTime() % 86_400_000 === 0) return day
        const ms = value.getUTCMilliseconds()
        return `${day}T${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}${ms ? `.${pad(ms, 3)}` : ''}`
    }
    if (Array.isArray(value)) return value.map(asWritten)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, asWritten(v)]))
    return value
}

/** An index entry as Bases reads it, under its workspace-relative path (Obsidian's `file.path`). */
export function baseFile(node: ActiveWorkspaceFileIndex): BaseFile {
    const {tags, links, embeds} = node.meta
    return {
        path: node.relativePath,
        ctime: node.createdTime.getTime(),
        mtime: node.modifiedTime.getTime(),
        size: node.size,
        frontmatter: asWritten(node.properties) as Record<string, unknown>,
        tags,
        links: [...links, ...embeds],
        embeds,
    }
}
