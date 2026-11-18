import {parse} from '@vue/compiler-sfc'

/**
 * One thing Settings search finds in a page's template: a section, or a row in one. Texts are i18n keys, or the text
 * itself where the template has it plain (`title="Vertex"`). `kernel`: one of Vertex's own pages, always listed; a
 * plugin's page is listed while the plugin registers it.
 */
export interface SettingsIndexEntry {
    page: string
    /** The page's title. */
    title: string
    section?: string
    label: string
    description?: string
    /** What its info button says: searched, not shown. */
    info?: string
    kernel: boolean
}

/** A file's index, and the rows and sections it can't read (`file:line`), which fail the build. */
export interface FileIndex {
    entries: SettingsIndexEntry[]
    unreadable: string[]
}

/** In a page component that isn't a file route (a plugin's): the route it's drawn at, or `off`. */
export const ROUTE_COMMENT = /<!--\s*settings-index:\s*(\S+)\s*-->/
/** On a row or section that's drawn from data (a plugin's schema, a token per host): not indexed. */
export const OPT_OUT = 'data-no-index'

interface Prop {
    type: number
    name: string
    value?: { content: string }
    arg?: { content: string }
    exp?: { content: string }
}
interface Node {
    type: number
    tag?: string
    props?: Prop[]
    children?: Node[]
    loc: { start: { line: number } }
}
const ELEMENT = 1
const ATTRIBUTE = 6

/** `const NAME = ['a', 'b'] as const` in the script: what a `v-for` over it gives. */
function constArray(script: string, name: string): string[] | undefined {
    const found = new RegExp(`\\bconst\\s+${name}\\s*(?::[^=]+)?=\\s*\\[([^\\]]*)\\]`).exec(script)
    return found ? [...found[1]!.matchAll(/'([^']*)'|"([^"]*)"/g)].map(m => m[1] ?? m[2]!) : undefined
}

/**
 * What a prop says, as the keys it can be: `"Vertex"`; `:x="t('key')"` (or `$t`, with params); in a `v-for="v in
 * CONST"`, `` :x="t(`a.${v}`)" ``, one per value. `undefined`: it can't be read.
 */
function readProp(node: Node, name: string, loops: Map<string, string[]>): string[] | undefined | null {
    const prop = node.props?.find(p => (p.type === ATTRIBUTE ? p.name === name : p.name === 'bind' && p.arg?.content === name))
    if (!prop) return null
    if (prop.type === ATTRIBUTE) return [prop.value?.content ?? '']
    const exp = prop.exp?.content.trim() ?? ''
    const key = /^\$?t\(\s*'([^']+)'\s*(?:,[\s\S]*)?\)$/.exec(exp)
    if (key) return [key[1]!]
    const template = /^\$?t\(\s*`([^`$]*)\$\{(\w+)\}([^`$]*)`\s*(?:,[\s\S]*)?\)$/.exec(exp)
    const values = template && loops.get(template[2]!)
    return values ? values.map(v => `${template[1]}${v}${template[3]}`) : undefined
}

/** The sections and rows of one page component's template (Settings Plan, U7). */
export function indexFile(source: string, at: string, page: string, kernel: boolean): FileIndex {
    const {descriptor} = parse(source)
    const script = `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`
    const entries: SettingsIndexEntry[] = []
    const unreadable: string[] = []
    let title = ''

    /** A section's or row's description and info, the `i`th of a `v-for`'s. */
    const more = (node: Node, loops: Map<string, string[]>, i: number) => {
        const [descriptions, infos] = [readProp(node, 'description', loops), readProp(node, 'info', loops)]
        const description = descriptions?.[i] ?? descriptions?.[0]
        const info = infos?.[i] ?? infos?.[0]
        return {...(description && {description}), ...(info && {info})}
    }
    const walk = (node: Node, section: string[] | undefined, loops: Map<string, string[]>) => {
        let inner = loops
        const loop = node.props?.find(p => p.name === 'for')?.exp?.content
        const over = loop && /^\s*\(?(\w+)(?:\s*,\s*\w+)?\)?\s+(?:in|of)\s+(\w+)\s*$/.exec(loop)
        const values = over && constArray(script, over[2]!)
        if (over && values) inner = new Map([...loops, [over[1]!, values]])
        const optedOut = node.props?.some(p => p.name === OPT_OUT)
        let childSection = section
        if (node.tag === 'SettingsScrollLayout' && !title) title = readProp(node, 'title', inner)?.[0] ?? ''
        if (node.tag === 'SettingsSection' && !optedOut) {
            const titles = readProp(node, 'title', inner)
            if (!titles) unreadable.push(`${at}:${node.loc.start.line} (a section's title)`)
            else {
                childSection = titles
                for (const t of titles) entries.push({page, title, label: t, ...more(node, inner, 0), kernel})
            }
        }
        if (node.tag === 'SettingsRow' && !optedOut) {
            const labels = readProp(node, 'label', inner)
            if (labels === undefined) unreadable.push(`${at}:${node.loc.start.line} (a row's label)`)
            // A row without a label (a notice, a list's own row) has nothing to find.
            else if (labels) {
                labels.forEach((label, i) => entries.push({page, title, ...(section?.[0] && {section: section[0]}), label, ...more(node, inner, i), kernel}))
            }
        }
        for (const child of node.children ?? []) if (child.type === ELEMENT) walk(child, childSection, inner)
    }
    const ast = descriptor.template?.ast as unknown as Node | undefined
    if (ast) walk(ast, undefined, new Map())
    // The page itself, under its title.
    if (title) entries.unshift({page, title, label: title, kernel})
    return {entries: entries.map(e => ({...e, title})), unreadable}
}
