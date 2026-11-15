import {describe, expect, it} from 'vitest'
import type {PluginManifest} from '#shared/plugin/manifest'
import {resolveLocale} from './locale'

// Bundled by Vite at test time, so no Node fs/path types are needed under the app tsconfig.
const appFiles = import.meta.glob<Record<string, unknown>>('../../i18n/locales/*.json', {eager: true, import: 'default'})
const layerFiles = import.meta.glob<Record<string, unknown>>('../../layers/*/i18n/locales/*.json', {eager: true, import: 'default'})
const manifests = import.meta.glob<PluginManifest>('../../layers/*/plugin.json', {eager: true, import: 'default'})

/** `app`, and each plugin layer by id → locale file name → messages. */
const catalogs = new Map<string, Record<string, Record<string, unknown>>>()
for (const [path, data] of [...Object.entries(appFiles), ...Object.entries(layerFiles)]) {
    const catalog = /layers\/([^/]+)\//.exec(path)?.[1] ?? 'app'
    catalogs.set(catalog, {...catalogs.get(catalog), [path.split('/').pop()!]: data})
}
const appLocales = Object.keys(catalogs.get('app')!).sort()

function leaves(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
    const out = new Map<string, string>()
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object') for (const [lk, lv] of leaves(v as Record<string, unknown>, key)) out.set(lk, lv)
        else out.set(key, String(v))
    }
    return out
}

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe.each([...catalogs.keys()])('%s strings', (catalog) => {
    const files = catalogs.get(catalog)!
    const en = leaves(files['en.json'] ?? {})
    const others = Object.keys(files).filter(f => f !== 'en.json')

    it('has a file for every locale the app has', () => {
        expect(Object.keys(files).sort()).toEqual(appLocales)
    })

    it.each(others)('%s has exactly the same keys as en.json', (file) => {
        expect([...leaves(files[file]!).keys()].sort()).toEqual([...en.keys()].sort())
    })

    it.each(others)('%s uses the same interpolation params as en.json', (file) => {
        const other = leaves(files[file]!)
        for (const [key, text] of en) expect(params(other.get(key) ?? ''), key).toEqual(params(text))
    })

    if (catalog !== 'app') {
        it('keeps its strings under plugins.<id>', () => {
            for (const key of en.keys()) expect(key.startsWith(`plugins.${catalog}.`), key).toBe(true)
        })

        it('has every string its settings schema names', () => {
            const manifest = Object.entries(manifests).find(([path]) => path.includes(`/layers/${catalog}/`))?.[1]
            for (const field of manifest?.config?.schema ?? []) {
                const keys = [field.label, field.description, ...(field.type === 'select' ? field.options.map(o => o.label) : [])]
                for (const key of keys) if (key) expect(en.has(key), key).toBe(true)
            }
        })
    }
})

describe('resolveLocale', () => {
    const available = ['en', 'zh-CN']
    it('explicit setting wins', () => expect(resolveLocale('zh-CN', available, ['en-US'])).toBe('zh-CN'))
    it('system matches by language prefix', () => expect(resolveLocale('system', available, ['zh-Hans-CN', 'en'])).toBe('zh-CN'))
    it('system falls through preferred languages in order', () => expect(resolveLocale('system', available, ['fr-FR', 'en-GB'])).toBe('en'))
    it('unknown setting falls back to system', () => expect(resolveLocale('de', available, ['zh-CN'])).toBe('zh-CN'))
    it('nothing matches → fallback', () => expect(resolveLocale('system', available, ['ja-JP'])).toBe('en'))
})
