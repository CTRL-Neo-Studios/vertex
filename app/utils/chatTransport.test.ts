import {describe, expect, it} from "vitest";
import {chatSystem, cleanTitle} from "./chatTransport";

const notesIn = (prompt: string, notes: {path: string, content: string}[]) => {
    const {system, sent} = chatSystem(prompt, notes)
    const blocks = [...system.matchAll(/<note path="([^"]+)">\n([\s\S]*?)\n<\/note>/g)].map(m => ({path: m[1]!, content: m[2]!}))
    // What it reports sending is what it sent.
    expect(sent).toEqual(blocks.map(b => ({path: b.path, chars: b.content.length})))
    return blocks
}

describe('chatSystem', () => {
    it('puts the profile prompt first, then the notes', () => {
        const notes = [{path: 'a.md', content: 'A'}]
        expect(chatSystem('Be brief.', notes).system.startsWith('Be brief.\n\n')).toBe(true)
        expect(notesIn('Be brief.', notes)).toEqual([{path: 'a.md', content: 'A'}])
    })

    it('sends a note once, keeping the first copy (the live buffer comes first)', () => {
        expect(notesIn('', [{path: 'a.md', content: 'live'}, {path: 'b.md', content: 'B'}, {path: 'a.md', content: 'saved'}]))
            .toEqual([{path: 'a.md', content: 'live'}, {path: 'b.md', content: 'B'}])
    })

    it('cuts the notes at 60k characters in total', () => {
        const notes = notesIn('', [{path: 'a.md', content: 'x'.repeat(50_000)}, {path: 'b.md', content: 'y'.repeat(20_000)}, {path: 'c.md', content: 'z'}])
        expect(notes.map(n => [n.path, n.content.length])).toEqual([['a.md', 50_000], ['b.md', 10_000]])
    })

    it('is empty without a prompt or notes, and just the prompt without notes', () => {
        expect(chatSystem('', []).system).toBe('')
        expect(chatSystem('Be brief.', []).system).toBe('Be brief.')
    })
})

describe('cleanTitle', () => {
    it('keeps the first line, without quotes, markdown marks, a "Title:" label or closing punctuation', () => {
        expect(cleanTitle('"Planning the Gilded Kraken heist."\nHere is why…')).toBe('Planning the Gilded Kraken heist')
        expect(cleanTitle('**Title: Soup recipes**')).toBe('Soup recipes')
        expect(cleanTitle('<think>hmm</think>\n# 汤的做法。')).toBe('汤的做法')
    })

    it('is empty when nothing usable is left, and at most 60 characters', () => {
        expect(cleanTitle('  "" ')).toBe('')
        expect(cleanTitle('x'.repeat(80))).toHaveLength(60)
    })
})
