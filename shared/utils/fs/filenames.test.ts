import { describe, expect, it } from 'vitest'
import { isValidFilename, sanitizeFilename } from './filenames'

describe('isValidFilename', () => {
    it.each(['note', 'My Note.md', '日本語のメモ', 'a.b.c', '.hidden'])('accepts %s', (name) => {
        expect(isValidFilename(name)).toBe(true)
    })

    it.each([
        ['empty', ''],
        ['slash', 'a/b'],
        ['backslash', 'a\\b'],
        ['colon', 'a:b'],
        ['control char', 'a\u0001b'],
        ['trailing dot', 'name.'],
        ['trailing space', 'name '],
        ['reserved name', 'CON'],
        ['reserved name with ext', 'nul.txt'],
        ['only dots', '..'],
    ])('rejects %s', (_label, name) => {
        expect(isValidFilename(name)).toBe(false)
    })
})

describe('sanitizeFilename', () => {
    it('prefixes reserved names instead of dropping them', () => {
        expect(sanitizeFilename('con.txt')).toBe('_con.txt')
    })

    it('never returns an empty name', () => {
        expect(sanitizeFilename('???')).toBe('_')
    })
})
