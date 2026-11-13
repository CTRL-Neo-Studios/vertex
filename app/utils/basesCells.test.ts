import {describe, expect, it} from "vitest";
import {cellEditable, cellText, cellValue} from "./basesCells";

describe('basesCells', () => {
    it('edits note properties of notes only', () => {
        expect(cellEditable('status', 'a/B.md')).toBe(true)
        expect(cellEditable('note.status', 'B.md')).toBe(true)
        expect(cellEditable('file.name', 'B.md')).toBe(false)
        expect(cellEditable('file', 'B.md')).toBe(false)
        expect(cellEditable('formula.x', 'B.md')).toBe(false)
        expect(cellEditable('status', 'img.png')).toBe(false)
        expect(cellEditable('filed', 'B.md')).toBe(true)
    })

    it('writes empty text as null', () => {
        for (const kind of ['text', 'number', 'checkbox', 'list', 'date'] as const) expect(cellValue(kind, '')).toBeNull()
    })

    it('reads numbers in number columns, else keeps the text', () => {
        expect(cellValue('number', '1.5')).toBe(1.5)
        expect(cellValue('number', '-3')).toBe(-3)
        expect(cellValue('number', 'abc')).toBe('abc')
        expect(cellValue('number', ' ')).toBe(' ')
    })

    it('reads true/false in checkbox columns, else keeps the text', () => {
        expect(cellValue('checkbox', 'TRUE')).toBe(true)
        expect(cellValue('checkbox', 'false')).toBe(false)
        expect(cellValue('checkbox', 'yes')).toBe('yes')
    })

    it('splits lists on commas', () => {
        expect(cellValue('list', ' a, b ,, c ')).toEqual(['a', 'b', 'c'])
    })

    it('keeps dates and text as typed', () => {
        expect(cellValue('date', '2026-01-02')).toBe('2026-01-02')
        expect(cellValue('text', '42')).toBe('42')
    })

    it('copies values as text, Null as nothing', () => {
        expect(cellText({type: 'Null'})).toBe('')
        expect(cellText({type: 'Number', value: 2})).toBe('2')
        expect(cellText({type: 'List', items: [{type: 'String', value: 'a'}, {type: 'Boolean', value: true}]})).toBe('a, true')
    })
})
