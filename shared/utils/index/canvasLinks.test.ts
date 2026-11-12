import {describe, expect, it} from 'vitest'
import {parseFrontmatter, parseYaml} from '../../../node_modules/@type32/codemirror-rich-obsidian-editor/dist/runtime/utils/frontmatter.js'
import {canvasLinkTargets, rewriteCanvasLinks} from './canvasLinks'
import {LinkGraph} from './linkGraph'
import {parseLinkTargets} from './parse'
import {getInternalLinks, renameTargets} from './rewriteLinks'

const parsers = {parseYaml, parseFrontmatter, getInternalLinks}

// As Obsidian writes it: tabs, one node per line, no trailing newline.
const BOARD = `{
\t"nodes":[
\t\t{"id":"g1","type":"group","x":-40,"y":-40,"width":700,"height":400,"background":"img/bg.png"},
\t\t{"id":"t1","type":"text","text":"See [[Notes/Welcome|hi]] and [[Other#Part]]","x":0,"y":0,"width":250,"height":60},
\t\t{"id":"f1","type":"file","file":"Notes/Welcome.md","subpath":"#Intro","x":300,"y":0,"width":400,"height":400},
\t\t{"id":"x1","type":"shape","x":0,"y":500,"width":100,"height":100,"kept":true}
\t],
\t"edges":[
\t\t{"id":"e1","fromNode":"t1","fromSide":"right","toNode":"f1","toSide":"left"}
\t]
}`

describe('canvas links', () => {
    it('are its file cards, group backgrounds and text cards\' wiki links', () => {
        expect(canvasLinkTargets(BOARD, getInternalLinks).sort()).toEqual(['Notes/Welcome', 'Notes/Welcome.md', 'Other', 'img/bg.png'])
        expect(parseLinkTargets('/v/Board.canvas', BOARD, parsers)).toHaveLength(4)
    })

    it('a broken canvas has none, and is never rewritten', () => {
        expect(canvasLinkTargets('{"nodes": [', getInternalLinks)).toEqual([])
        expect(rewriteCanvasLinks('{"nodes": [', new Map([['a', 'b']]))).toEqual({text: '{"nodes": [', count: 0})
    })

    it('a moved note keeps its canvas card and backlink; the rest of the file is untouched', () => {
        const g = new LinkGraph()
        for (const rel of ['Board.canvas', 'Notes/Welcome.md', 'Other.md', 'img/bg.png']) g.addFile({id: rel, relativePath: rel})
        g.setLinks('Board.canvas', parseLinkTargets('/v/Board.canvas', BOARD, parsers))
        expect(g.backlinks('Notes/Welcome.md')).toEqual(['Board.canvas'])

        const targets = g.targetsPointingAt('Board.canvas', 'Notes/Welcome.md')
        g.moveFile('Notes/Welcome.md', 'Archive/Hello.md')
        const {text, count} = rewriteCanvasLinks(BOARD, renameTargets(targets, 'Notes/Welcome.md', 'Archive/Hello.md'))
        expect(count).toBe(2)
        expect(text).toBe(BOARD
            .replace('[[Notes/Welcome|hi]]', '[[Archive/Hello|hi]]')
            .replace('"file":"Notes/Welcome.md"', '"file":"Archive/Hello.md"'))

        // Ids stay with a file through moves.
        g.setLinks('Board.canvas', parseLinkTargets('/v/Board.canvas', text, parsers))
        expect(g.backlinks('Notes/Welcome.md')).toEqual(['Board.canvas'])
    })

    it('a moved background image follows', () => {
        const {text, count} = rewriteCanvasLinks(BOARD, renameTargets(['img/bg.png'], 'img/bg.png', 'img/sky.png'))
        expect(count).toBe(1)
        expect(text).toBe(BOARD.replace('img/bg.png', 'img/sky.png'))
    })
})
