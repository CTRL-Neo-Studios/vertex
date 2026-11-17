import {shallowRef, type App} from 'vue'
import {getVersion} from '@tauri-apps/api/app'
import {corePlugins} from '#build/core-plugins.mjs'
import type {PluginDefinition, PluginEntry} from '#shared/plugin/api'
import {checkPluginFolder, type PluginManifest} from '#shared/plugin/manifest'
import {messagesFor} from '#shared/plugin/messages'
import {vertexInvoke} from '~/utils/vertexInvoke'

/** Nuxt declares every generated template as an untyped module; `modules/core-plugins.ts` writes exactly this shape. */
const core: readonly PluginEntry[] = corePlugins

/** An installed plugin whose `plugin.json` doesn't validate: never loaded, listed on Settings → Plugins with why. */
export interface BrokenPlugin {
    id: string
    name?: string
    errors: string[]
}

/** Where an installed plugin was fetched from (Rust's `.install.json`); the same shape describes a stage's source. */
export interface InstallRecord {
    source: string
    /** The repository (`github.com/o/r`), the `.zip` URL, or the path. */
    origin: string
    kind: 'release' | 'branch' | 'tag' | 'commit' | 'zip' | 'file' | 'folder'
    /** The release tag, branch or tag. */
    name: string | null
    commit: string | null
    sha256: string | null
    version: string | null
    installedAt: number | null
}

/** Where an installed plugin is from: its record (none for one installed before records), and the origin of the repository its manifest names. */
export interface InstalledOrigin {
    record: InstallRecord | null
    claimed: string | null
}

/** What Rust's `plugins_list` returns: each plugin folder's manifest as it is, and where it's from. */
export interface Listed extends InstalledOrigin {
    id: string
    /** `workspace`: in the listed workspace's `.vertex/plugins/`. */
    scope: 'global' | 'workspace'
    manifest: unknown
    error: string | null
    /** A workspace's plugin: the hash of its files now, and the trust path accepting it pins. */
    hash: string | null
    pinPath: string | null
    /** A workspace's plugin: its folder is trusted and it's pinned with `hash`. */
    accepted: boolean
    /** Its strings by locale (`locales/<locale>.json`); `null` for a file that doesn't parse. */
    locales: Record<string, unknown>
}

/** What merging plugins' strings needs of the app's i18n (Nuxt's `$i18n`). */
export interface StringsTarget {
    availableLocales: readonly string[]
    mergeLocaleMessage(locale: string, messages: Record<string, unknown>): void
}

/** A workspace's plugin as this window knows it: valid (`manifest`) or not (`errors`), accepted or not. */
export interface WorkspacePlugin {
    listed: Listed
    manifest?: PluginManifest
    errors: string[]
}

interface PluginCode {
    code: string
    styles: string | null
    hash: string
}

/** A listed plugin checked as at install (`checkPluginFolder`): `errors` is empty when it may load. */
function checkListed(listed: Listed, appVersion: string, coreIds: ReadonlySet<string>): { manifest?: PluginManifest, errors: string[] } {
    const result = checkPluginFolder(listed.id, listed.manifest, listed.error, appVersion, coreIds)
    return result.ok ? {manifest: result.manifest, errors: []} : {errors: result.errors}
}

const global = shallowRef<readonly PluginEntry[]>([])
const broken = shallowRef<readonly BrokenPlugin[]>([])
const origins = shallowRef<Readonly<Record<string, InstalledOrigin>>>({})
const workspace = shallowRef<readonly WorkspacePlugin[]>([])
/** The workspace's accepted, valid plugins, as entries. */
const accepted = shallowRef<readonly PluginEntry[]>([])
/** Whether this window runs its workspace's plugins (a session window), or only knows them (Settings). */
const runsWorkspace = shallowRef(false)

/** `entries` with `own`'s replacing those of the same id, and the rest of `own` after them. */
const replaced = (entries: readonly PluginEntry[], own: readonly PluginEntry[]) =>
    [...entries.filter(e => !own.some(o => o.manifest.id === e.manifest.id)), ...own]

/**
 * Every plugin this window runs: the core plugins (`layers/*`), the installed ones, and in a session window its
 * workspace's accepted ones (each replacing an installed one with its id). Reactive.
 */
export const pluginEntries = (): readonly PluginEntry[] => replaced([...core, ...global.value], runsWorkspace.value ? accepted.value : [])

/**
 * The plugins a user can turn on and off and configure in this window's scope: the ones it runs, and in the Settings
 * window those of the workspace being edited, accepted. With where each is from, for the Settings nav's groups. Reactive.
 */
