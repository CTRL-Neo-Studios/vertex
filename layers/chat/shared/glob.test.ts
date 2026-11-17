import {describe, expect, it} from 'vitest'
import {globToRegExp} from './glob'

const PATHS = ['a.md', 'Notes/b.md', 'Notes/Deep/c.md', 'Notes/Deep/d.png', 'img/e.JPG', 'f (1).md', 'x.mdx']
const match = (glob: string) => PATHS.filter(p => globToRegExp(glob).test(p))

describe('globToRegExp', () => {
    it('matches *, ** and ? within the path, ignoring case', () => {
        expect(match('*.md')).toEqual(['a.md', 'Notes/b.md', 'Notes/Deep/c.md', 'f (1).md'])
        expect(match('Notes/*.md')).toEqual(['Notes/b.md'])
        expect(match('notes/**/*.md')).toEqual(['Notes/b.md', 'Notes/Deep/c.md'])
        expect(match('Notes/**')).toEqual(['Notes/b.md', 'Notes/Deep/c.md', 'Notes/Deep/d.png'])
        expect(match('?.md')).toEqual(['a.md', 'Notes/b.md', 'Notes/Deep/c.md'])
        expect(match('/?.md')).toEqual(['a.md'])
    })

    it('takes {a,b} alternatives, nested too, and keeps other characters literal', () => {
        expect(match('**/*.{png,jpg}')).toEqual(['Notes/Deep/d.png', 'img/e.JPG'])
        expect(match('{a,Notes/{b,Deep/c}}.md')).toEqual(['a.md', 'Notes/b.md', 'Notes/Deep/c.md'])
        expect(match('f (1).md')).toEqual(['f (1).md'])
        expect(match('./a.md')).toEqual(['a.md'])
    })
})
