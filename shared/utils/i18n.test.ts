import {baseCompile} from '@intlify/message-compiler'
import {describe, expect, it} from 'vitest'
import type {PluginManifest} from '#shared/plugin/manifest'
import {checkPluginMessages, messageLeaves} from '#shared/plugin/messages'
import {resolveLocale} from './locale'

// Bundled by Vite at test time, so no Node fs/path types are needed under the app tsconfig.
const appFiles = import.meta.glob<Record<string, unknown>>('../../i18n/locales/*.json', {eager: true, import: 'default'})
const layerFiles = import.meta.glob<Record<string, unknown>>('../../layers/*/i18n/locales/*.json', {eager: true, import: 'default'})
const manifests = import.meta.glob<PluginManifest>('../../layers/*/plugin.json', {eager: true, import: 'default'})

/** `app`, and each plugin layer by id → locale → messages. */
const catalogs = new Map<string, Record<string, Record<string, unknown>>>()
for (const [path, data] of [...Object.entries(appFiles), ...Object.entries(layerFiles)]) {
    const catalog = /layers\/([^/]+)\//.exec(path)?.[1] ?? 'app'
    catalogs.set(catalog, {...catalogs.get(catalog), [path.split('/').pop()!.replace(/\.json$/, '')]: data})
}
const appLocales = Object.keys(catalogs.get('app')!).sort()

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('app strings', () => {
    const files = catalogs.get('app')!
    const en = messageLeaves(files.en)
    const others = Object.keys(files).filter(f => f !== 'en')

    it.each(others)('%s has exactly the same keys as en', (locale) => {
        expect([...messageLeaves(files[locale]).keys()].sort()).toEqual([...en.keys()].sort())
    })

    it.each(others)('%s uses the same interpolation params as en', (locale) => {
        const other = messageLeaves(files[locale])
        for (const [key, text] of en) expect(params(other.get(key) ?? ''), key).toEqual(params(text))
    })
})

// The rule community plugins' strings are held to when they're built (the SDK's preset), plus every app locale.
describe.each([...catalogs.keys()].filter(c => c !== 'app'))('%s plugin strings', (id) => {
    it('has a file per app locale, the same keys and params in each, under plugins.<id>, and what its manifest names', () => {
        const manifest = Object.entries(manifests).find(([path]) => path.includes(`/layers/${id}/`))?.[1]
        expect(checkPluginMessages(id, catalogs.get(id)!, manifest, appLocales)).toEqual([])
    })
})

// vue-i18n reads `{`, `}`, `@` and `|` as syntax; one string it can't compile (`{ … }` in an example) left every key of
// its locale showing as a key in the Settings window. Each string, of the app and every layer, must compile.
describe('every string', () => {
    const strings = [...catalogs].flatMap(([catalog, files]) => Object.entries(files)
        .flatMap(([locale, messages]) => [...messageLeaves(messages)].map(([key, text]) => ({at: `${catalog} ${locale} ${key}`, text}))))

    it('compiles as vue-i18n reads it', () => {
        const broken = strings.flatMap(({at, text}) => {
            const errors: string[] = []
            baseCompile(text, {onError: error => void errors.push(error.message)})
            return errors.length ? [`${at}: ${errors.join('; ')}`] : []
        })
        expect(strings.length).toBeGreaterThan(1000)
        expect(broken).toEqual([])
    })
})

describe('resolveLocale', () => {
    const available = ['en', 'zh-CN']
    it('explicit setting wins', () => expect(resolveLocale('zh-CN', available, ['en-US'])).toBe('zh-CN'))
    it('system matches by language prefix', () => expect(resolveLocale('system', available, ['zh-Hans-CN', 'en'])).toBe('zh-CN'))
    it('system falls through preferred languages in order', () => expect(resolveLocale('system', available, ['fr-FR', 'en-GB'])).toBe('en'))
    it('unknown setting falls back to system', () => expect(resolveLocale('de', available, ['zh-CN'])).toBe('zh-CN'))
    it('nothing matches → fallback', () => expect(resolveLocale('system', available, ['ja-JP'])).toBe('en'))
})
