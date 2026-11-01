import {describe, expect, it} from 'vitest'
import {parseYaml, parseFrontmatter} from '../../../node_modules/@type32/codemirror-rich-obsidian-editor/dist/runtime/utils/frontmatter.js'
import {getInternalLinks} from './rewriteLinks'
import {isPropertiesFile, parentPathOf, parseLinkTargets, parseProperties} from './parse'
import {RecentWrites} from './selfWrites'

const parsers = {parseYaml, parseFrontmatter, getInternalLinks}

describe('parseProperties', () => {
    it('reads frontmatter from markdown', () => {
        expect(parseProperties('/v/a.md', '---\ntags: [draft]\n---\n# A', parsers).properties).toEqual({tags: ['draft']})
    })

    it('reads a whole yaml file', () => {
        expect(parseProperties('/v/properties.yml', 'icon: i-lucide-star\n', parsers).properties).toEqual({icon: 'i-lucide-star'})
    })

    it('ignores non-text files', () => {
        expect(parseProperties('/v/img.png', '---\na: 1\n---', parsers).properties).toEqual({})
    })

    it('reports a parse error instead of hiding it', () => {
        const r = parseProperties('/v/bad.yml', 'a: [unclosed', parsers)
        expect(r.properties).toEqual({})
        expect(r.error).toBeTruthy()
    })
})

describe('parseLinkTargets', () => {
    it('extracts wiki link targets, dropping aliases and headings', () => {
        expect(parseLinkTargets('/v/a.md', 'see [[B]] and [[notes/C|alias]] and [[D#h]]', parsers)).toEqual(['B', 'notes/C', 'D'])
    })

    it('yaml files carry no links', () => {
        expect(parseLinkTargets('/v/x.yml', 'a: "[[B]]"', parsers)).toEqual([])
    })
})

describe('path helpers', () => {
    it('recognises folder properties files', () => {
        expect(isPropertiesFile('properties.yaml')).toBe(true)
        expect(isPropertiesFile('properties.md')).toBe(false)
    })

    it('parentPathOf', () => {
        expect(parentPathOf('/v/notes/B.md')).toBe('/v/notes')
        expect(parentPathOf('A.md')).toBe('')
    })
})

describe('RecentWrites', () => {
    it('suppresses only within the window', () => {
        let t = 0
        const w = new RecentWrites(100, () => t)
        w.mark('/v/a.md')
        expect(w.has('/v/a.md')).toBe(true)
        expect(w.has('/v/b.md')).toBe(false)
        t = 101
        expect(w.has('/v/a.md')).toBe(false)
    })
})
