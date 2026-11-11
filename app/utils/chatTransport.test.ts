import {describe, expect, it} from "vitest";
import {chatSystem, cleanCommitMessage, cleanTitle, commitPrompt, dataUrl, withImages} from "./chatTransport";
import type {VertexChatMessage} from "#shared/types/app/chats";

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

describe('commitPrompt', () => {
    it('trims a large diff to its start and says so, keeping the files and subjects', () => {
        const prompt = commitPrompt({files: ['M a.md'], diff: `+start\n${'x'.repeat(40_000)}\n+end`, subjects: ['Add notes']})
        expect(prompt).toContain('- Add notes')
        expect(prompt).toContain('M a.md')
        expect(prompt).toContain('+start')
        expect(prompt).not.toContain('+end')
        expect(prompt).toMatch(/first 16000 of 40012 characters/)
    })

    it('leaves out what there is none of', () => {
        expect(commitPrompt({files: ['? new.md'], diff: '', subjects: []})).toBe('Files in this commit:\n? new.md')
    })
})

describe('cleanCommitMessage', () => {
    it('drops reasoning, a code fence and wrapping quotes, keeping the body', () => {
        expect(cleanCommitMessage('<think>diff…</think>\n```text\nAdd soup notes\n\nThree recipes.\n```')).toBe('Add soup notes\n\nThree recipes.')
        expect(cleanCommitMessage('"Fix typo in Hub"')).toBe('Fix typo in Hub')
    })
})

describe('images for the model', () => {
    it('encodes bytes past one chunk exactly', () => {
        const bytes = Uint8Array.from({length: 0x8000 * 2 + 7}, (_, i) => (i * 31) % 256)
        expect(dataUrl('image/png', bytes)).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`)
    })

    it('adds each image to the message that attached it, as a file part', () => {
        const message = (id: string): VertexChatMessage => ({id, role: 'user', parts: [{type: 'text', text: id}]})
        const [a, b] = withImages([message('a'), message('b')], [{messageId: 'b', mediaType: 'image/png', url: 'data:x'}])
        expect(a!.parts).toEqual([{type: 'text', text: 'a'}])
        expect(b!.parts).toEqual([{type: 'text', text: 'b'}, {type: 'file', mediaType: 'image/png', url: 'data:x'}])
    })
})
