import {describe, expect, it} from 'vitest'
import {defaultTrustRecords, trustedBy} from './trust'

const records = defaultTrustRecords({
    folders: {'/v/Flat': {trustedAt: 't', nested: false}, '/v/Deep': {trustedAt: 't', nested: true}, 'relative': {trustedAt: 't'}},
    files: {'/v/a.workflow': {trustedAt: 't', hash: 'h1'}, '/v/b.workflow': {name: 'old'}},
})

describe('trustedBy', () => {
    it('a file by path, or by path and program in content mode', () => {
        expect(trustedBy(records, '/v/a.workflow', 'h2', 'path')).toEqual({kind: 'file'})
        expect(trustedBy(records, '/v/a.workflow', 'h1', 'content')).toEqual({kind: 'file'})
        expect(trustedBy(records, '/v/a.workflow', 'h2', 'content')).toBeUndefined()
    })

    it('a folder covers its own files, and its subfolders only when nested', () => {
        expect(trustedBy(records, '/v/Flat/x.workflow', '', 'content')).toEqual({kind: 'folder', path: '/v/Flat'})
        expect(trustedBy(records, '/v/Flat/sub/x.workflow', '', 'path')).toBeUndefined()
        expect(trustedBy(records, '/v/Deep/a/b/x.workflow', '', 'path')).toEqual({kind: 'folder', path: '/v/Deep'})
        expect(trustedBy(records, '/v/Deeper/x.workflow', '', 'path')).toBeUndefined()
        expect(trustedBy(records, 'C:\\v\\Deep\\x.workflow', '', 'path')).toBeUndefined()
    })

    it('drops relative paths and malformed records', () => {
        expect(Object.keys(records.folders)).toEqual(['/v/Flat', '/v/Deep'])
        expect(Object.keys(records.files)).toEqual(['/v/a.workflow'])
        expect(defaultTrustRecords(null)).toEqual({folders: {}, files: {}})
    })
})
