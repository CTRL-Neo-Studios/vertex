import type {NavigationMenuItem} from '@nuxt/ui'
import type {PluginEntry, SettingsPageDef} from '#shared/plugin/api'

/** A plugin as the Settings nav sees it: its manifest, where it's from, and whether it's on in the scope being edited. */
export interface NavPlugin {
    entry: Pick<PluginEntry, 'manifest' | 'source'>
    on: boolean
}

/** A registered settings page (`ctx.settings.page`) and the plugin that registered it. */
export interface NavPage {
    def: SettingsPageDef
    owner: string | undefined
}

export interface NavGroups {
    core: NavigationMenuItem[]
    community: NavigationMenuItem[]
}

export const PLUGIN_ICON = 'i-lucide-puzzle'

/**
 * The plugins' part of the Settings nav (Plugin Architecture Plan, K6): Core plugins, and Community plugins (installed
 * ones and a workspace's own). A plugin's entry is the pages it registers, with their sub-entries, or else its schema
 * page while it's on; never both. A page's icon defaults to its plugin's, then the puzzle piece. Each group is sorted by
 * label in the UI's language. `base` is the Settings route; `path` the current one, to open the group it's in.
 */
export function pluginNavGroups(pages: readonly NavPage[], plugins: readonly NavPlugin[], options: {
    t: (key: string) => string
    locale: string
    base: string
    path: string
}): NavGroups {
    const {t, locale, base, path} = options
    const byId = new Map(plugins.map(p => [p.entry.manifest.id, p]))
    const groups: NavGroups = {core: [], community: []}
    const groupOf = (id: string | undefined) => (byId.get(id ?? '')?.entry.source ?? 'core') === 'core' ? groups.core : groups.community
    const iconOf = (id: string | undefined) => byId.get(id ?? '')?.entry.manifest.icon ?? PLUGIN_ICON

    for (const {def, owner} of pages) {
        const to = `${base}/${def.id}`
        const icon = def.icon ?? iconOf(owner)
        groupOf(owner).push(def.children
            ? {
                label: t(def.label),
                icon,
                defaultOpen: path.startsWith(to),
                // `active` by prefix: an item's own page (a provider's, a profile's) keeps its list highlighted.
                children: def.children.map(child => ({label: t(child.label), icon: child.icon, to: `${to}/${child.path}`, active: path.startsWith(`${to}/${child.path}`)})),
            }
            : {label: t(def.label), icon, to})
    }
    const registered = new Set(pages.map(p => p.owner))
    for (const {entry: {manifest}, on} of plugins) {
        if (!on || registered.has(manifest.id) || !manifest.config?.schema?.length) continue
        groupOf(manifest.id).push({label: manifest.name, icon: manifest.icon ?? PLUGIN_ICON, to: `${base}/plugins/${manifest.id}`})
    }
    const byLabel = (a: NavigationMenuItem, b: NavigationMenuItem) => String(a.label).localeCompare(String(b.label), locale)
    groups.core.sort(byLabel)
    groups.community.sort(byLabel)
    return groups
}

/** Where a plugin's settings are: its first registered page, else its schema page; `undefined` when it has neither. */
export function pluginSettingsRoute(id: string, pages: readonly NavPage[], manifest: Pick<PluginEntry['manifest'], 'config'> | undefined, base: string): string | undefined {
    const page = pages.find(p => p.owner === id)?.def
    if (page) return `${base}/${page.id}`
    return manifest?.config?.schema?.length ? `${base}/plugins/${id}` : undefined
}
