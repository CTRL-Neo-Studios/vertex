import {describe, expect, it} from 'vitest'
import {getInternalLinks, renameTargets, rewriteLinks} from './rewriteLinks'

const r = (text: string, pairs: [string, string][]) => rewriteLinks(text, new Map(pairs))

describe('rewriteLinks', () => {
    it('rewrites plain, heading, alias and embed forms', () => {
        const {text, count} = r('a [[B]] b [[B#Sec]] c [[B|shown]] d ![[B]] e [[B#S|x]]', [['B', 'C']])
        expect(text).toBe('a [[C]] b [[C#Sec]] c [[C|shown]] d ![[C]] e [[C#S|x]]')
        expect(count).toBe(5)
    })

    it('leaves other links, code spans and fenced code untouched', () => {
        const input = '[[Other]] `[[B]]` \n```\n[[B]]\n```\n[[B]]'
        expect(r(input, [['B', 'C']]).text).toBe('[[Other]] `[[B]]` \n```\n[[B]]\n```\n[[C]]')
    })

    it('preserves whitespace inside the brackets', () => {
        expect(r('[[ B | alias ]]', [['B', 'C']]).text).toBe('[[ C | alias ]]')
    })

    it('is a no-op when nothing matches', () => {
        const input = 'no links [here] or [[Else]]'
        expect(r(input, [['B', 'C']])).toEqual({text: input, count: 0})
    })

    it('keeps the set of links, changing only the renamed targets', () => {
        const input = 'x [[B]] `[[B]]` [[B|y]] ![[notes/B]] [[unclosed\n[[B#h]]'
        const out = r(input, [['B', 'Z'], ['notes/B', 'notes/Z']]).text
        const before = getInternalLinks(input).map(l => l.path)
        const after = getInternalLinks(out).map(l => l.path)
        expect(after).toEqual(before.map(p => (p === 'B' ? 'Z' : p === 'notes/B' ? 'notes/Z' : p)))
    })
})

describe('getInternalLinks', () => {
    it('reads targets, subpaths and display text, skipping code and broken links', () => {
        const input = '[[ A ]] [[B#Sec|shown]] ![[img.png]] `[[code]]`\n```\n[[fenced]]\n```\n[[]] [[open [[C]]'
        expect(getInternalLinks(input)).toEqual([
            {path: 'A'},
            {path: 'B', subpath: 'Sec', display: 'shown'},
            {path: 'img.png'},
            {path: 'C'},
        ])
    })
})

describe('renameTargets', () => {
    it('maps each link form to its renamed equivalent', () => {
        const m = renameTargets(['B', 'notes/B', 'notes/B.md'], 'notes/B.md', 'archive/Renamed.md')
        expect(Object.fromEntries(m)).toEqual({'B': 'Renamed', 'notes/B': 'archive/Renamed', 'notes/B.md': 'archive/Renamed.md'})
    })
})
