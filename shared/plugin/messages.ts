/**
 * A plugin's strings: one file per locale (`en.json`, `zh-CN.json`), each `{"plugins": {"<id>": {…}}}`, the same
 * shape a core plugin's layer has in `i18n/locales/`. A community plugin ships them in `locales/` beside `main.js`;
 * the host merges only `plugins.<id>`, so a plugin's strings can't replace the app's or another plugin's.
 */
import type {PluginManifest} from './manifest'

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** A messages object's strings by dotted key (`plugins.graph.view`); a value that isn't an object or a string is skipped. */
export function messageLeaves(messages: unknown, prefix = ''): Map<string, string> {
    const out = new Map<string, string>()
    if (!isObject(messages)) return out
    for (const [key, value] of Object.entries(messages)) {
        const at = prefix ? `${prefix}.${key}` : key
        if (isObject(value)) for (const [k, v] of messageLeaves(value, at)) out.set(k, v)
        else if (typeof value === 'string') out.set(at, value)
    }
    return out
}

const params = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

/** The i18n keys a manifest names: its settings schema's labels, descriptions and options. */
export function manifestKeys(manifest: Pick<PluginManifest, 'config'>): string[] {
    return (manifest.config?.schema ?? []).flatMap(field =>
        [field.label, field.description, ...(field.type === 'select' ? field.options.map(o => o.label) : [])].filter((k): k is string => !!k))
}

/**
 * What's wrong with plugin `id`'s strings, `files` by locale (`en`, `zh-CN`): each file is an object of strings,
 * all under `plugins.<id>`; `en` is there, and every other locale has exactly its keys, with the same `{params}`;
 * `en` has every key the manifest names. `locales`: the locales there must be a file for (a core plugin's are the
 * app's; a community plugin's others fall back to `en`). Empty when nothing is.
 */
export function checkPluginMessages(id: string, files: Readonly<Record<string, unknown>>, manifest?: Pick<PluginManifest, 'config'>, locales: readonly string[] = []): string[] {
    const errors: string[] = []
    const prefix = `plugins.${id}.`
    for (const locale of locales) if (!(locale in files)) errors.push(`no ${locale}.json`)
    const leaves = Object.fromEntries(Object.entries(files).map(([locale, messages]) => {
        if (!isObject(messages)) errors.push(`${locale}.json isn't an object`)
        const strings = messageLeaves(messages)
        for (const key of strings.keys()) if (!key.startsWith(prefix)) errors.push(`${locale}.json: "${key}" isn't under "${prefix.slice(0, -1)}"`)
        return [locale, strings]
    }))
    const en = leaves.en
    if (!en) {
        if (!locales.includes('en') && (Object.keys(files).length || manifest && manifestKeys(manifest).length)) errors.push('no en.json')
        return errors
    }
    for (const [locale, strings] of Object.entries(leaves)) {
        if (locale === 'en') continue
        for (const key of en.keys()) if (!strings.has(key)) errors.push(`${locale}.json has no "${key}"`)
        for (const key of strings.keys()) if (!en.has(key)) errors.push(`${locale}.json has "${key}", which en.json doesn't`)
        for (const [key, text] of en) {
            const other = strings.get(key)
            if (other !== undefined && params(other).join() !== params(text).join()) errors.push(`${locale}.json: "${key}" takes other {params} than en.json's`)
        }
    }
    for (const key of manifest ? manifestKeys(manifest) : []) if (!en.has(key)) errors.push(`en.json has no "${key}", which plugin.json names`)
    return errors
}

function merged(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
    const out = {...base}
    for (const [key, value] of Object.entries(over)) out[key] = isObject(value) && isObject(out[key]) ? merged(out[key], value) : value
    return out
}

/**
 * What the app merges for plugin `id` in each of its `locales`: only `plugins.<id>` of the plugin's files, a locale's
 * strings over `en`'s, so a missing locale or key shows English. A locale with no strings is left out.
 */
export function messagesFor(id: string, files: Readonly<Record<string, unknown>>, locales: readonly string[]): Record<string, Record<string, unknown>> {
    const own = (messages: unknown) => {
        const tree = isObject(messages) && isObject(messages.plugins) ? messages.plugins[id] : undefined
        return isObject(tree) ? tree : {}
    }
    const out: Record<string, Record<string, unknown>> = {}
    for (const locale of locales) {
        const strings = merged(own(files.en), locale === 'en' ? {} : own(files[locale]))
        if (Object.keys(strings).length) out[locale] = {plugins: {[id]: strings}}
    }
    return out
}
