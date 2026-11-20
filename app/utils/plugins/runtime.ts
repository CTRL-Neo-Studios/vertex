import {computed, shallowRef, watch} from 'vue'
import {listen} from '@tauri-apps/api/event'
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow'
import {pluginConfig} from '#shared/plugin/config'
import {pluginWindowFromLabel, sessionUuidFromLabel, WindowLabel} from '#shared/constants/app'
import type {ContributionPoints, SessionContext} from '#shared/plugin/api'
import type {WindowKind} from '#shared/plugin/manifest'
import {pluginEnabled} from '#shared/plugin/resolve'
import {getAt, withAt, withoutAt} from '#shared/utils/settings/paths'
import type {AppSettingPath} from '#shared/utils/settings/scopes'
import {registerCommand} from '~/utils/commands'
import {
    codeBlocks, editorExtensions, embeds, fileMenuItems, fileTypes, fileViewers, homeActions, linkExtractors, markdownSyntax,
    noteMenuItems, overlays, paletteGroups, paneRules, pluginWindowDefs, settingsPages, slashItems, statusItems, tabKinds, toolbarItems,
} from '~/utils/contributions'
import {registerPanelView} from '~/utils/panelViews'
import {loadInstalledPlugins, missingPlugins, pluginEntries, workspacePlugins} from '~/utils/plugins/catalog'
import {pluginAssetUrl} from '~/utils/fileUrl'
import {useAppSettings} from '~/composables/app/useAppSettings'
import {useSettingsScope} from '~/composables/app/useSettingsScope'
import {useTrust} from '~/composables/app/useTrust'
import useQuickToasts from '~/composables/utility/useQuickToasts'
import {createPluginHost, type PluginHost} from '~/utils/plugins/host'
import {hostServices} from '~/utils/plugins/services'

/** One host per window: each window is its own JavaScript realm. */
let host: PluginHost | undefined
/** Reactive: tabs and views restored before the session starts draw once it does. */
const session = shallowRef<SessionContext>()
/** Writes the session window's pending state, before a reload. */
let flushSession: () => Promise<unknown> = async () => {}
/** Which plugin registered a definition, for `PluginMount`'s error message. */
const owners = new WeakMap<object, string>()

/** The name of the plugin that registered `def`; `undefined` for the kernel's own. */
export function contributionOwner(def: object): string | undefined {
    const id = owners.get(def)
    return id && (pluginEntries().find(e => e.manifest.id === id)?.manifest.name ?? id)
}

/** The id of the plugin that registered `def`; `undefined` for the kernel's own. */
export const contributionPlugin = (def: object): string | undefined => owners.get(def)

/** Where each contribution point's definitions go. */
const REGISTRIES: { [P in keyof ContributionPoints]: (def: ContributionPoints[P]) => () => void } = {
    command: registerCommand,
    paletteGroup: paletteGroups.register,
    panel: registerPanelView,
    overlay: overlays.register,
    paneRule: paneRules.register,
    tabKind: tabKinds.register,
    viewer: fileViewers.register,
    statusItem: statusItems.register,
    fileType: fileTypes.register,
    fileMenuItem: fileMenuItems.register,
    settingsPage: settingsPages.register,
    homeAction: homeActions.register,
    codeBlock: codeBlocks.register,
    embed: embeds.register,
    editorExtension: editorExtensions.register,
    markdownSyntax: markdownSyntax.register,
    slashItem: slashItems.register,
    toolbarItem: toolbarItems.register,
    noteMenuItem: noteMenuItems.register,
    linkExtractor: linkExtractors.register,
    pluginWindow: pluginWindowDefs.register,
}

/** Which kind of window a label names; `undefined` for windows without plugins (About). */
export function windowKindOf(label: string): WindowKind | 'plugin' | undefined {
    if (label === WindowLabel.main) return 'main'
    if (label === WindowLabel.settings) return 'settings'
    if (sessionUuidFromLabel(label)) return 'session'
    if (pluginWindowFromLabel(label)) return 'plugin'
}

/**
 * Starts this window's plugins and follows the user's on/off from then on. Called by `initialize.client.ts` once the
 * settings and their scope are loaded, so the first activation already sees the right ones.
 */
