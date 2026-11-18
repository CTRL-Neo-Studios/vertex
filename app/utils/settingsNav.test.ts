import {describe, expect, it} from 'vitest'
import type {PluginManifest} from '#shared/plugin/manifest'
import type {PluginSource, SettingsPageDef} from '#shared/plugin/api'
import {pluginNavGroups, pluginSettingsRoute, type NavPage, type NavPlugin} from './settingsNav'

const manifest = (id: string, name: string, extra: Partial<PluginManifest> = {}): PluginManifest =>
    ({id, name, version: '1', apiVersion: 1, ...extra})
const schema = {config: {schema: [{key: 'x', type: 'switch' as const, label: 'k', default: true}]}}
const plugin = (m: PluginManifest, source: PluginSource, on = true): NavPlugin => ({entry: {manifest: m, source}, on})
const page = (def: Partial<SettingsPageDef> & { id: string, label: string }, owner?: string): NavPage => ({def: def as SettingsPageDef, owner})
const options = {t: (key: string) => key.toUpperCase(), locale: 'en', base: '/settings', path: '/settings/ai/models'}

describe('pluginNavGroups', () => {
    const plugins = [
        plugin(manifest('git', 'Git', {icon: 'i-git'}), 'core'),
        plugin(manifest('canvas', 'Canvas', schema), 'core'),
        plugin(manifest('chat', 'Chat', {...schema, icon: 'i-chat'}), 'core'),
        plugin(manifest('ai', 'AI', {icon: 'i-ai'}), 'core'),
        plugin(manifest('graph', 'Graph', schema), 'global'),
        plugin(manifest('mine', 'Mine', schema), 'workspace'),
        plugin(manifest('off', 'Off', schema), 'global', false),
    ]
    const pages = [
        page({id: 'git', label: 'git'}, 'git'),
        page({id: 'chat', label: 'chat'}, 'chat'),
        page({id: 'ai', label: 'ai', children: [{label: 'models', icon: 'i-box', path: 'models'}]}, 'ai'),
    ]
    const {core, community} = pluginNavGroups(pages, plugins, options)

    it("groups by where a plugin is from, sorted by label: one entry each, its registered page, else its schema page while it's on", () => {
        expect(core.map(i => i.label)).toEqual(['AI', 'Canvas', 'CHAT', 'GIT'])
        expect(community.map(i => [i.label, i.to])).toEqual([['Graph', '/settings/plugins/graph'], ['Mine', '/settings/plugins/mine']])
    })

    it("takes a page's icon from its plugin, else the puzzle piece, and opens the group the route is in", () => {
        const ai = core.find(i => i.label === 'AI')!
        expect(ai.icon).toBe('i-ai')
        expect(ai.defaultOpen).toBe(true)
        expect((ai.children as {active: boolean}[])[0]!.active).toBe(true)
        expect(core.find(i => i.label === 'Canvas')!.icon).toBe('i-lucide-puzzle')
    })

    it('sorts by the UI language', () => {
        const zh = pluginNavGroups([], [plugin(manifest('a', '画布', schema), 'core'), plugin(manifest('b', '编辑', schema), 'core')], {...options, locale: 'zh-CN'})
        expect(zh.core.map(i => i.label)).toEqual(['编辑', '画布'])
    })
})

describe('pluginSettingsRoute', () => {
    it("goes to a plugin's registered page, else its schema page", () => {
        expect(pluginSettingsRoute('ai', [page({id: 'ai', label: 'ai'}, 'ai')], {}, '/settings')).toBe('/settings/ai')
        expect(pluginSettingsRoute('canvas', [], schema, '/settings')).toBe('/settings/plugins/canvas')
        expect(pluginSettingsRoute('outline', [], {}, '/settings')).toBeUndefined()
    })
})
