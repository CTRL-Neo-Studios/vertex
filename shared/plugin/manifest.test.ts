import {describe, expect, it} from 'vitest'
import {API_VERSION, checkPluginFolder, parseRequirement, pluginWindows, validateManifest} from './manifest'

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

    it('refuses a plugin that needs a later app than the one running', () => {
        const runs = (minAppVersion: string, app: string) => validateManifest({...valid, minAppVersion}, app).ok
        expect(runs('0.10.0', '0.9.2')).toBe(false)
        expect(runs('0.9', '0.9.2')).toBe(true)
        expect(runs('0.9.2', '0.9.2-beta.1')).toBe(true)
        expect(runs('1.0.0', '0.9.9')).toBe(false)
        expect(validateManifest({...valid, minAppVersion: 'soon'}).ok).toBe(false)
        // A pre-release names itself: later betas meet it, earlier ones don't, its release does.
        expect(runs('1.0.0-beta.2', '1.0.0-beta.1')).toBe(false)
        expect(runs('1.0.0-beta.2', '1.0.0-beta.10')).toBe(true)
        expect(runs('1.0.0-beta.1', '1.0.0-beta.1')).toBe(true)
        expect(runs('1.0.0-beta.2', '1.0.0')).toBe(true)
        expect(runs('1.0.0-rc.1', '1.0.0-beta.3')).toBe(false)
        expect(runs('1.0.0-beta', '1.0.0-beta.1')).toBe(true)
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

    it('takes windows of its own by id and size, and says what\'s wrong with others', () => {
        expect(validateManifest({...valid, ownWindows: [{id: 'list', width: 360, height: 560, minWidth: 280, resizable: true, bare: true}]}).ok).toBe(true)
        const result = validateManifest({...valid, ownWindows: [
            {id: 'list', width: 360, height: 560},
            {id: 'list', width: 50, height: 560},
            {id: 'Big One', width: 360, height: 'tall', title: 'x', bare: 'yes'},
        ]})
        expect(result.ok ? [] : result.errors).toEqual([
            '"ownWindows"[1].id "list" is declared twice',
            '"ownWindows"[1].width must be a number from 100 to 4000',
            '"ownWindows"[2] has unknown keys: title',
            '"ownWindows"[2].id must be lowercase letters, digits and inner hyphens',
            '"ownWindows"[2].height must be a number from 100 to 4000',
            '"ownWindows"[2].bare must be true or false',
        ])
    })

    it('accepts a config schema of every field type and an overridable map', () => {
        const result = validateManifest({...valid, icon: 'i-lucide-waypoints', config: {
            overridable: {depth: 'workspace', 'colors.tags': 'trustedWorkspace'},
            schema: [
                {key: 'on', type: 'switch', label: 'plugins.graph-view.on', default: true},
                {key: 'title', type: 'text', label: 'l', default: '', placeholder: 'p'},
                {key: 'colors.tags', type: 'color', label: 'l', default: '#ff0000'},
                {key: 'depth', type: 'number', label: 'l', default: 2, min: 1, max: 5, step: 1},
                {key: 'layout', type: 'select', label: 'l', default: 'force', options: [{value: 'force', label: 'l'}]},
                {key: 'hidden', type: 'list', label: 'l', default: ['a']},
                {key: 'templates', type: 'path', kind: 'folder', label: 'l', default: 'Templates'},
            ],
        }})
        expect(result).toMatchObject({ok: true})
    })

    it('refuses fields whose default, options or keys don\'t fit', () => {
        const result = validateManifest({...valid, config: {
            overridable: {'bad path': 'everyone'},
            schema: [
                {key: 'depth', type: 'number', label: 'l', default: 9, max: 5},
                {key: 'depth', type: 'switch', label: 'l', default: 'yes'},
                {key: 'layout', type: 'select', label: 'l', default: 'tree', options: [{value: 'force', label: 'l'}]},
                {key: 'p', type: 'path', label: 'l', default: '', colour: 'red'},
                {key: 'x', type: 'slider', label: 'l', default: 1},
            ],
        }})
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.errors).toEqual([
            '"config.overridable" has an invalid path "bad path"',
            '"config.overridable.bad path" must be "workspace" or "trustedWorkspace"',
            '"config.schema[0]".default must be within min and max',
            '"config.schema[1]".default must be true or false',
            '"config.schema[1].key" "depth" is used twice',
            '"config.schema[2]".default must be one of its options',
            '"config.schema[3]" has an unknown key "colour"',
            '"config.schema[3]".kind must be "file" or "folder"',
            '"config.schema[4]".type must be one of switch, text, color, number, select, list, path',
        ])
    })
})

describe('parseRequirement', () => {
    it('reads a trailing ? as optional', () => {
        expect(parseRequirement('ai?')).toEqual({id: 'ai', optional: true})
        expect(parseRequirement('ai')).toEqual({id: 'ai', optional: false})
    })
})

describe('checkPluginFolder', () => {
    const core = new Set(['files', 'bases'])
    const errors = (folder: string, raw: unknown, readError: string | null = null) => {
        const result = checkPluginFolder(folder, raw, readError, '1.0.0', core)
        return result.ok ? [] : result.errors
    }

    it('takes a folder named by its manifest\'s id, not a core plugin\'s', () => {
        expect(errors('graph-view', valid)).toEqual([])
        expect(errors('graph', valid)).toEqual(['"id" is "graph-view" but its folder is "graph"'])
        expect(errors('files', {...valid, id: 'files'})).toEqual(['"files" is a core plugin\'s id'])
    })

    it('refuses one that can\'t be read, doesn\'t validate, or needs a later Vertex', () => {
        expect(errors('graph-view', null, 'plugin.json: not found')).toEqual(['plugin.json: not found'])
        expect(errors('graph-view', {...valid, apiVersion: API_VERSION + 1})).toHaveLength(1)
        expect(errors('graph-view', {...valid, minAppVersion: '2.0.0'})).toHaveLength(1)
    })
})
