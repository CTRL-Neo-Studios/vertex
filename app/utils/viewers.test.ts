import {describe, expect, it} from 'vitest'
import {viewerFor} from './viewers'

describe('viewerFor', () => {
    it.each([
        ['md', 'workspace', 'markdown'],
        ['png', 'workspace', 'image'],
        ['base', 'workspace', 'bases'],
        ['yml', 'singlespace', 'yaml'],
        ['tex', 'workspace', 'latex'],
        ['ts', 'singlespace', 'code'],
    ] as const)('.%s in %s → %s', (ext, mode, id) => {
        expect(viewerFor(ext, mode)?.id).toBe(id)
    })

    it('bases need a workspace; in a singlespace they fall back to the code editor', () => {
        expect(viewerFor('base', 'singlespace')?.id).toBe('code')
    })

    it('binary formats without a viewer get none', () => {
        expect(viewerFor('pdf', 'workspace')).toBeUndefined()
        expect(viewerFor('mp4', 'workspace')).toBeUndefined()
    })
})
