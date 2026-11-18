import type {RouteLocationRaw} from 'vue-router'
import type {SettingsIndexEntry} from '../../modules/lib/settingsIndex'
import {pluginSettingsRoute, PLUGIN_ICON, type NavPage, type NavPlugin} from '~/utils/settingsNav'

/** A Settings search result: a page, a section or a row, with its texts in the UI's language and in English. */
export interface SettingsSearchItem {
    id: string
    label: string
    suffix?: string
    /** Matched too, not shown: its texts in English (found by its English name in any language), and its info. */
    also: string
    icon?: string
    to: RouteLocationRaw
}

export interface SettingsSearchGroup {
    id: string
    label: string
    items: SettingsSearchItem[]
}

/**
 * Everything Settings search finds (Settings Plan, U7), grouped by page: the generated index (Vertex's pages, and the
 * core plugins' pages while their plugin registers them), each registered page and sub-entry, the schema fields of
 * the plugins on in the scope being edited, and every plugin by name (its row on Plugins: `?q=`). A result opens its
 * page with `find` (its row's or section's text) and `in` (its section's), which the Settings layout scrolls to.
 * `t` and `en` translate a key as the page draws it (a plain text stays itself).
 */
export function settingsSearchGroups(index: readonly SettingsIndexEntry[], input: {
    t: (key: string) => string
    en: (key: string) => string
    pages: readonly NavPage[]
    plugins: readonly NavPlugin[]
    base: string
}): SettingsSearchGroup[] {
    const {t, en, pages, plugins, base} = input
    const groups = new Map<string, SettingsSearchGroup>()
    const titles = new Map<string, string>()
    /** `title`: the page's, as a key: shown over its group and matched, so a plugin's name finds its settings. */
    const add = (page: string, title: string, item: { label: string, section?: string, description?: string, info?: string, icon?: string, to?: RouteLocationRaw }) => {
        if (!titles.has(page)) titles.set(page, title)
        const group = groups.get(page) ?? groups.set(page, {id: page, label: t(title), items: []}).get(page)!
        const label = t(item.label)
        const section = item.section && t(item.section)
        const id = `${page}|${section ?? ''}|${label}`
        if (group.items.some(i => i.id === id)) return
        const english = [item.label, item.section, item.description, item.info, titles.get(page)].filter(Boolean).map(key => en(key!))
        group.items.push({
            id,
            label,
            suffix: section || (item.description && t(item.description)),
            also: [...english, item.info && t(item.info), group.label].filter(Boolean).join(' '),
            icon: item.icon,
            to: item.to ?? {path: page, query: {find: label, ...(section && {in: section})}},
        })
    }

    const registered = new Set(pages.map(p => p.def.id))
    for (const entry of index) {
        // A plugin's page is there while its plugin registers it: one that's off isn't found by its settings.
        if (!entry.kernel && !registered.has(entry.page.slice(base.length + 1).split('/')[0]!)) continue
        add(entry.page, entry.title, entry)
    }
    const byId = new Map(plugins.map(p => [p.entry.manifest.id, p.entry.manifest]))
    for (const {def, owner} of pages) {
        const page = `${base}/${def.id}`
        add(page, def.label, {label: def.label, icon: def.icon ?? byId.get(owner ?? '')?.icon ?? PLUGIN_ICON, to: page})
        for (const child of def.children ?? []) add(`${page}/${child.path}`, child.label, {label: child.label, icon: child.icon, to: `${page}/${child.path}`})
    }
    for (const {entry: {manifest}, on} of plugins) {
        const fields = manifest.config?.schema ?? []
        const page = on && fields.length ? pluginSettingsRoute(manifest.id, pages, manifest, base) : undefined
        if (!page) continue
        for (const field of fields) {
            add(page, titles.get(page) ?? manifest.name, {label: field.label, section: 'app.settings.plugins.settings', description: field.description, info: field.info})
        }
    }
    for (const {entry: {manifest}} of plugins) {
        add(`${base}/plugins`, 'app.settings.plugins.title', {
            label: manifest.name,
            description: manifest.description,
            icon: manifest.icon ?? PLUGIN_ICON,
            to: {path: `${base}/plugins`, query: {q: manifest.name}},
        })
    }
    return [...groups.values()]
}
