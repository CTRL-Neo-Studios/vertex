/** What the properties panel offers, from the workspace's notes (checked against Obsidian 1.15.1). */
export interface PropertySuggestions {
    /** Property names: Obsidian's built-ins, then every note property as first seen. */
    keys: string[]
    /** Each key's distinct text values (list items included), alphabetical. */
    values: Map<string, string[]>
    /** Every tag, frontmatter and body, without `#`, alphabetical. */
    tags: string[]
}

/** Properties Obsidian always offers first, used or not. */
const BUILT_IN = ['aliases', 'cssclasses', 'tags']

const items = (raw: unknown): unknown[] => (Array.isArray(raw) ? raw : [raw])
const texts = (raw: unknown) => items(raw).filter((v): v is string => typeof v === 'string' && v.trim() !== '')
/** Frontmatter tags as Obsidian reads them: a list, or text split on commas and spaces. */
const tagsOf = (raw: unknown) => (typeof raw === 'string' ? raw.split(/[\s,]+/) : texts(raw)).map(t => t.trim().replace(/^#/, '')).filter(Boolean)
const alphabetical = (list: Iterable<string>) => [...list].sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}))

export function propertySuggestions(notes: Iterable<{ properties: Record<string, unknown>, tags: string[] }>): PropertySuggestions {
    const keys = new Set(BUILT_IN)
    const values = new Map<string, Set<string>>()
    const tags = new Set<string>()
    for (const note of notes) {
        for (const [key, raw] of Object.entries(note.properties)) {
            keys.add(key)
            if (key === 'tags' || key === 'tag') {
                for (const tag of tagsOf(raw)) tags.add(tag)
                continue
            }
            for (const value of texts(raw)) {
                let set = values.get(key)
                if (!set) values.set(key, set = new Set())
                set.add(value)
            }
        }
        for (const tag of note.tags) tags.add(tag.replace(/^#/, ''))
    }
    return {
        keys: [...keys],
        values: new Map([...values].map(([key, set]) => [key, alphabetical(set)])),
        tags: alphabetical(tags),
    }
}