export async function startPlugins(t: (key: string, params?: Record<string, unknown>) => string) {
    const label = getCurrentWebviewWindow().label
    const kind = windowKindOf(label)
    if (!kind) return
    const toasts = useQuickToasts()
    const appSettings = useAppSettings()
    const scope = useSettingsScope()
    const trust = useTrust()
    // The Settings window edits other scopes; its own plugins follow the global settings, as a plugin's window does.
    const settings = kind === 'settings' || kind === 'plugin' ? appSettings.config : scope.effective
    // A plugin's own window runs its plugin alone, on while its session window runs it (the kernel's grant says so).
    const owner = pluginWindowFromLabel(label)?.plugin
    const enabled = () => (owner ? {[owner]: true} : settings.value?.plugins.enabled ?? {})
    /** A session window's workspace, the one a plugin's `workspace` config writes go to. */
    const workspace = () => (kind === 'session' ? scope.root.value : null)
    const nuxtApp = useNuxtApp()
    // A session window runs its workspace's accepted plugins; the Settings window knows those of the one it edits; a
    // plugin's window loads its session's copy of its plugin (the kernel puts that workspace in its URL).
    const listed = () => (kind === 'settings' ? scope.root.value : kind === 'plugin' ? new URL(location.href).searchParams.get('root') : workspace())
    const runsWorkspace = kind === 'session' || kind === 'plugin'
    const listInstalled = () => loadInstalledPlugins(nuxtApp.vueApp, nuxtApp.$i18n, listed(), runsWorkspace).catch(e => console.error('[plugins] the installed plugins:', e))
    const i18n = nuxtApp.$i18n
    /** `ctx.i18n`: the app's strings, a plugin's own among them (`loadInstalledPlugins` merges them). */
    const strings = {
        t: (key: string, params?: Record<string, unknown>) => i18n.t(key, params ?? {}),
        get locale() {
            return i18n.locale.value
        },
    }
    // The main window and a plugin's own window have no workspace, and no trust to read.
    if (kind !== 'main' && kind !== 'plugin') await trust.load()
    await listInstalled()
    const entries = () => (owner ? pluginEntries().filter(e => e.manifest.id === owner) : pluginEntries())

    host = createPluginHost(entries(), {
        window: {kind, label},
        contribute(point, owner, def) {
            owners.set(def, owner)
            return REGISTRIES[point](def)
        },
        config(manifest) {
            const id = manifest.id
            const at = (path: string) => `plugins.config.${id}.${path}` as AppSettingPath
            const current = computed(() => pluginConfig(manifest, getAt(settings.value, `plugins.config.${id}`)))
            return {
                get value() {
                    return current.value
                },
                async set(patch, target = 'global') {
                    const entries = Object.entries(patch).map(([path, v]) => [at(path), v] as const)
                    if (target === 'workspace') {
                        if (!workspace()) throw new Error(`${id}: this window has no workspace to write to`)
                        const refused = entries.filter(([path]) => !scope.overridable(path)).map(([path]) => path)
                        if (refused.length) throw new Error(`${id}: a workspace can't override ${refused.join(', ')}`)
                        await scope.set(Object.fromEntries(entries))
                        return
                    }
                    const next = entries.reduce((s, [path, v]) => (v === null ? withoutAt(s, path) : withAt(s, path, v)), appSettings.config.value!)
                    if (!(await appSettings.save(next))) throw new Error(`${id}: the settings couldn't be saved`)
                },
                overridden: path => !!workspace() && scope.overridden(at(path)),
            }
        },
        services: (manifest, own) => hostServices(manifest, workspace(), own, {trust, i18n: strings}),
        openSettings: path => appSettings.createOrFocusSettingsWindow(workspace(), `/settings/${path}`),
        assetUrl: pluginAssetUrl,
        onFailed(manifest, error) {
            console.error(`[plugins] ${manifest.id} failed:`, error)
            toasts.error(t('app.plugins.failed', {name: manifest.name}), error instanceof Error ? error.message : String(error))
        },
    })
    // Every way into the host runs in the Nuxt app's context, so a plugin's `setup` and `onSession` callbacks may use
    // Nuxt's composables, also when a settings change turns one on later.
    inApp = fn => nuxtApp.runWithContext(fn)
    const apply = () => nuxtApp.runWithContext(() => host!.apply(manifest => pluginEnabled(manifest, enabled())))
    await apply()
    // A plugin's window doesn't follow on and off, installs or updates: it closes with its session window.
    if (kind === 'plugin') return
    watch(() => JSON.stringify(enabled()), () => void apply())
    const running = (id: string) => ['active', 'failed'].includes(host!.states.get(id)?.status ?? '')
    const copies = () => new Map(pluginEntries().map(e => [e.manifest.id, e.source]))
    let started = copies()
    /**
     * Lists the plugins again (an install or removal, a trust change, another workspace edited in Settings). A running
     * plugin whose copy changed (the workspace's accepted, or no longer) reloads the window, its session written first;
     * else the host knows the list from now on and may turn one on.
     */
    async function relist() {
        await listInstalled()
        const now = copies()
        if ([...started].some(([id, source]) => running(id) && now.has(id) && now.get(id) !== source)) {
            await flushSession()
            location.reload()
            return
        }
        started = now
        host!.setEntries(pluginEntries())
        await apply()
        askAboutWorkspace()
    }
    await listen('vertex://plugins-changed', () => void relist())
    watch(trust.records, () => void relist())
    if (kind === 'settings') watch(scope.root, () => void relist())
    // A plugin's files were replaced (a folder install copied again, an update): the windows running that copy reload,
    // their session written first.
    await listen<{ id: string, root?: string | null }>('vertex://plugin-updated', async ({payload}) => {
        const source = pluginEntries().find(e => e.manifest.id === payload.id)?.source
        if (!running(payload.id) || (payload.root ? payload.root !== workspace() || source !== 'workspace' : source !== 'global')) return
        await flushSession()
        location.reload()
    })

    /** A session window says once which of its workspace's plugins it would run but can't yet: new or changed ones, and missing ones. */
    const asked = new Set<string>()
    function askAboutWorkspace() {
        const root = workspace()
        if (!root) return
        const pending = workspacePlugins().filter(p => p.manifest && !p.listed.accepted && pluginEnabled({...p.manifest, enabledByDefault: false}, enabled())
            && !asked.has(`${p.listed.id}:${p.listed.hash}`))
        if (pending.length && scope.trusted.value) {
            for (const p of pending) asked.add(`${p.listed.id}:${p.listed.hash}`)
            toasts.warning(t('app.plugins.workspaceChanged', {count: pending.length}), pending.map(p => p.manifest!.name).join(', '), [
                {label: t('app.plugins.review'), onClick: () => void trust.acceptPlugins(root, pending)},
            ])
        }
        const missing = missingPlugins(scope.local.value.plugins?.enabled).filter(id => !asked.has(`missing:${id}`))
        if (missing.length) {
            for (const id of missing) asked.add(`missing:${id}`)
            toasts.warning(t('app.plugins.workspaceMissing', {count: missing.length}), missing.join(', '), [
                {label: t('app.plugins.review'), onClick: () => void appSettings.createOrFocusSettingsWindow(root, '/settings/plugins')},
            ])
        }
    }
    askAboutWorkspace()
    // An automatic check found updates: the main and session windows say so once per check; Settings → Plugins lists them.
    if (kind !== 'settings') {
        await listen<{ id: string }[]>('vertex://plugin-updates', ({payload}) => {
            if (!payload.length || !appSettings.config.value?.plugins.checkUpdates) return
            const names = payload.map(u => pluginEntries().find(e => e.manifest.id === u.id)?.manifest.name ?? u.id).join(', ')
            toasts.success(t('app.plugins.updatesWaiting', {count: payload.length}), names, [
                {label: t('app.plugins.review'), onClick: () => void appSettings.createOrFocusSettingsWindow(workspace(), '/settings/plugins')},
            ])
        })
    }
}

/** Runs host calls from outside the Nuxt context (the session layout's `onMounted` after an `await`) inside it. */
let inApp: (fn: () => unknown) => unknown = fn => fn()

/** The session layout's side of the host: its session is ready, or ending. */
export const pluginSessions = {
    /** The session is ready; `flush` writes its pending state (before a plugin's update reloads the window). */
    start(context: SessionContext, flush: () => Promise<unknown>) {
        session.value = context
        flushSession = flush
        inApp(() => host?.startSession(context))
    },
    end() {
        session.value = undefined
        inApp(() => host?.endSession())
    },
}

/**
 * This window's session as plugins get it (`SessionContext`), for what draws their UI (tabs, views); `undefined` outside
 * one and until it starts. Reactive.
 */
export const pluginSession = (): SessionContext | undefined => session.value

/** Each plugin's state in this window, for Settings → Plugins. */
export const pluginStates = () => host?.states
