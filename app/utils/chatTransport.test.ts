import {describe, expect, it} from "vitest";
import {chatSystem} from "./chatTransport";

const notesIn = (system: string) => [...system.matchAll(/<note path="([^"]+)">\n([\s\S]*?)\n<\/note>/g)].map(m => ({path: m[1]!, content: m[2]!}))

describe('chatSystem', () => {
    it('puts the profile prompt first, then the notes', () => {
        const system = chatSystem('Be brief.', [{path: 'a.md', content: 'A'}])
        expect(system.startsWith('Be brief.\n\n')).toBe(true)
        expect(notesIn(system)).toEqual([{path: 'a.md', content: 'A'}])
    })

    it('sends a note once, keeping the first copy (the live buffer comes first)', () => {
        const system = chatSystem('', [{path: 'a.md', content: 'live'}, {path: 'b.md', content: 'B'}, {path: 'a.md', content: 'saved'}])
        expect(notesIn(system)).toEqual([{path: 'a.md', content: 'live'}, {path: 'b.md', content: 'B'}])
    })

    it('cuts the notes at 60k characters in total', () => {
        const system = chatSystem('', [{path: 'a.md', content: 'x'.repeat(50_000)}, {path: 'b.md', content: 'y'.repeat(20_000)}, {path: 'c.md', content: 'z'}])
        const notes = notesIn(system)
        expect(notes.map(n => [n.path, n.content.length])).toEqual([['a.md', 50_000], ['b.md', 10_000]])
    })

    it('is empty without a prompt or notes, and just the prompt without notes', () => {
        expect(chatSystem('', [])).toBe('')
        expect(chatSystem('Be brief.', [])).toBe('Be brief.')
    })
})
