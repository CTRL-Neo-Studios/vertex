import type {ComarkPlugin, ElementNode, Node} from "comark";
import {visit} from "@comark/nuxt/utils";

/** Comark parses `[[X]]` as a span in a span; returns `X` for that shape. Code never gets there: its text isn't parsed. */
function wikiText(n: Node): string | undefined {
    if (!Array.isArray(n) || n[0] !== 'span' || n.length !== 3) return
    const inner = n[2]
    return Array.isArray(inner) && inner[0] === 'span' && inner.length === 3 && typeof inner[2] === 'string' ? inner[2] : undefined
}

/** `[[Target]]` / `[[Target|Alias]]` → `a` with a `note` prop (ChatLink opens the note). */
export const wikiLinks: ComarkPlugin = {
    name: 'wikilinks',
    post(state) {
        visit(state.tree, n => wikiText(n) !== undefined, n => {
            const [note = '', alias] = (wikiText(n) ?? '').split('|')
            return ['a', {note: note.trim()}, (alias ?? note).trim()]
        })
    },
}

/** Obsidian's callout types (and aliases) → a Nuxt UI color and an icon like Obsidian's. Unknown types look like `note`. */
const CALLOUTS: Record<string, { color: string, icon: string }> = {
    note: {color: 'info', icon: 'i-lucide-pencil'},
    abstract: {color: 'info', icon: 'i-lucide-clipboard-list'},
    info: {color: 'info', icon: 'i-lucide-info'},
    todo: {color: 'info', icon: 'i-lucide-circle-check'},
    tip: {color: 'success', icon: 'i-lucide-flame'},
    success: {color: 'success', icon: 'i-lucide-check'},
    question: {color: 'warning', icon: 'i-lucide-circle-help'},
    warning: {color: 'warning', icon: 'i-lucide-triangle-alert'},
    failure: {color: 'error', icon: 'i-lucide-x'},
    danger: {color: 'error', icon: 'i-lucide-zap'},
    bug: {color: 'error', icon: 'i-lucide-bug'},
    example: {color: 'secondary', icon: 'i-lucide-list'},
    quote: {color: 'neutral', icon: 'i-lucide-quote'},
}
const ALIASES: Record<string, string> = {
    summary: 'abstract', tldr: 'abstract', hint: 'tip', important: 'tip', check: 'success', done: 'success',
    help: 'question', faq: 'question', caution: 'warning', attention: 'warning', fail: 'failure', missing: 'failure',
    error: 'danger', cite: 'quote',
}

/** `[!type]` parses as a span holding `!type`; returns `type`. */
function calloutType(n: Node | undefined): string | undefined {
    if (!Array.isArray(n) || n[0] !== 'span' || n.length !== 3 || typeof n[2] !== 'string' || !n[2].startsWith('!')) return
    return n[2].slice(1).toLowerCase() || undefined
}

/** The element holding the `[!type]` marker: the blockquote itself (one auto-unwrapped paragraph) or its first `p`. */
function markerHolder(quote: ElementNode): ElementNode | undefined {
    if (calloutType(quote[2]) !== undefined) return quote
    const first = quote[2]
    return Array.isArray(first) && first[0] === 'p' && calloutType(first[2]) !== undefined ? first : undefined
}

/** Splits inline nodes at the first line break: the title line (formatting kept), then the rest of the paragraph. */
function splitLine(nodes: Node[]): { line: Node[], rest: Node[] } {
    const i = nodes.findIndex(n => typeof n === 'string' && n.includes('\n'))
    if (i < 0) return {line: nodes, rest: []}
    const text = nodes[i] as string
    const cut = text.indexOf('\n')
    const after = text.slice(cut + 1)
    return {line: [...nodes.slice(0, i), text.slice(0, cut)], rest: [...(after ? [after] : []), ...nodes.slice(i + 1)]}
}

/** Trims the line's outer whitespace and drops the strings left empty. */
function trimLine(nodes: Node[]): Node[] {
    const out = nodes.map((n, i) => typeof n !== 'string' ? n : i === 0 && i === nodes.length - 1 ? n.trim() : i === 0 ? n.trimStart() : i === nodes.length - 1 ? n.trimEnd() : n)
    return out.filter(n => n !== '')
}

/** A native `<details>` so the title line is the toggle, as in Obsidian; ChatMarkdown maps `icon` to UIcon. */
const SUMMARY = 'cursor-pointer list-none [&::-webkit-details-marker]:hidden'

/**
 * `> [!type] Title` blockquotes → `callout` (Nuxt UI's ProseCallout) with a bold title line, Obsidian-style: the title
 * keeps its inline formatting and defaults to the type; `-` folds the body (closed), `+` too (open). Named `alert` so it
 * replaces Comark's default GitHub-alert plugin, which knows five types and drops the title line.
 * The title is a bare `strong` and body paragraphs get `my-1`: ProseCallout lays its slot out inline after the icon
 * (MDC unwraps the paragraph there, Comark doesn't), and a ProseP's `my-5` would space it like a page.
 */
export const callouts: ComarkPlugin = {
    name: 'alert',
    post(state) {
        visit(state.tree, n => Array.isArray(n) && n[0] === 'blockquote' && markerHolder(n as ElementNode) !== undefined, n => {
            const quote = n as ElementNode
            const holder = markerHolder(quote)!
            const type = calloutType(holder[2])!
            const style = CALLOUTS[ALIASES[type] ?? type] ?? CALLOUTS.note!
            const inline = holder.slice(3) as Node[]
            const fold = typeof inline[0] === 'string' ? /^[-+]/.exec(inline[0])?.[0] : undefined
            if (fold) inline[0] = (inline[0] as string).slice(1)
            const {line, rest} = splitLine(inline)
            const trimmed = trimLine(line)
            const title = trimmed.length ? trimmed : [type[0]!.toUpperCase() + type.slice(1)]
            const tight = (n: Node): Node => Array.isArray(n) && n[0] === 'p' ? ['p', {...n[1], class: 'my-1'}, ...n.slice(2) as Node[]] : n
            const paragraph: Node[] = rest.length ? [['p', {...(holder === quote ? {} : holder[1]), class: 'my-1'}, ...rest]] : []
            const body = [...paragraph, ...(holder === quote ? [] : (quote.slice(3) as Node[]).map(tight))]
            if (!fold) return ['callout', {color: style.color, icon: style.icon}, ['strong', {}, ...title], ...body]
            return ['callout', {color: style.color}, ['details', {...(fold === '+' && {open: true}), class: 'group/fold'},
                ['summary', {class: SUMMARY},
                    ['icon', {name: style.icon, class: 'size-4 shrink-0 align-sub me-2'}],
                    ['strong', {}, ...title],
                    ['icon', {name: 'i-lucide-chevron-right', class: 'size-4 ms-1 align-sub transition-transform group-open/fold:rotate-90'}],
                ],
                ...body,
            ]]
        })
    },
}
