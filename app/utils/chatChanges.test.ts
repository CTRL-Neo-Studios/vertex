import {describe, expect, it} from "vitest";
import type {ChatChange, VertexChatMessage} from "#shared/types/app/chats";
import {changesSummary, newNotePath, textChange} from "~/utils/chatChanges";

describe('newNotePath', () => {
    it('keeps workspace-relative note paths, adding .md where missing', () => {
        expect(newNotePath('Lore/Places/Inn.md')).toBe('Lore/Places/Inn.md')
        expect(newNotePath('/Lore/Chapter 1.5')).toBe('Lore/Chapter 1.5.md')
    })

    it('refuses paths outside the workspace, under dot folders or empty', () => {
        for (const bad of ['../x.md', 'C:/x.md', '~/x.md', 'a\\b.md', '.vertex/x.md', 'Lore/.hidden/x.md', '', '   ']) {
            expect(() => newNotePath(bad), bad).toThrow()
        }
    })
})

describe('textChange', () => {
    const apply = (from: string, to: string) => {
        const c = textChange(from, to)
        return from.slice(0, c.from) + c.insert + from.slice(c.to)
    }

    it('covers only what differs, so a mounted editor keeps the rest (and its cursor)', () => {
        expect(textChange('one two three', 'one 2 three')).toEqual({from: 4, to: 7, insert: '2'})
        // Repeated letters around the edit: start and end don't overlap.
        expect(textChange('aaa', 'aaaa')).toEqual({from: 3, to: 3, insert: 'a'})
        for (const [from, to] of [['', 'new'], ['old', ''], ['abc', 'abc'], ['ab', 'ba'], ['xaay', 'xay']]) expect(apply(from!, to!)).toBe(to)
    })
})

describe('changesSummary', () => {
    const reply = (...changes: Partial<ChatChange>[]) => ({
        id: 'a', role: 'assistant', parts: [],
        metadata: {changes: changes.map(c => ({path: 'A.md', before: 'x', after: 'y', state: 'pending', ...c}))},
    }) as VertexChatMessage

    it('lists each note once, with its latest outcome', () => {
        const summary = changesSummary([reply({state: 'discarded'}, {path: 'New.md', before: null, state: 'applied'}), reply({state: 'conflict'})])
        expect(summary.split('\n').slice(1)).toEqual([
            '- "A.md": not applied: the note changed after you staged it',
            '- "New.md" (new note): applied by the user',
        ])
        expect(changesSummary([])).toBe('')
    })
})
