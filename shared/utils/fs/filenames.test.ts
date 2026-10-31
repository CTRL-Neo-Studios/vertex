import { describe, expect, it } from 'vitest'
import { fileNameFromPath, getFileExtensionFromPath, isValidFilename, sanitizeFilename } from './filenames'

describe('fileNameFromPath', () => {
    it.each([
        ['/v/notes/B.md', false, 'B.md'],
        ['/v/notes/B.md', true, 'B'],
        ['C:\\v\\a.b.txt', true, 'a.b'],
        ['/v/.env', true, '.env'],
        ['/v/my.vault/README', true, 'README'],
    ])('%s (omitExt=%s) → %s', (path, omit, name) => {
        expect(fileNameFromPath(path, omit)).toBe(name)
    })
})

describe('getFileExtensionFromPath', () => {
    it.each([
        ['/v/notes/B.md', 'md'],
        ['/v/README.MD', 'md'],
        ['/Users/me/my.vault/notes/README', 'unknown'],
        ['/v/.obsidian', 'unknown'],
        ['/v/archive.tar.gz', 'gz'],
        ['C:\\v\\note.txt', 'txt'],
        ['plain', 'unknown'],
    ])('%s → %s', (path, ext) => {
        expect(getFileExtensionFromPath(path)).toBe(ext)
    })
})

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
