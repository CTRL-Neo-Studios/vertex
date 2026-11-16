import {toText, type PropertyKind, type Value} from "@type32/obsidian-bases-parser";

/** Whether a table cell edits in place: a note property (not `file.*` / `formula.*`) of a note (`.md`). */
export const cellEditable = (id: string, path: string) => !/^(file|formula)(\.|$)/.test(id) && path.endsWith('.md')

/** Typed or pasted text as the value a column of `kind` writes: '' empties the property. */
export function cellValue(kind: PropertyKind, text: string): unknown {
    if (text === '') return null
    switch (kind) {
        case 'number': return text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : text
        case 'checkbox': return /^(true|false)$/i.test(text) ? text.toLowerCase() === 'true' : text
        case 'list': return text.split(',').map(item => item.trim()).filter(Boolean)
        default: return text
    }
}

/** A cell's value as copied text. */
export const cellText = (value: Value) => (value.type === 'Null' ? '' : toText(value))
