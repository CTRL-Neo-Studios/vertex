/**
 * What workflow effects need from a vault, over vault-relative `/` paths. The app implements it over the
 * workspace index and Tauri fs; dry runs wrap it in an in-memory overlay; tests use a folder on disk.
 */
export interface VaultEntry {
    path: string
    isFolder: boolean
    /** Parsed frontmatter (markdown) or YAML body; `{}` when none. */
    properties: Record<string, unknown>
    /** Bytes; 0 for folders. */
    size: number
    /** Milliseconds since the epoch. */
    created: number
    modified: number
}

/** A file whose links resolve to some entry, with those links' targets as written (`[[a]]` → `a`). */
export interface LinkRef {
    file: string
    targets: string[]
}

export interface Vault {
    entry(path: string): VaultEntry | undefined
    entries(): VaultEntry[]
    linksTo(path: string): LinkRef[]
    /** The files `path`'s links resolve to, by path. */
    linksFrom(path: string): string[]
    read(path: string): Promise<string>
    write(path: string, text: string): Promise<void>
    /** Creates a file in an existing folder. Refuses an existing path. */
    create(path: string, text: string): Promise<void>
    /** Creates a folder in an existing folder. Refuses an existing path. */
    createFolder(path: string): Promise<void>
    /** Renames or moves, creating missing parent folders. Refuses to overwrite, except a case-only rename. */
    move(from: string, to: string): Promise<void>
}

/** Pure YAML helpers, injected like the index's parsers (the editor package's in the app, imported by path in tests). */
export interface YamlTools {
    frontmatterRange(markdown: string): { from: number, to: number, yaml: string } | { unclosed: true } | null
    parseYaml(text: string): { data?: unknown, error?: unknown }
    stringifyYaml(data: unknown): { yaml?: string, error?: unknown }
}

export const TRASH_DIR = '.vertex/trash'

/**
 * Checks a vault-relative path from a program. Absolute paths, drive letters, `~`, backslashes, empty, `.` and
 * `..` segments, and anything inside `.vertex/` are rejected, so a program can't reach outside the vault or into
 * its trash. `''` is the vault root. Symlinks inside the vault aren't resolved (known limit, §11).
 */
export function vaultPath(path: string): string {
    if (path === '') return ''
    if (/^([a-zA-Z]:|~|\/)/.test(path) || path.includes('\\')) throw new Error(`"${path}" is outside the vault`)
    const segments = path.split('/')
    if (segments.some(s => s === '' || s === '.' || s === '..')) throw new Error(`"${path}" is not a plain vault path`)
    if (segments[0] === '.vertex') throw new Error(`"${path}" is inside .vertex`)
    return path
}

export const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))
export const baseNameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name)
export const isNotePath = (path: string) => /\.md$/i.test(path)
export const extensionOf = (path: string) => {
    const name = baseNameOf(path)
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot + 1) : ''
}

/** `*` and `?` stay within a segment, `**` crosses them. Case-insensitive, like the file systems Vertex runs on. */
function globRegExp(glob: string): RegExp {
    const source = glob.replace(/\*\*\/?|[*?]|[.+^${}()|[\]\\]/g, s =>
        s.startsWith('**') ? (s.endsWith('/') ? '(?:.*/)?' : '.*') : s === '*' ? '[^/]*' : s === '?' ? '[^/]' : `\\${s}`)
    return new RegExp(`^${source}$`, 'i')
}

/**
 * Whether `path` matches a name or glob. With a `/`, the pattern is matched against the whole path, else against
 * the file name; without `*` or `?`, it's a name, with or without the extension.
 */
export function matchesPattern(path: string, pattern: string): boolean {
    if (!/[*?]/.test(pattern)) {
        const name = baseNameOf(path).toLowerCase()
        const want = pattern.toLowerCase()
        return pattern.includes('/') ? path.toLowerCase() === want : name === want || name.replace(/(.)\.[^.]*$/, '$1') === want
    }
    return globRegExp(pattern).test(pattern.includes('/') ? path : baseNameOf(path))
}

const normalTag = (tag: string) => tag.trim().replace(/^#/, '').toLowerCase()
const rawTags = (raw: unknown): string[] =>
    (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []).filter((t): t is string => typeof t === 'string' && t.trim() !== '')

/** Frontmatter `tags` as Obsidian reads them: a list, or a string split on commas and spaces. */
export function tagsOf(properties: Record<string, unknown>): string[] {
    return rawTags(properties.tags ?? properties.tag).map(normalTag)
}

/** `draft` matches `#draft`, `Draft` and the nested `draft/idea`. */
export function hasTag(properties: Record<string, unknown>, tag: string): boolean {
    const want = normalTag(tag)
    return want !== '' && tagsOf(properties).some(t => t === want || t.startsWith(`${want}/`))
}

/**
 * The frontmatter list with `tag` added or removed (exactly that tag, any case or `#`; nested ones stay), under
 * `tags`, or `tag` when a note uses only that; `undefined` when nothing changes.
 */
export function retag(properties: Record<string, unknown>, tag: string, add: boolean): { key: string, tags: string[] } | undefined {
    const want = normalTag(tag)
    if (!want || /[\s,]/.test(want)) throw new Error(`"${tag}" is not a tag`)
    const key = 'tag' in properties && !('tags' in properties) ? 'tag' : 'tags'
    const list = rawTags(properties[key])
    if (list.some(t => normalTag(t) === want) === add) return undefined
    return {key, tags: add ? [...list, tag.trim().replace(/^#/, '')] : list.filter(t => normalTag(t) !== want)}
}

/** Frontmatter-ready data: Dictionaries (`Map`) become objects, `undefined` becomes `null`. */
export function toYamlValue(value: unknown): unknown {
    if (value === undefined) return null
    if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), toYamlValue(v)]))
    if (Array.isArray(value)) return value.map(toYamlValue)
    return value
}

/**
 * Sets one frontmatter property, keeping the rest of the note. Adds a frontmatter block when there is none;
 * refuses an unclosed or non-object one rather than guessing. Same block layout as the editor's property form.
 */
export function setFrontmatterProperty(markdown: string, key: string, value: unknown, yaml: YamlTools): string {
    const range = yaml.frontmatterRange(markdown)
    if (range && 'unclosed' in range) throw new Error('The note\'s frontmatter is not closed')
    let data: Record<string, unknown> = {}
    if (range) {
        const parsed = yaml.parseYaml(range.yaml)
        if (parsed.error || typeof parsed.data !== 'object' || parsed.data === null || Array.isArray(parsed.data))
            throw new Error('The note\'s frontmatter is not a YAML object')
        data = parsed.data as Record<string, unknown>
    }
    const out = yaml.stringifyYaml({...data, [key]: toYamlValue(value)})
    if (out.error !== undefined || out.yaml === undefined) throw new Error(`Can't write "${key}" as YAML`)
    const block = `---\n${out.yaml}\n---`
    return range ? block + markdown.slice(range.to) : `${block}\n\n${markdown}`
}
