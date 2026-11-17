import {shallowRef, type App} from 'vue'
import {getVersion} from '@tauri-apps/api/app'
import {corePlugins} from '#build/core-plugins.mjs'
import type {PluginDefinition, PluginEntry} from '#shared/plugin/api'
import {validateManifest, type PluginManifest} from '#shared/plugin/manifest'
import {vertexInvoke} from '~/utils/vertexInvoke'

/** Nuxt declares every generated template as an untyped module; `modules/core-plugins.ts` writes exactly this shape. */
const core: readonly PluginEntry[] = corePlugins

/** An installed plugin whose `plugin.json` doesn't validate: never loaded, listed on Settings → Plugins with why. */
export interface BrokenPlugin {
    id: string
    name?: string
    errors: string[]
}

/** What Rust's `plugins_list` returns: each installed folder's manifest as it is. */
interface Installed {
    id: string
    manifest: unknown
    error: string | null
}

interface PluginCode {
    code: string
    styles: string | null
    hash: string
}

const community = shallowRef<readonly PluginEntry[]>([])
const broken = shallowRef<readonly BrokenPlugin[]>([])

/** Every plugin this build and this device run: the core plugins (`layers/*`), then the installed ones. Reactive. */
export const pluginEntries = (): readonly PluginEntry[] => [...core, ...community.value]

/**
 * The plugins a user can turn on and off and configure. The source for the settings scopes (each manifest's
 * `config.overridable`) and Settings → Plugins. Reactive.
 */
export const pluginManifests = (): PluginManifest[] => pluginEntries().map(e => e.manifest)

export const pluginManifest = (id: string): PluginManifest | undefined => pluginEntries().find(e => e.manifest.id === id)?.manifest

export const brokenPlugins = (): readonly BrokenPlugin[] => broken.value

/** Runs an installed plugin: its `styles.css` in a `<style data-plugin>`, then its `main.js` with the app's modules. */
async function loadInstalled(id: string, app: App) {
    const {code, styles} = await vertexInvoke<PluginCode>('plugin_read', {id})
    if (styles) {
        const style = document.createElement('style')
        style.dataset.plugin = id
        style.textContent = styles
        document.head.append(style)
    }
    // Fetched only where a community plugin runs: the shared modules' chunk holds whole packages.
    const {importPluginCode} = await import('~/utils/plugins/community')
    // The host checks that the default export has a `setup`.
    return importPluginCode(code, app) as Promise<{ default: PluginDefinition }>
}

/**
 * Lists the installed plugins again (at startup, and when one is installed or removed). Each manifest is checked as
 * at install, against this app's version: one that fails, or whose folder isn't its id, or that takes a core plugin's
 * id, is broken. An installed plugin is off until turned on.
 */
export async function loadInstalledPlugins(app: App): Promise<void> {
    const [installed, appVersion] = await Promise.all([vertexInvoke<Installed[]>('plugins_list'), getVersion()])
    const entries: PluginEntry[] = []
    const failed: BrokenPlugin[] = []
    for (const {id, manifest, error} of installed) {
        const name = (manifest as { name?: unknown } | null)?.name
        const result = error ? {ok: false as const, errors: [error]} : validateManifest(manifest, appVersion)
        const errors = !result.ok ? result.errors
            : result.manifest.id !== id ? [`"id" is "${result.manifest.id}" but its folder is "${id}"`]
                : core.some(e => e.manifest.id === id) ? [`"${id}" is a core plugin's id`]
                    : []
        if (!result.ok || errors.length) {
            failed.push({id, name: typeof name === 'string' ? name : undefined, errors})
            continue
        }
        entries.push({manifest: {...result.manifest, enabledByDefault: false}, source: 'global', load: () => loadInstalled(id, app)})
    }
    community.value = entries
    broken.value = failed
}
