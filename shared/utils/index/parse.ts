import type {YamlFormData} from "@type32/yaml-editor-form";
import type {FileLink} from "@type32/obsidian-bases-parser";
import {getFileExtensionFromPath, isCanvasFile, isPlainTextFile, isYamlFile} from "#shared/utils/fs/filenames";
import {canvasLinkTargets} from "#shared/utils/index/canvasLinks";
import {scanLinks} from "#shared/utils/index/rewriteLinks";

/** Parsers injected by the caller (the editor package's auto-imported utils in the app; stubs in tests). */
export interface ContentParsers {
    parseYaml: (text: string) => { data?: unknown, error?: unknown }
    parseFrontmatter: (text: string) => { data?: unknown, error?: unknown }
    getInternalLinks: (text: string) => { path: string }[]
}

export const PROPERTIES_FILE_NAMES = ['properties.yml', 'properties.yaml'] as const

export function isPropertiesFile(fileName: string) {
    return (PROPERTIES_FILE_NAMES as readonly string[]).includes(fileName)
}

/** Folder part of a `/`-separated path; `''` for a bare name. */
export function parentPathOf(path: string) {
    return path.slice(0, Math.max(path.lastIndexOf('/'), 0))
}

/**
 * Properties of a file: YAML body for .yml/.yaml, frontmatter for md/txt, nothing otherwise.
 * Parse errors are reported via `error` instead of silently becoming `{}`.
 */
export function parseProperties(path: string, content: string, parsers: ContentParsers): { properties: YamlFormData, error?: unknown } {
    const ext = getFileExtensionFromPath(path)
    const parse = isYamlFile(ext) ? parsers.parseYaml : isPlainTextFile(ext) ? parsers.parseFrontmatter : undefined
    // An empty note has no properties (the frontmatter parser throws "No markdown text provided" on it).
    if (!parse || !content.trim()) return {properties: {}}
    try {
        const result = parse(content)
        return {properties: (result.data ?? {}) as YamlFormData, error: result.error}
    } catch (error) {
        return {properties: {}, error}
    }
}

/** Raw link targets in a document: `[[target]]`s in md/txt, file cards and text cards' links in a canvas. */
export function parseLinkTargets(path: string, content: string, parsers: ContentParsers): string[] {
    const ext = getFileExtensionFromPath(path)
    if (isCanvasFile(ext)) return canvasLinkTargets(content, parsers.getInternalLinks)
    if (!isPlainTextFile(ext)) return []
    return parsers.getInternalLinks(content).map(l => l.path)
}

/** What Bases reads from a note besides its properties (`file.tags`, `file.links`, `file.embeds`). */
export interface NoteMeta {
    /** Body `#tags`, with `#`, in order. Frontmatter `tags` stay in the properties. */
    tags: string[]
    /** Frontmatter links (whole values like `"[[C]]"`), then body wiki and markdown links, in order. */
    links: FileLink[]
    embeds: FileLink[]
}

// Obsidian's tag characters (the editor's hashtag grammar): no punctuation but `-`, `_` and `/`.
const TAG = /(?<=^|\s)#([^\u2000-\u206F\u2E00-\u2E7F'!"#$%&()*+,.:;<=>?@^`{|}~[\]\\\s]+)/g
const MARKDOWN_LINK = /(!?)\[([^\]\n]*)\]\((?:<([^>\n]+)>|([^)\s]+))(?:\s+"[^"\n]*")?\)/g
const FRONTMATTER = /^---\r?\n(?:[\s\S]*?\r?\n)?---(?=\r?\n|$)/
// Fenced code, code spans and HTML comments: no tags or links in them (`%% comments %%` keep theirs).
const NOT_TEXT = /^ {0,3}(`{3,}|~{3,})[^\n]*(?:\n[\s\S]*?\n {0,3}\1[^\n]*|[\s\S]*)|`[^`\n]+`|<!--[\s\S]*?-->/gm
const blank = (s: string) => s.replace(/[^\n]/g, ' ')

function wikiLink(path: string, subpath: string | undefined, display: string | undefined): FileLink {
    return {link: subpath ? `${path}#${subpath}` : path, display: display || (subpath ? `${path} > ${subpath}` : path)}
}

/** A note's tags, links and embeds as Obsidian's metadata cache has them (checked against Obsidian 1.15.1). */
export function parseNoteMeta(content: string, properties: YamlFormData): NoteMeta {
    const links: FileLink[] = [], embeds: FileLink[] = []
    for (const value of Object.values(properties).flat()) {
        const m = typeof value === 'string' && /^\[\[([^\]]+)\]\]$/.exec(value.trim())
        if (!m) continue
        scanLinks(m[0], l => void links.push(wikiLink(l.pathPart.trim(), l.subpath, l.display)))
    }
    // Same offsets as `content`, so body links sort by position.
    const body = content.replace(FRONTMATTER, blank).replace(NOT_TEXT, blank)
    const found: {at: number, embed: boolean, link: FileLink}[] = []
    scanLinks(body, (l) => {
        const path = l.pathPart.trim()
        if (path) found.push({at: l.pathStart, embed: l.embed, link: wikiLink(path, l.subpath, l.display)})
    })
    for (const m of body.matchAll(MARKDOWN_LINK)) {
        const target = m[3] ?? m[4]!
        if (/^[a-z][\w+.-]*:/i.test(target) || target.startsWith('#')) continue
        let link = target
        try {
            link = decodeURI(target)
        } catch { /* kept as written */ }
        found.push({at: m.index, embed: m[1] === '!', link: {link, display: m[2]!}})
    }
    for (const f of found.sort((a, b) => a.at - b.at)) (f.embed ? embeds : links).push(f.link)
    const tags = [...body.matchAll(TAG)].filter(m => /\D/.test(m[1]!)).map(m => `#${m[1]}`)
    return {tags, links, embeds}
}
