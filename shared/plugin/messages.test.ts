import {describe, expect, it} from 'vitest'
import type {PluginManifest} from './manifest'
import {checkPluginMessages, messagesFor} from './messages'

const en = {plugins: {graph: {view: 'Graph', depth: 'Depth {n}'}}}
const zh = {plugins: {graph: {view: '关系图', depth: '深度 {n}'}}}
const manifest: Pick<PluginManifest, 'config'> = {
    config: {schema: [{key: 'depth', type: 'number', label: 'plugins.graph.depth', default: 1}]},
}

describe('checkPluginMessages', () => {
    it('takes strings under plugins.<id>, the same keys and params in every locale, and what the manifest names', () => {
        expect(checkPluginMessages('graph', {en, 'zh-CN': zh}, manifest)).toEqual([])
        expect(checkPluginMessages('graph', {}, {})).toEqual([])
    })

    it('says what is wrong', () => {
        expect(checkPluginMessages('graph', {en: {plugins: {graph: {view: 'Graph'}}, app: {title: 'Mine'}}}, manifest)).toEqual([
            'en.json: "app.title" isn\'t under "plugins.graph"',
            'en.json has no "plugins.graph.depth", which plugin.json names',
        ])
        expect(checkPluginMessages('graph', {'en': en, 'zh-CN': {plugins: {graph: {view: '关系图', depth: '深度', extra: 'x'}}}})).toEqual([
            'zh-CN.json has "plugins.graph.extra", which en.json doesn\'t',
            'zh-CN.json: "plugins.graph.depth" takes other {params} than en.json\'s',
        ])
        expect(checkPluginMessages('graph', {'zh-CN': zh}, manifest, ['en', 'zh-CN'])).toEqual(['no en.json', 'no en.json'].slice(1))
        expect(checkPluginMessages('graph', {}, manifest)).toEqual(['no en.json'])
    })
})

describe('messagesFor', () => {
    it("merges only the plugin's own strings, a locale's over English", () => {
        const files = {'en': {...en, app: {title: 'Mine'}}, 'zh-CN': {plugins: {graph: {view: '关系图'}, other: {x: 'y'}}}}
        expect(messagesFor('graph', files, ['en', 'zh-CN', 'fr'])).toEqual({
            'en': en,
            'zh-CN': {plugins: {graph: {view: '关系图', depth: 'Depth {n}'}}},
            'fr': en,
        })
        expect(messagesFor('graph', {}, ['en'])).toEqual({})
    })
})
