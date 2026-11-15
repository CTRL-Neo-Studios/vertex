import {writeYaml, type FilterGroup, type FilterValue, type PropertyKind} from "@type32/obsidian-bases-parser";

const LIST_OPERATORS = new Set(['contains', 'containsAll', 'equals'])
const SCALAR_KINDS = new Set<PropertyKind>(['text', 'number', 'checkbox', 'date'])

const plain = (value: FilterValue) => (typeof value === 'object' ? `[[${value.link}]]` : value)

/**
 * The frontmatter Obsidian's "New" gives a note so the view's simple filters (top-level rules of `and` groups) match
 * it: `equals` on a scalar property sets it; `file.hasTag` and a list's `contains`/`containsAll`/`equals` list their
 * values (in `tags` for tags); other rules on note properties add the key empty, after the keys with values; `isEmpty`
 * adds nothing. The view's other note properties (`order`) follow as empty keys, and `set` (a kanban column's value)
 * comes last, or replaces the key's value in place when a filter gave it one. Written as Obsidian writes YAML; '' when
 * no key comes out.
 */
export function newItemFrontmatter(groups: FilterGroup[], kindOf: (property: string) => PropertyKind, extras: {
    order?: string[], set?: { key: string, value: unknown },
} = {}): string {
    const values = new Map<string, unknown>()
    const empty = new Set<string>()
    const list = (key: string, items: FilterValue[]) => {
        const had = values.get(key)
        values.set(key, [...(Array.isArray(had) ? had : []), ...items.map(plain)])
    }
    for (const group of groups) {
        if (group.conjunction !== 'and') continue
        for (const item of group.items) {
            if (!('operator' in item)) continue
            if (item.property === 'file') {
                if (item.operator === 'hasTag') list('tags', item.values.map(tag => (typeof tag === 'string' ? tag.replace(/^#/, '') : tag)))
                continue
            }
            if (/^(file|formula)\./.test(item.property) || item.operator === 'isEmpty') continue
            const key = item.property.replace(/^note\./, '')
            const kind = kindOf(key)
            if (kind === 'list' && LIST_OPERATORS.has(item.operator)) list(key, item.values)
            else if (item.operator === 'equals' && SCALAR_KINDS.has(kind) && item.values.length) values.set(key, plain(item.values[0]!))
            else empty.add(key)
        }
    }
    for (const id of extras.order ?? []) {
        if (id !== 'file' && !/^(file|formula)\./.test(id)) empty.add(id.replace(/^note\./, ''))
    }
    const {set} = extras
    if (set && values.has(set.key)) values.set(set.key, set.value)
    const data: Record<string, unknown> = Object.fromEntries(values)
    for (const key of empty) if (!(key in data) && key !== set?.key) data[key] = null
    if (set && !values.has(set.key)) data[set.key] = set.value
    return Object.keys(data).length ? `---\n${writeYaml(data)}---\n` : ''
}

/** The folder a `file.inFolder("…")` rule of the filters puts new notes in, as Obsidian does; null without one. */
export function newItemFolder(groups: FilterGroup[]): string | null {
    for (const group of groups) {
        if (group.conjunction !== 'and') continue
        for (const item of group.items) {
            if ('operator' in item && item.property === 'file' && item.operator === 'inFolder' && typeof item.values[0] === 'string') return item.values[0]
        }
    }
    return null
}
