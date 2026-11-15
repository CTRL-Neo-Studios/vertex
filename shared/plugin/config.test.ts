import {describe, expect, it} from 'vitest'
import type {PluginManifest} from './manifest'
import {pluginConfig} from './config'

const manifest: PluginManifest = {
    id: 'graph', name: 'Graph', version: '1', apiVersion: 1,
    config: {schema: [
        {key: 'showTags', type: 'switch', label: 'plugins.graph.showTags', default: true},
        {key: 'forces.depth', type: 'number', label: 'plugins.graph.depth', default: 2, min: 1, max: 5},
        {key: 'layout', type: 'select', label: 'plugins.graph.layout', default: 'force', options: [{value: 'force', label: 'a'}, {value: 'tree', label: 'b'}]},
        {key: 'hidden', type: 'list', label: 'plugins.graph.hidden', default: []},
        {key: 'templates', type: 'path', kind: 'folder', label: 'plugins.graph.templates', default: 'Templates'},
    ]},
}

describe('pluginConfig', () => {
    it('defaults every schema field that is missing', () => {
        expect(pluginConfig(manifest, undefined)).toEqual({showTags: true, forces: {depth: 2}, layout: 'force', hidden: [], templates: 'Templates'})
    })

    it('keeps valid values, replaces wrong ones, clamps numbers and passes keys outside the schema', () => {
        const stored = {showTags: 'yes', forces: {depth: 9, charge: -30}, layout: 'tree', hidden: ['a', 3], templates: '/T/', extra: {x: 1}}
        expect(pluginConfig(manifest, stored)).toEqual({showTags: true, forces: {depth: 5, charge: -30}, layout: 'tree', hidden: ['a'], templates: 'T', extra: {x: 1}})
    })
})
