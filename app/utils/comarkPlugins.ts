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

/**
 * `> [!type] Title` blockquotes → `callout` (Nuxt UI's ProseCallout) with a bold title line, Obsidian-style: the title
 * defaults to the type, the fold marker (`-`/`+`) is accepted but not collapsible. Named `alert` so it replaces Comark's
 * default GitHub-alert plugin, which knows five types and drops the title line.
 * The title is a bare `strong` and body paragraphs get `my-1`: ProseCallout lays its slot out inline after the icon
 * (MDC unwraps the paragraph there, Comark doesn't), and a ProseP's `my-5` would space it like a page.
 * ponytail: the title is the plain text up to the line break; inline formatting in a title ends up in the body.
 */
export const callouts: ComarkPlugin = {
    name: 'alert',
    post(state) {
        visit(state.tree, n => Array.isArray(n) && n[0] === 'blockquote' && markerHolder(n as ElementNode) !== undefined, n => {
            const quote = n as ElementNode
            const holder = markerHolder(quote)!
            const type = calloutType(holder[2])!
            const style = CALLOUTS[ALIASES[type] ?? type] ?? CALLOUTS.note!
            const after = typeof holder[3] === 'string' ? holder[3].replace(/^[-+]/, '') : ''
            const lineEnd = after.indexOf('\n')
            const title = (lineEnd < 0 ? after : after.slice(0, lineEnd)).trim() || type[0]!.toUpperCase() + type.slice(1)
            const rest = lineEnd < 0 ? '' : after.slice(lineEnd + 1)
            const body: Node[] = [...(rest ? [rest] : []), ...holder.slice(typeof holder[3] === 'string' ? 4 : 3) as Node[]]
            const tight = (n: Node): Node => Array.isArray(n) && n[0] === 'p' ? ['p', {...n[1], class: 'my-1'}, ...n.slice(2) as Node[]] : n
            const paragraph: Node[] = body.length ? [['p', {...(holder === quote ? {} : holder[1]), class: 'my-1'}, ...body]] : []
            const others = holder === quote ? [] : (quote.slice(3) as Node[]).map(tight)
            return ['callout', {color: style.color, icon: style.icon}, ['strong', {}, title], ...paragraph, ...others]
        })
    },
}
