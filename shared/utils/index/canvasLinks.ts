import {isSupportedNode, parseCanvas, stringifyCanvas, type JSONCanvas} from "@type32/jsoncanvas-editor/core";
import {rewriteLinks} from "#shared/utils/index/rewriteLinks";

/** The canvas in `text`, or `undefined` when it isn't one (a broken file has no links and is never rewritten). */
function readCanvas(text: string): JSONCanvas | undefined {
    try {
        return parseCanvas(text).canvas
    } catch {
        return undefined
    }
}

/**
 * What a `.canvas` links to: its file cards' and group backgrounds' paths (workspace-relative, as Obsidian writes
 * them) and the wiki links in its text cards.
 */
export function canvasLinkTargets(text: string, getInternalLinks: (text: string) => {path: string}[]): string[] {
    const canvas = readCanvas(text)
    if (!canvas) return []
    return (canvas.nodes ?? []).flatMap((node) => {
        if (!isSupportedNode(node)) return []
        if (node.type === 'file') return [node.file]
        if (node.type === 'text') return getInternalLinks(node.text).map(l => l.path)
        if (node.type === 'group' && node.background) return [node.background]
        return []
    })
}

/**
 * Applies `rename` (old target → new, as `renameTargets` builds it) to a canvas: file cards' and backgrounds' paths,
 * and wiki links in text cards. Returns the canvas written back (Obsidian's format) and how many references changed.
 */
export function rewriteCanvasLinks(text: string, rename: Map<string, string>): {text: string, count: number} {
    const canvas = readCanvas(text)
    if (!canvas) return {text, count: 0}
    let count = 0
    const nodes = (canvas.nodes ?? []).map((node) => {
        if (!isSupportedNode(node)) return node
        if (node.type === 'file' && rename.has(node.file)) {
            count++
            return {...node, file: rename.get(node.file)!}
        }
        if (node.type === 'group' && node.background && rename.has(node.background)) {
            count++
            return {...node, background: rename.get(node.background)!}
        }
        if (node.type === 'text') {
            const result = rewriteLinks(node.text, rename)
            if (!result.count) return node
            count += result.count
            return {...node, text: result.text}
        }
        return node
    })
    return count ? {text: stringifyCanvas({...canvas, nodes}), count} : {text, count}
}
