import {INCOMPLETE_IMAGE_PLACEHOLDER, type ComarkPlugin, type ElementNode, type Node} from "comark";
import {visit} from "@comark/vue/utils";
import {ofm} from "@type32/codemirror-rich-obsidian-editor/comark";

/**
 * A reply has no frontmatter of its own: a leading `---` block is a note's, quoted. Comark's default `frontmatter`
 * plugin would parse it as YAML, hiding it and throwing on a half-streamed key; this one, by the same name, shows it
 * as a ```yaml block instead. Swapping the delimiters line for line keeps streaming's line offsets right, and keeping the
 * name keeps Comark's streaming auto-close, which ends a still-open block with `---` before this runs.
 */
export const frontmatterAsCode: ComarkPlugin = {
    name: 'frontmatter',
    pre(state) {
        // A later streamed chunk (`parsedLines` > 0) doesn't start the reply. The first line must be a key, so a
        // leading horizontal rule stays one.
        if (state.parsedLines) return
        const block = /^---[ \t]*(\r?\n[\w-]+:[\s\S]*?\r?\n)---[ \t]*(?=\r?\n|$)/.exec(state.markdown)
        if (block) state.markdown = `\`\`\`yaml${block[1]}\`\`\`${state.markdown.slice(block[0].length)}`
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

/** A native `<details>` so the title line is the toggle, as in Obsidian; ChatMarkdown maps `icon` to UIcon. */
const SUMMARY = 'cursor-pointer list-none [&::-webkit-details-marker]:hidden'
const BLOCK = /^(?:p|ul|ol|pre|blockquote|h[1-6]|table|hr|callout|details|div)$/

/** A body paragraph spaced as in a callout: a ProseP's `my-5` would space it like a page. */
const tight = (n: Node): Node => Array.isArray(n) && n[0] === 'p' ? ['p', {...n[1], class: 'my-1'}, ...n.slice(2) as Node[]] : n

/**
 * Ofm's `callout` (`type`, `fold`; a `callout-title` and a `callout-content`) → Nuxt UI's ProseCallout with a bold title
 * line, Obsidian-style: `-` folds the body (closed), `+` too (open). The title is a bare `strong` and body paragraphs
 * get `my-1`: ProseCallout lays its slot out inline after the icon.
 */
function callout(node: ElementNode): Node {
    const type = String(node[1].type ?? 'note')
    const style = CALLOUTS[ALIASES[type] ?? type] ?? CALLOUTS.note!
    const slot = (name: string) => (node.slice(2) as Node[]).find(c => Array.isArray(c) && c[0] === name)?.slice(2) as Node[] | undefined ?? []
    const title = slot('callout-title')
    const content = slot('callout-content')
    // One paragraph comes unwrapped, as inline nodes.
    const body = content.some(c => Array.isArray(c) && BLOCK.test(c[0] as string)) ? content.map(tight) : content.length ? [['p', {class: 'my-1'}, ...content] as Node] : []
    const fold = node[1].fold
    if (fold !== '-' && fold !== '+') return ['callout', {color: style.color, icon: style.icon}, ['strong', {}, ...title], ...body]
    return ['callout', {color: style.color}, ['details', {...(fold === '+' && {open: true}), class: 'group/fold'},
        ['summary', {class: SUMMARY},
            ['icon', {name: style.icon, class: 'size-4 shrink-0 align-sub me-2'}],
            ['strong', {}, ...title],
            ['icon', {name: 'i-lucide-chevron-right', class: 'size-4 ms-1 align-sub transition-transform group-open/fold:rotate-90'}],
        ],
        ...body,
    ]]
}

const OFM_NODES = /^(?:callout|wikilink|internal-embed|hashtag)$/

/**
 * The editor's `ofm()` nodes (the Obsidian syntax, parsed as in notes) as the chat draws them: callouts (above),
 * `[[wikilinks]]` and `![[embeds]]` → `a` with a `note` prop (ChatLink opens the note), `#tags` → a coloured span;
 * `==highlights==` stay `mark`. Named `alert` so it replaces Comark's default GitHub-alert plugin; goes after `ofm()`.
 * Auto-close reads an `![[embed]]` ending the reply as an image missing its `(url)` and adds one; that text goes.
 */
export const ofmNodes: ComarkPlugin = {
    name: 'alert',
    post(state) {
        const stray = `(${INCOMPLETE_IMAGE_PLACEHOLDER})`
        visit(state.tree, n => n === stray || Array.isArray(n) && OFM_NODES.test(n[0] as string), n => {
            if (n === stray) return false
            const node = n as ElementNode
            const [tag, attrs] = node
            if (tag === 'callout') return callout(node)
            if (tag === 'hashtag') return ['span', {class: 'text-primary'}, ...node.slice(2) as Node[]]
            const note = attrs.subpath ? `${attrs.target}#${attrs.subpath}` : String(attrs.target ?? '')
            return ['a', {note}, ...(tag === 'wikilink' ? node.slice(2) as Node[] : [String(attrs.display ?? note)])]
        })
    },
}

/** A reply's Markdown as notes parse it (the editor's `ofm()`), drawn the chat's way, with quoted frontmatter shown. */
export const replyPlugins: ComarkPlugin[] = [ofm(), ofmNodes, frontmatterAsCode]

