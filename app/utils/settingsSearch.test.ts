import {describe, expect, it} from 'vitest'
import type {PluginManifest} from '#shared/plugin/manifest'
import type {SettingsPageDef} from '#shared/plugin/api'
import {settingsSearchGroups} from './settingsSearch'

const manifest = (id: string, extra: Partial<PluginManifest> = {}): PluginManifest => ({id, name: id.toUpperCase(), version: '1', apiVersion: 1, ...extra})
const schema = {config: {schema: [{key: 'x', type: 'switch' as const, label: 'x.label', default: true}]}}
const entry = (page: string, label: string, kernel: boolean) => ({page, title: `${page}.title`, label, kernel})

describe('settingsSearchGroups', () => {
    const search = (on: boolean, registered: boolean) => settingsSearchGroups(
        [entry('/settings/theme', 'theme.font', true), entry('/settings/chat', 'chat.mode', false)],
        {
            t: key => `«${key}»`,
            en: key => key,
            pages: registered ? [{def: {id: 'chat', label: 'chat.nav'} as SettingsPageDef, owner: 'chat'}] : [],
            plugins: [{entry: {manifest: manifest('chat', schema), source: 'core'}, on}],
            base: '/settings',
        },
    )
    const labels = (groups: ReturnType<typeof search>) => groups.flatMap(g => g.items.map(i => `${g.id} ${i.label}`))

    it("lists a plugin's page and fields while it's on, and its row on Plugins always", () => {
        expect(labels(search(true, true))).toEqual([
            '/settings/theme «theme.font»',
            '/settings/chat «chat.mode»',
            '/settings/chat «chat.nav»',
            '/settings/chat «x.label»',
            '/settings/plugins «CHAT»',
        ])
        expect(labels(search(false, false))).toEqual(['/settings/theme «theme.font»', '/settings/plugins «CHAT»'])
    })

    it('opens a row at its text in its section, and matches it by its page too', () => {
        const field = search(true, true).find(g => g.id === '/settings/chat')!.items.find(i => i.label === '«x.label»')!
        expect(field.to).toEqual({path: '/settings/chat', query: {find: '«x.label»', in: '«app.settings.plugins.settings»'}})
        expect(field.also).toContain('chat.title')
    })
})
