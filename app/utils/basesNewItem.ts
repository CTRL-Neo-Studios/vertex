import type {FilterGroup, FilterValue, PropertyKind} from "@type32/obsidian-bases-parser";

const LIST_OPERATORS = new Set(['contains', 'containsAll', 'equals'])
const SCALAR_KINDS = new Set<PropertyKind>(['text', 'number', 'checkbox', 'date'])

// ponytail: plain YAML scalars, quoted (as JSON, which YAML reads) when they'd read as another type or as syntax;
// misses rarer cases (`0x1`, `.inf`, `<<`), use a YAML library if those show up in filter values.
const NEEDS_QUOTES = /^$|^[\s\-?:,[\]{}#&*!|>'"%@`]|\s$|:$|: | #|[\n\t]|^(true|false|yes|no|on|off|null|~)$|^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i

function scalar(value: FilterValue): string {
    if (typeof value === 'object') return JSON.stringify(`[[${value.link}]]`)
    if (typeof value !== 'string') return String(value)
    return NEEDS_QUOTES.test(value) ? JSON.stringify(value) : value
}

/**
 * The frontmatter Obsidian's "New" gives a note so the view's simple filters (top-level rules of `and` groups) match
 * it: `equals` on a scalar property sets it; `file.hasTag` and a list's `contains`/`containsAll`/`equals` list their
 * values (in `tags` for tags); other rules on note properties add the key empty, after the keys with values.
 * `isEmpty` adds nothing, as observed. Returns '' when no key comes out.
 */
export function newItemFrontmatter(groups: FilterGroup[], kindOf: (property: string) => PropertyKind): string {
    const values = new Map<string, FilterValue | FilterValue[]>()
    const empty = new Set<string>()
    const list = (key: string, items: FilterValue[]) => {
        const had = values.get(key)
        values.set(key, [...(Array.isArray(had) ? had : []), ...items])
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
            else if (item.operator === 'equals' && SCALAR_KINDS.has(kind) && item.values.length) values.set(key, item.values[0]!)
            else empty.add(key)
        }
    }
    const lines = [...values].map(([key, value]) => (Array.isArray(value)
        ? `${scalar(key)}:${value.map(v => `\n  - ${scalar(v)}`).join('')}`
        : `${scalar(key)}: ${scalar(value)}`))
    for (const key of empty) if (!values.has(key)) lines.push(`${scalar(key)}:`)
    return lines.length ? `---\n${lines.join('\n')}\n---\n` : ''
}
