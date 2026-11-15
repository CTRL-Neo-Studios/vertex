import {describe, expect, it} from 'vitest'
import {API_VERSION, parseRequirement, pluginWindows, validateManifest} from './manifest'

const valid = {id: 'graph-view', name: 'Graph view', version: '1.0.0', apiVersion: API_VERSION}

describe('validateManifest', () => {
    it('accepts a minimal manifest and defaults its windows to session ones', () => {
        const result = validateManifest(valid)
        expect(result.ok).toBe(true)
        if (result.ok) expect(pluginWindows(result.manifest)).toEqual(['session'])
    })

    it('lists every problem at once', () => {
        const result = validateManifest({id: 'Graph_View', apiVersion: 0, windows: [], permissions: ['camera'], colour: 'red'})
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.errors).toHaveLength(7)
            expect(result.errors.join('\n')).toMatch(/unknown key "colour"/)
        }
    })

    it('refuses an API newer than this build', () => {
        const result = validateManifest({...valid, apiVersion: API_VERSION + 1})
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.errors[0]).toMatch(/newer than this Vertex supports/)
    })

    it('refuses a plugin that requires itself or an invalid id', () => {
        const result = validateManifest({...valid, requires: ['graph-view', 'Bad Id?']})
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.errors).toHaveLength(2)
    })

    it('keeps ids within Tauri plugin names (vertex-<id>, 64 characters)', () => {
        expect(validateManifest({...valid, id: 'a'.repeat(50)}).ok).toBe(true)
        expect(validateManifest({...valid, id: 'a'.repeat(51)}).ok).toBe(false)
        expect(validateManifest({...valid, id: 'trailing-'}).ok).toBe(false)
    })
})

describe('parseRequirement', () => {
    it('reads a trailing ? as optional', () => {
        expect(parseRequirement('ai?')).toEqual({id: 'ai', optional: true})
        expect(parseRequirement('ai')).toEqual({id: 'ai', optional: false})
    })
})
