import {describe, expect, it} from 'vitest'
import {isPlainTextFile} from '#shared/utils/fs/filenames'
import {fileViewers} from './contributions'
import {viewerFor} from './viewers'

// The plugins' viewers as they register them (`layers/`, `app/builtins/`); the kernel's (markdown, code) come with `viewers.ts`.
const component = async () => ({})
fileViewers.register({id: 'image', loadsText: false, match: ext => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext), component})
fileViewers.register({id: 'yaml', loadsText: true, match: ext => ext === 'yml' || ext === 'yaml', component})
fileViewers.register({id: 'latex', loadsText: true, match: ext => ext === 'tex', component})
fileViewers.register({id: 'canvas', loadsText: true, modes: ['workspace'], match: ext => ext === 'canvas', component})
fileViewers.register({id: 'bases', loadsText: true, modes: ['workspace'], match: ext => ext === 'base', component})
fileViewers.register({id: 'workflow', loadsText: true, modes: ['workspace'], match: ext => ext === 'workflow', component})

describe('viewerFor', () => {
    it.each([
        ['md', 'workspace', 'markdown'],
        ['png', 'workspace', 'image'],
        ['base', 'workspace', 'bases'],
        ['workflow', 'workspace', 'workflow'],
        ['canvas', 'workspace', 'canvas'],
        ['yml', 'singlespace', 'yaml'],
        ['tex', 'workspace', 'latex'],
        ['ts', 'singlespace', 'code'],
    ] as const)('.%s in %s → %s', (ext, mode, id) => {
        expect(viewerFor(ext, mode)?.id).toBe(id)
    })

    it('bases, workflows and canvases need a workspace; in a singlespace they fall back to the code editor', () => {
        expect(viewerFor('base', 'singlespace')?.id).toBe('code')
        expect(viewerFor('workflow', 'singlespace')?.id).toBe('code')
        expect(viewerFor('canvas', 'singlespace')?.id).toBe('code')
    })

    it('binary formats without a viewer get none', () => {
        expect(viewerFor('pdf', 'workspace')).toBeUndefined()
        expect(viewerFor('mp4', 'workspace')).toBeUndefined()
    })

    it('the highest priority wins; on a tie, the first registered', () => {
        const removeTie = fileViewers.register({id: 'tie', loadsText: true, match: isPlainTextFile, component})
        expect(viewerFor('md', 'workspace')?.id).toBe('markdown')
        const removeHigh = fileViewers.register({id: 'high', loadsText: true, priority: 1, match: isPlainTextFile, component})
        expect(viewerFor('md', 'workspace')?.id).toBe('high')
        removeHigh()
        removeTie()
        expect(viewerFor('md', 'workspace')?.id).toBe('markdown')
    })
})
