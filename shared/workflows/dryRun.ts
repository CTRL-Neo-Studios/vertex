import {parentOf, type LinkRef, type Vault, type VaultEntry, type YamlTools} from './vault'

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`)
const rebase = (path: string, from: string, to: string) => to + path.slice(from.length)

/**
 * A vault that records changes in memory over a read-only base, for dry runs: the same effect code runs
 * against it and its ops become the planned diff. Moves are kept in order, so a path maps back to the base
 * through every move before it.
 */
export function overlayVault(base: Vault, yaml: Pick<YamlTools, 'frontmatterRange' | 'parseYaml'>): Vault {
    const moves: [from: string, to: string][] = []
    /** Written contents, by current path. */
    const texts = new Map<string, string>()
    /** Entries this run created, by current path. */
    const made = new Map<string, VaultEntry>()

    /** Current path → base path, or undefined when the current path is new (nothing was moved there). */
    const toBase = (path: string): string | undefined => {
        for (let i = moves.length - 1; i >= 0; i--) {
            const [from, to] = moves[i]!
            if (under(path, to)) path = rebase(path, to, from)
            else if (under(path, from)) return undefined // moved away; the old path is free now
        }
        return path
    }
    /** Base path → current path. */
    const fromBase = (path: string): string => {
        for (const [from, to] of moves) if (under(path, from)) path = rebase(path, from, to)
        return path
    }
    const propertiesOf = (path: string, text: string): Record<string, unknown> => {
        if (!/\.md$/i.test(path)) return {}
        const range = yaml.frontmatterRange(text)
        if (!range || 'unclosed' in range) return {}
        const data = yaml.parseYaml(range.yaml).data
        return typeof data === 'object' && data !== null && !Array.isArray(data) ? data as Record<string, unknown> : {}
    }

    const sizeOf = (text: string) => new TextEncoder().encode(text).length
    const vault: Vault = {
        entry(path) {
            const fresh = made.get(path)
            const origin = fresh ? undefined : toBase(path)
            const entry: VaultEntry | undefined = fresh ?? (origin === undefined ? undefined : base.entry(origin))
            if (!entry || (!fresh && fromBase(entry.path) !== path)) return undefined
            const text = texts.get(path)
            return text === undefined ? {...entry, path} : {...entry, path, properties: propertiesOf(path, text), size: sizeOf(text)}
        },
        entries() {
            return [...base.entries().map(e => fromBase(e.path)), ...made.keys()]
                .map(path => vault.entry(path))
                .filter((e): e is VaultEntry => e !== undefined && !e.path.startsWith('.vertex/'))
        },
        // ponytail: links come from the base, so a file renamed twice in one dry run misses its second link
        // rewrite (the real run re-indexes and gets it). Track rewritten targets if that case matters.
        linksTo(path) {
            const origin = toBase(path)
            if (origin === undefined) return []
            return base.linksTo(origin).map((ref): LinkRef => ({file: fromBase(ref.file), targets: ref.targets}))
        },
        linksFrom(path) {
            const origin = made.has(path) ? undefined : toBase(path)
            return origin === undefined ? [] : base.linksFrom(origin).map(fromBase)
        },
        async read(path) {
            const text = texts.get(path)
            if (text !== undefined) return text
            const origin = toBase(path)
            if (origin === undefined) throw new Error(`"${path}" doesn't exist`)
            return base.read(origin)
        },
        async write(path, text) {
            if (!vault.entry(path)) throw new Error(`"${path}" doesn't exist`)
            texts.set(path, text)
        },
        async create(path, text) {
            await make(path, false)
            texts.set(path, text)
        },
        createFolder: path => make(path, true),
        async move(from, to) {
            if (!vault.entry(from)) throw new Error(`"${from}" doesn't exist`)
            if (from.toLowerCase() !== to.toLowerCase() && vault.entry(to)) throw new Error(`"${to}" already exists`)
            for (const map of [texts, made] as Map<string, unknown>[]) {
                for (const [path, value] of [...map]) {
                    if (!under(path, from)) continue
                    map.delete(path)
                    map.set(rebase(path, from, to), value)
                }
            }
            for (const [path, entry] of made) made.set(path, {...entry, path})
            moves.push([from, to])
        },
    }
    /** Records a new entry in an existing folder. */
    async function make(path: string, isFolder: boolean) {
        if (vault.entry(path)) throw new Error(`"${path}" already exists`)
        const parent = parentOf(path)
        if (parent && !vault.entry(parent)?.isFolder) throw new Error(`"${parent}" is not a folder`)
        const now = Date.now()
        made.set(path, {path, isFolder, properties: {}, size: 0, created: now, modified: now})
    }
    return vault
}
