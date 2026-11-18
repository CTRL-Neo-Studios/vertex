import {describe, expect, it} from 'vitest'
import type {ScannedEntry} from '#shared/types/active/workspace'
import {planBatch, type WatchBatch} from './watchBatch'

const ROOT = '/v'
const file = (path: string): ScannedEntry => ({path, name: path.slice(path.lastIndexOf('/') + 1), is_directory: false, size: 1, children: []})
const folder = (path: string): ScannedEntry => ({...file(path), is_directory: true})
const there = (path: string) => ({path, entry: file(path)})
const gone = (path: string) => ({path})

/** The plan for a batch, over an index that has `indexed`. */
function plan(indexed: string[], batch: Partial<WatchBatch>, options: { wholeFolder?: boolean, self?: string[] } = {}) {
    const has = new Set(indexed)
    return planBatch({renames: [], changes: [], ...batch}, {has: path => has.has(path)}, {
        root: ROOT, wholeFolder: options.wholeFolder ?? true, isSelfWrite: path => options.self?.includes(path) ?? false,
    })
}
const nothing = {moves: [], removes: [], adds: [], reads: []}

describe('what a batch of changes does to the index', () => {
    it('the disk decides: there and unknown is added, there and known is read again, gone is removed', () => {
        expect(plan(['/v/a.md', '/v/b.md'], {changes: [there('/v/new.md'), there('/v/a.md'), gone('/v/b.md'), gone('/v/never.md')]}))
            .toEqual({moves: [], removes: ['/v/b.md'], adds: ['/v/new.md'], reads: ['/v/a.md']})
    })

    it('a folder that changed is not read, one that arrived is added once, with what\'s in it', () => {
        expect(plan(['/v/old'], {changes: [{path: '/v/old', entry: folder('/v/old')}, {path: '/v/in', entry: folder('/v/in')}, there('/v/in/a.md'), there('/v/in/deep/b.md')]}))
            .toEqual({...nothing, adds: ['/v/in']})
    })

    it('a folder that went takes what\'s in it', () => {
        expect(plan(['/v/out', '/v/out/a.md', '/v/out/deep', '/v/out/deep/b.md', '/v/out b.md'], {changes: [gone('/v/out/a.md'), gone('/v/out/deep/b.md'), gone('/v/out'), gone('/v/out b.md')]}))
            .toEqual({...nothing, removes: ['/v/out', '/v/out b.md']})
    })

    it('nothing under a dot name, and nothing the app just wrote', () => {
        expect(plan(['/v/a.md'], {changes: [there('/v/.git/index'), there('/v/.vertex/trash/x.md'), there('/v/a.md'), there('/v/mine.md')], renames: [{from: '/v/a.md', to: '/v/b.md'}]}, {self: ['/v/a.md', '/v/b.md', '/v/mine.md']}))
            .toEqual(nothing)
    })

    it('a rename keeps the entry; one whose source isn\'t indexed is an add', () => {
        expect(plan(['/v/a.md'], {renames: [{from: '/v/a.md', to: '/v/b.md'}, {from: '/v/unknown.md', to: '/v/c.md'}]}))
            .toEqual({...nothing, moves: [{from: '/v/a.md', to: '/v/b.md'}], adds: ['/v/c.md']})
    })

    it('a rename into a dot folder is a remove, out of one an add, onto an indexed file a remove and a read', () => {
        expect(plan(['/v/a.md', '/v/b.md', '/v/c.md'], {renames: [{from: '/v/a.md', to: '/v/.trash/a.md'}, {from: '/v/.trash/z.md', to: '/v/z.md'}, {from: '/v/b.md', to: '/v/c.md'}]}))
            .toEqual({moves: [], removes: ['/v/a.md', '/v/b.md'], adds: ['/v/z.md'], reads: ['/v/c.md']})
    })

    it('a folder renamed: what\'s in it goes along, and what changed in it is found at its new path', () => {
        const indexed = ['/v/old', '/v/old/a.md', '/v/old/b.md']
        expect(plan(indexed, {
            renames: [{from: '/v/old', to: '/v/new'}],
            changes: [gone('/v/old'), gone('/v/old/a.md'), there('/v/new/a.md'), gone('/v/new/b.md'), there('/v/new/c.md')],
        })).toEqual({moves: [{from: '/v/old', to: '/v/new'}], removes: ['/v/new/b.md'], adds: ['/v/new/c.md'], reads: ['/v/new/a.md']})
    })

    it('a rename of case, which arrives as one path the folder lists under another name', () => {
        expect(plan(['/v/Note.md'], {changes: [{path: '/v/Note.md', entry: file('/v/note.md')}]}))
            .toEqual({...nothing, moves: [{from: '/v/Note.md', to: '/v/note.md'}]})
    })

    it('a single-file window adds nothing', () => {
        expect(plan(['/v/a.md'], {changes: [there('/v/a.md'), there('/v/other.md')], renames: [{from: '/v/x.md', to: '/v/y.md'}]}, {wholeFolder: false}))
            .toEqual({...nothing, reads: ['/v/a.md']})
        expect(plan(['/v/a.md'], {changes: [gone('/v/a.md')]}, {wholeFolder: false})).toEqual({...nothing, removes: ['/v/a.md']})
    })
})
