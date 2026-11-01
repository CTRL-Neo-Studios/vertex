/**
 * What workflow effects need from a vault, over vault-relative `/` paths. The app implements it over the
 * workspace index and Tauri fs; dry runs wrap it in an in-memory overlay; tests use a folder on disk.
 */
export interface VaultEntry {
    path: string
    isFolder: boolean
    /** Parsed frontmatter (markdown) or YAML body; `{}` when none. */
    properties: Record<string, unknown>
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
    read(path: string): Promise<string>
    write(path: string, text: string): Promise<void>
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

const normalTag = (tag: string) => tag.trim().replace(/^#/, '').toLowerCase()

/** Frontmatter `tags` as Obsidian reads them: a list, or a string split on commas and spaces. */
export function tagsOf(properties: Record<string, unknown>): string[] {
    const raw = properties.tags ?? properties.tag
    const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : []
    return list.filter((t): t is string => typeof t === 'string' && t.trim() !== '').map(normalTag)
}

/** `draft` matches `#draft`, `Draft` and the nested `draft/idea`. */
export function hasTag(properties: Record<string, unknown>, tag: string): boolean {
    const want = normalTag(tag)
    return want !== '' && tagsOf(properties).some(t => t === want || t.startsWith(`${want}/`))
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
