import {describe, expect, it} from 'vitest'
import {defaultAppSettings} from '#shared/utils/defaults/apps'
import {LEGACY_PATHS, movedPathsIn, withMovedPaths} from './legacy'
import {withoutAt} from './paths'

// A move like the X phases add: Canvas's settings leave `viewConfig` for its plugin's config.
const table = [['viewConfig.canvas.snapToGrid', 'plugins.config.canvas.snapToGrid']] as const

describe('settings that moved', () => {
    it('reads the global file\'s old path at the new one, keeping what is already there', () => {
        const old = {viewConfig: {canvas: {snapToGrid: false}}}
        expect(withMovedPaths(old, table)).toEqual({plugins: {config: {canvas: {snapToGrid: false}}}})
        const both = {...old, plugins: {config: {canvas: {snapToGrid: true}}}}
        expect(withMovedPaths(both, table)).toEqual({plugins: {config: {canvas: {snapToGrid: true}}}})
        // A file written before X2, read with the real table: the new path, so the next save writes it there.
        expect(defaultAppSettings(JSON.parse('{"viewConfig": {"canvas": {"snapToGrid": false}}}')).plugins.config).toEqual({canvas: {snapToGrid: false}})
    })

    it('tells a workspace\'s write which old paths to move', () => {
        const raw = {themeConfig: {primaryColor: 'rose'}, viewConfig: {canvas: {snapToGrid: false}}}
        expect(movedPathsIn(raw, table)).toEqual([['viewConfig.canvas.snapToGrid', 'plugins.config.canvas.snapToGrid']])
        expect(movedPathsIn(withMovedPaths(raw, table), table)).toEqual([])
    })

    it('moves each old path once', () => {
        const from = LEGACY_PATHS.map(([f]) => f)
        expect(new Set(from).size).toBe(from.length)
    })
})

describe('withoutAt', () => {
    it('removes a path and the objects it leaves empty', () => {
        expect(withoutAt({a: {b: {c: 1}}, d: 2}, 'a.b.c')).toEqual({d: 2})
        expect(withoutAt({a: {b: 1, c: 2}}, 'a.b')).toEqual({a: {c: 2}})
        expect(withoutAt({a: 1}, 'x.y')).toEqual({a: 1})
    })
})
