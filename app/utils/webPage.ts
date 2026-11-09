import {invoke} from "@tauri-apps/api/core";

/** Rust `web_fetch`'s reply; `body` is `null` for types that aren't text. */
interface WebPage {
    url: string
    status: number
    contentType: string
    body: string | null
    /** The body was cut at 2 MB. */
    truncated: boolean
}

const PAGE_CHARS = 20_000
/** Not content: dropped with everything in them. */
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT', 'NAV', 'FOOTER', 'ASIDE', 'FORM', 'BUTTON', 'SELECT', 'DIALOG'])
/** Their text is a paragraph of its own. */
const BLOCKS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD', 'ADDRESS', 'DETAILS', 'SUMMARY', 'CAPTION'])

/**
 * A page's HTML as Markdown-like text: its `main` (or `article`, else `body`) without scripts, styles, navigation,
 * forms and hidden parts; headings, links (absolute, against `base`), lists, quotes, code and tables kept as Markdown.
 * Uses the webview's `DOMParser`: nothing in the page runs.
 */
export function htmlToText(html: string, base: string): { title: string, text: string } {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const root = doc.querySelector('main') ?? doc.querySelector('article') ?? doc.body
    const walk = (node: Node): string => {
        if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/\s+/g, ' ')
        if (node.nodeType !== Node.ELEMENT_NODE) return ''
        const el = node as Element
        const tag = el.tagName
        if (SKIP.has(tag) || el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return ''
        const inner = () => Array.from(el.childNodes, walk).join('')
        if (/^H[1-6]$/.test(tag)) return `\n\n${'#'.repeat(Number(tag[1]))} ${inner().trim()}\n\n`
        if (BLOCKS.has(tag)) return `\n\n${inner().trim()}\n\n`
        switch (tag) {
            case 'BR':
                return '\n'
            case 'HR':
                return '\n\n---\n\n'
            case 'A': {
                const text = inner().trim()
                const href = el.getAttribute('href')
                if (!text || !href || href.startsWith('#') || /^javascript:/i.test(href)) return text
                try {
                    return `[${text}](${new URL(href, base).href})`
                } catch {
                    return text
                }
            }
            case 'IMG': {
                const alt = el.getAttribute('alt')?.trim()
                return alt ? `[image: ${alt}]` : ''
            }
            case 'PRE':
                return `\n\n\`\`\`\n${(el.textContent ?? '').replace(/\n+$/, '')}\n\`\`\`\n\n`
            case 'CODE':
                return `\`${el.textContent ?? ''}\``
            case 'UL':
            case 'OL':
                return `\n\n${inner().trim()}\n\n`
            case 'LI':
                return `\n- ${inner().trim().replace(/\n+/g, ' ')}`
            case 'BLOCKQUOTE':
                return `\n\n${inner().trim().split('\n').map(line => `> ${line}`).join('\n')}\n\n`
            case 'TABLE': {
                // The first row as the header, as Markdown tables need one.
                const rows = inner().trim().split('\n')
                const columns = (rows[0]?.match(/(?<!\\)\|/g)?.length ?? 1) - 1
                if (rows.length > 1 && columns > 0) rows.splice(1, 0, `|${' --- |'.repeat(columns)}`)
                return `\n\n${rows.join('\n')}\n\n`
            }
            case 'TR':
                return `\n| ${Array.from(el.children, cell => walk(cell).trim().replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|')).join(' | ')} |`
            default:
                return inner()
        }
    }
    const text = walk(root)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]*(?=\n)/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    return {title: doc.title.trim(), text}
}

/**
 * `fetchUrl`: the page at `url` (through Rust `web_fetch`) as text, `PAGE_CHARS` from `offset`; HTML through
 * {@link htmlToText}. Worded for the model: failures are `{error}`.
 */
export async function fetchPage(url: string, offset: number): Promise<object> {
    let page: WebPage
    try {
        page = await invoke<WebPage>('web_fetch', {url})
    } catch (e) {
        return {error: `Couldn't fetch "${url}": ${e instanceof Error ? e.message : String(e)}`}
    }
    const head = {url: page.url, status: page.status, contentType: page.contentType}
    if (page.body === null) return {...head, error: `It's ${page.contentType}, which can't be read as text.`}
    const html = /html/i.test(page.contentType) || (!page.contentType && /^\s*</.test(page.body))
    const {title, text} = html ? htmlToText(page.body, page.url) : {title: '', text: page.body}
    const from = Math.max(0, Math.floor(offset))
    const markdown = text.slice(from, from + PAGE_CHARS)
    const next = from + markdown.length
    return {
        ...head,
        ...(title && {title}),
        markdown,
        totalChars: text.length,
        ...(next < text.length && {truncated: true, nextOffset: next}),
        ...(page.truncated && {note: 'The page was cut at 2 MB before converting.'}),
    }
}
