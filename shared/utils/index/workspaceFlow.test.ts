import {describe, expect, it} from 'vitest'
import {parseFrontmatter, parseYaml} from '../../../node_modules/@type32/codemirror-rich-obsidian-editor/dist/runtime/utils/frontmatter.js'
import {LinkGraph} from './linkGraph'
import {parseLinkTargets} from './parse'
import {getInternalLinks, renameTargets, rewriteLinks} from './rewriteLinks'

/**
 * End-to-end flow of the workspace index on an in-memory vault, using the same pieces
 * useActiveWorkspaceIndex composes: parse → graph → rename impact → rewrite → re-parse.
 */
const parsers = {parseYaml, parseFrontmatter, getInternalLinks}

function vault(files: Record<string, string>) {
    const g = new LinkGraph()
    const ids = Object.keys(files)
    for (const rel of ids) g.addFile({id: rel, relativePath: rel})
    for (const rel of ids) g.setLinks(rel, parseLinkTargets(`/v/${rel}`, files[rel]!, parsers))
    return g
}

describe('workspace index flow', () => {
    it('external edit that removes a link drops the backlink', () => {
        const files = {'A.md': 'see [[B]]', 'notes/B.md': '# B', 'C.md': '[[B#h]]'}
        const g = vault(files)
        expect(g.backlinks('notes/B.md').sort()).toEqual(['A.md', 'C.md'])
        g.setLinks('A.md', parseLinkTargets('/v/A.md', 'no links now', parsers))
        expect(g.backlinks('notes/B.md')).toEqual(['C.md'])
    })

    it('rename + accept "update links" keeps every backlink and rewrites the text', () => {
        const files: Record<string, string> = {
            'A.md': 'see [[B]] and [[notes/B|alias]]',
            'notes/B.md': 'back to [[A]]',
            'C.md': 'also [[B#Heading]] `[[B]]`',
        }
        const g = vault(files)
        const impacted = g.referencingFiles('notes/B.md').map(id => ({id, targets: g.targetsPointingAt(id, 'notes/B.md')}))
        expect(impacted.map(i => i.id).sort()).toEqual(['A.md', 'C.md'])

        g.moveFile('notes/B.md', 'archive/Bee.md')
        expect(g.backlinks('notes/B.md')).toEqual([]) // declined state: links kept but unresolved

        for (const {id, targets} of impacted) {
            const result = rewriteLinks(files[id]!, renameTargets(targets, 'notes/B.md', 'archive/Bee.md'))
            files[id] = result.text
            g.setLinks(id, parseLinkTargets(`/v/${id}`, result.text, parsers))
        }
        expect(files['A.md']).toBe('see [[Bee]] and [[archive/Bee|alias]]')
        expect(files['C.md']).toBe('also [[Bee#Heading]] `[[B]]`')
        expect(g.backlinks('notes/B.md').sort()).toEqual(['A.md', 'C.md'])
        expect(g.forelinks('notes/B.md')).toEqual(['A.md'])
    })
})
