/** One `[[target#subpath|display]]` or `![[embed]]` link, with where its target text sits in the document. */
interface ScannedLink {
    /** Target as written, without `#subpath` and `|display`; untrimmed. */
    pathPart: string
    /** Offset of `pathPart`'s first character. */
    pathStart: number
    subpath?: string
    display?: string
}

/**
 * The wiki-link grammar used for indexing and rewriting (once the editor's `getInternalLinks`, which its
 * package no longer exports): code spans and fenced blocks are skipped; an empty `[[]]` or an unclosed one
 * isn't a link; `[[` inside a link starts over.
 */
function scanLinks(text: string, visit: (link: ScannedLink) => void) {
    let i = 0
    const len = text.length
    while (i < len) {
        const ch = text[i]
        if ((ch === '`' || ch === '~') && text[i + 1] === ch && text[i + 2] === ch) {
            const end = text.indexOf('\n' + text.slice(i, i + 3), i + 3)
            i = end === -1 ? len : end + 4
            continue
        }
        if (ch === '`') {
            const end = text.indexOf('`', i + 1)
            i = end === -1 ? len : end + 1
            continue
        }
        const isEmbed = ch === '!' && text[i + 1] === '[' && text[i + 2] === '['
        const isLink = !isEmbed && ch === '[' && text[i + 1] === '['
        if (!isEmbed && !isLink) {
            i++
            continue
        }
        const contentStart = (isEmbed ? i + 1 : i) + 2
        let endPos = -1
        for (let j = contentStart; j < len - 1; j++) {
            if (text[j] === '[' && text[j + 1] === '[') break
            if (text[j] === ']' && text[j + 1] === ']') {
                endPos = j
                break
            }
        }
        if (endPos === -1 || endPos === contentStart) {
            i = isEmbed ? i + 1 : i + 2
            continue
        }

        const inner = text.slice(contentStart, endPos)
        const pipe = inner.indexOf('|')
        const pathRaw = pipe === -1 ? inner : inner.slice(0, pipe)
        const hash = pathRaw.indexOf('#')
        const link: ScannedLink = {pathPart: hash === -1 ? pathRaw : pathRaw.slice(0, hash), pathStart: contentStart}
        if (hash !== -1) link.subpath = pathRaw.slice(hash + 1).trim()
        if (pipe !== -1) link.display = inner.slice(pipe + 1).trim()
        visit(link)
        i = endPos + 2
    }
}

/** Every wiki link in a document, targets trimmed (same shape as the editor's `InternalLinkNode`). */
export function getInternalLinks(text: string): {path: string, subpath?: string, display?: string}[] {
    const links: {path: string, subpath?: string, display?: string}[] = []
    scanLinks(text, ({pathPart, subpath, display}) => {
        const path = pathPart.trim()
        if (!path) return
        links.push({path, ...(subpath !== undefined && {subpath}), ...(display !== undefined && {display})})
    })
    return links
}

/**
 * Rewrites `[[target]]` wiki links in a markdown document with the same grammar as `getInternalLinks`:
 * `#heading` subpaths, `|alias` text and `![[embed]]` prefixes are preserved.
 *
 * `rename` maps an old target (exact, as written) to its replacement.
 * Returns the new text and how many links were rewritten.
 */
export function rewriteLinks(text: string, rename: Map<string, string>): {text: string, count: number} {
    let out = ''
    let count = 0
    let copiedTo = 0
    scanLinks(text, ({pathPart, pathStart}) => {
        const replacement = rename.get(pathPart.trim())
        if (replacement === undefined) return
        const lead = pathPart.match(/^\s*/)![0]
        const trail = pathPart.match(/\s*$/)![0]
        out += text.slice(copiedTo, pathStart) + lead + replacement + trail
        copiedTo = pathStart + pathPart.length
        count++
    })
    return {text: out + text.slice(copiedTo), count}
}

/**
 * For a file moving from `oldRel` to `newRel`, maps each link target that resolved to it onto the
 * equivalent target for the new location (basename → new basename, relative path → new relative path).
 */
export function renameTargets(targets: string[], oldRel: string, newRel: string): Map<string, string> {
    const stripExt = (p: string) => {
        const name = p.slice(p.lastIndexOf('/') + 1)
        const dot = name.lastIndexOf('.')
        return dot > 0 ? p.slice(0, p.length - (name.length - dot)) : p
    }
    const base = (p: string) => stripExt(p).slice(stripExt(p).lastIndexOf('/') + 1)
    const map = new Map<string, string>()
    for (const t of targets) {
        if (t === oldRel) map.set(t, newRel)
        else if (t === stripExt(oldRel)) map.set(t, stripExt(newRel))
        else if (t === base(oldRel)) map.set(t, base(newRel))
    }
    return map
}
