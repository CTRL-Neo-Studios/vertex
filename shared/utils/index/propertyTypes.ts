import type {PropertyType} from "#codemirror-rich-obsidian-editor/editor-types";
import type {PropertyKind} from "@type32/obsidian-bases-parser";

/**
 * Property types as Obsidian's `types.json` has them (checked against Obsidian 1.15.1): `{"types": {key: type}}`,
 * written with two-space indents and no final newline, with `aliases`, `cssclasses` and `tags` always listed. Types
 * use Obsidian's names (`multitext` for a list); the editor's `object` is kept as `object`.
 */
export const BUILT_IN_TYPES: Record<string, string> = {aliases: 'aliases', cssclasses: 'multitext', tags: 'tags'}

/** The types in a `types.json` text; `{}` when it isn't one. */
export function readTypes(text: string): Record<string, string> {
    try {
        const parsed: unknown = JSON.parse(text)
        const types = parsed && typeof parsed === 'object' && 'types' in parsed ? parsed.types : undefined
        if (!types || typeof types !== 'object' || Array.isArray(types)) return {}
        return Object.fromEntries(Object.entries(types).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    } catch {
        return {}
    }
}

export const writeTypes = (types: Record<string, string>) => JSON.stringify({types}, null, 2)

/** `types` with `key` set to `type` (`null`: Automatic, removed), the built-ins first as Obsidian writes them. */
export function withType(types: Record<string, string>, key: string, type: string | null): Record<string, string> {
    const all = {...BUILT_IN_TYPES, ...types}
    // A changed key keeps its place, as Obsidian's file does.
    return type === null ? Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)) : {...all, [key]: type}
}

const EDITOR_TYPES: Record<string, PropertyType> = {
    text: 'text', multitext: 'list', number: 'number', checkbox: 'checkbox', date: 'date', datetime: 'datetime',
    tags: 'tags', aliases: 'aliases', object: 'object',
}
/** A stored type as the editor's properties panel names it; Obsidian-only ones (`file`, `folder`…) are left to inference. */
export const editorType = (stored: string): PropertyType | undefined => EDITOR_TYPES[stored]
export const storedType = (type: PropertyType): string => (type === 'list' ? 'multitext' : type)

const KINDS: Record<string, PropertyKind> = {
    text: 'text', multitext: 'list', tags: 'list', aliases: 'list', number: 'number', checkbox: 'checkbox', date: 'date', datetime: 'date',
}
/** A stored type as Bases treats it (menus, cell editors); `undefined` leaves it to the values. */
export const baseKind = (stored: string | undefined): PropertyKind | undefined => (stored ? KINDS[stored] : undefined)
