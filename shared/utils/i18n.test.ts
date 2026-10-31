import {describe, expect, it} from 'vitest'
import {resolveLocale} from './locale'

// Bundled by Vite at test time, so no Node fs/path types are needed under the app tsconfig.
const files = import.meta.glob<Record<string, unknown>>('../../i18n/locales/*.json', {eager: true, import: 'default'})
const locales = Object.fromEntries(Object.entries(files).map(([path, data]) => [path.split('/').pop()!, data]))
const load = (f: string) => locales[f]!

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
const en = leaves(load('en.json'))
const others = Object.keys(locales).filter(f => f !== 'en.json')

describe.each(others)('%s', (file) => {
    const other = leaves(load(file))

    it('has exactly the same keys as en.json', () => {
        expect([...other.keys()].sort()).toEqual([...en.keys()].sort())
    })

    it('uses the same interpolation params as en.json', () => {
        for (const [key, text] of en) expect(params(other.get(key) ?? ''), key).toEqual(params(text))
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