export const scopeEntries = (): readonly PluginEntry[] => replaced([...core, ...global.value], accepted.value)

/** `scopeEntries`' manifests: the source for the settings scopes (each `config.overridable`) and the plugins' settings pages. Reactive. */
export const pluginManifests = (): PluginManifest[] => scopeEntries().map(e => e.manifest)

export const pluginManifest = (id: string): PluginManifest | undefined => pluginManifests().find(m => m.id === id)

export const brokenPlugins = (): readonly BrokenPlugin[] => broken.value

/** Where an installed plugin is from. Reactive. */
export const installedOrigin = (id: string): InstalledOrigin | undefined => origins.value[id]

/** The plugins in the listed workspace's `.vertex/plugins/`, accepted or not, valid or not. Reactive. */
export const workspacePlugins = (): readonly WorkspacePlugin[] => workspace.value

/** The ids of `enabled` turned on that this device has nowhere: no core plugin, no installed one, none in the workspace. */
export function missingPlugins(enabled: Readonly<Record<string, boolean | undefined>> | undefined): string[] {
    const known = new Set([...core, ...global.value].map(e => e.manifest.id).concat(broken.value.map(b => b.id), workspace.value.map(p => p.listed.id)))
    return Object.entries(enabled ?? {}).filter(([id, on]) => on === true && !known.has(id)).map(([id]) => id)
}

/** Runs a plugin: its `styles.css` in a `<style data-plugin>`, then its `main.js` with the app's modules. */
async function loadCode(id: string, app: App, inWorkspace: boolean) {
    const {code, styles} = await vertexInvoke<PluginCode>('plugin_read', {id, workspace: inWorkspace})
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
 * Lists the installed plugins again, and `root`'s (at startup, when one is installed or removed, when trust changes).
 * Each manifest is checked with `checkListed`; an installed one that fails is broken. An installed plugin is off until
 * turned on. `runs`: this window runs `root`'s accepted plugins (a session window's workspace). The strings of each
 * plugin that may load go into `i18n` (`messagesFor`), the workspace's copy's over the installed one's.
 */
export async function loadInstalledPlugins(app: App, i18n: StringsTarget, root: string | null, runs: boolean): Promise<void> {
    const [listed, appVersion] = await Promise.all([vertexInvoke<Listed[]>('plugins_list', {root}), getVersion()])
    const coreIds = new Set(core.map(e => e.manifest.id))
    const entries: PluginEntry[] = []
    const failed: BrokenPlugin[] = []
    const own: WorkspacePlugin[] = []
    for (const item of listed) {
        const {manifest, errors} = checkListed(item, appVersion, coreIds)
        if (item.scope === 'workspace') {
            own.push({listed: item, manifest, errors})
            continue
        }
        if (!manifest) {
            const name = (item.manifest as { name?: unknown } | null)?.name
            failed.push({id: item.id, name: typeof name === 'string' ? name : undefined, errors})
            continue
        }
        entries.push({manifest: {...manifest, enabledByDefault: false}, source: 'global', load: () => loadCode(item.id, app, false)})
    }
    runsWorkspace.value = runs
    global.value = entries
    broken.value = failed
    workspace.value = own
    accepted.value = own.filter(p => p.manifest && p.listed.accepted).map(p => ({
        manifest: {...p.manifest!, enabledByDefault: false},
        source: 'workspace',
        load: () => loadCode(p.listed.id, app, true),
    }))
    origins.value = Object.fromEntries(listed.filter(i => i.scope === 'global').map(({id, record, claimed}) => [id, {record, claimed}]))
    const loadable = new Set([...entries, ...accepted.value].map(e => `${e.source}:${e.manifest.id}`))
    for (const item of listed.filter(i => loadable.has(`${i.scope}:${i.id}`))) {
        for (const [locale, messages] of Object.entries(messagesFor(item.id, item.locales, i18n.availableLocales))) i18n.mergeLocaleMessage(locale, messages)
    }
}

/** Workspace `root`'s plugins as they are now, each checked (`checkListed`): what trusting it, or accepting them, asks about. */
export async function listWorkspacePlugins(root: string): Promise<WorkspacePlugin[]> {
    const [listed, appVersion] = await Promise.all([vertexInvoke<Listed[]>('plugins_list', {root}), getVersion()])
    const coreIds = new Set(core.map(e => e.manifest.id))
    return listed.filter(i => i.scope === 'workspace').map(item => ({listed: item, ...checkListed(item, appVersion, coreIds)}))
}
