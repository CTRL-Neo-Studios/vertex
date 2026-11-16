import {computed, shallowRef, watch} from 'vue'
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow'
import {pluginConfig} from '#shared/plugin/config'
import {sessionUuidFromLabel, WindowLabel} from '#shared/constants/app'
import type {ContributionPoints, SessionContext} from '#shared/plugin/api'
import type {WindowKind} from '#shared/plugin/manifest'
import {pluginEnabled} from '#shared/plugin/resolve'
import {getAt, withAt, withoutAt} from '#shared/utils/settings/paths'
import type {AppSettingPath} from '#shared/utils/settings/scopes'
import {registerCommand} from '~/utils/commands'
import {
    codeBlocks, editorExtensions, embeds, fileMenuItems, fileTypes, fileViewers, homeActions, linkExtractors, markdownSyntax,
    noteMenuItems, paletteGroups, settingsPages, slashItems, statusItems, tabKinds, toolbarItems,
} from '~/utils/contributions'
import {registerPanelView} from '~/utils/panelViews'
import {isBuiltin, pluginEntries} from '~/utils/plugins/catalog'
import {useAppSettings} from '~/composables/app/useAppSettings'
import {useSettingsScope} from '~/composables/app/useSettingsScope'
import useQuickToasts from '~/composables/utility/useQuickToasts'
import {createPluginHost, type PluginHost} from '~/utils/plugins/host'

/** One host per window: each window is its own JavaScript realm. */
let host: PluginHost | undefined
const beforeReload = new Set<() => unknown>()
/** Reactive: tabs and views restored before the session starts draw once it does. */
const session = shallowRef<SessionContext>()
/** Which plugin registered a definition, for `PluginMount`'s error message. */
const owners = new WeakMap<object, string>()

/** The name of the plugin that registered `def`; `undefined` for the kernel's own. */
export function contributionOwner(def: object): string | undefined {
    const id = owners.get(def)
    return id && (pluginEntries().find(e => e.manifest.id === id)?.manifest.name ?? id)
}

/** Where each contribution point's definitions go. */
const REGISTRIES: { [P in keyof ContributionPoints]: (def: ContributionPoints[P]) => () => void } = {
    command: registerCommand,
    paletteGroup: paletteGroups.register,
    panel: registerPanelView,
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
}
/** Set across the reload a plugin's switch-off causes, so the reloaded window doesn't take focus. */
const QUIET_RELOAD = 'vertex-plugin-reload'

/** Whether this page load is a plugin switch-off's reload (answers once). */
export function isPluginReload() {
    const quiet = sessionStorage.getItem(QUIET_RELOAD) !== null
    sessionStorage.removeItem(QUIET_RELOAD)
    return quiet
}

/** Which kind of window a label names; `undefined` for windows without plugins (About). */
export function windowKindOf(label: string): WindowKind | undefined {
    if (label === WindowLabel.main) return 'main'
    if (label === WindowLabel.settings) return 'settings'
    if (sessionUuidFromLabel(label)) return 'session'
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
    // The Settings window edits other scopes; its own plugins follow the global settings.
    const settings = kind === 'settings' ? appSettings.config : scope.effective
    const enabled = () => settings.value?.plugins.enabled ?? {}
    /** A session window's workspace, the one a plugin's `workspace` config writes go to. */
    const workspace = () => (kind === 'session' ? scope.root.value : null)

    host = createPluginHost(pluginEntries(), {
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
        onFailed(manifest, error) {
            console.error(`[plugins] ${manifest.id} failed:`, error)
            toasts.error(t('app.plugins.failed', {name: manifest.name}), error instanceof Error ? error.message : String(error))
        },
        async reload() {
            for (const flush of beforeReload) await flush()
            sessionStorage.setItem(QUIET_RELOAD, '1')
            window.location.reload()
        },
    })
    // Every way into the host runs in the Nuxt app's context, so a plugin's `setup` and `onSession` callbacks may use
    // Nuxt's composables, also when a settings change turns one on later.
    const nuxtApp = useNuxtApp()
    inApp = fn => nuxtApp.runWithContext(fn)
    const apply = () => nuxtApp.runWithContext(() => host!.apply(manifest => isBuiltin(manifest.id) || pluginEnabled(manifest, enabled())))
    await apply()
    watch(() => JSON.stringify(enabled()), () => void apply())
}

/** Runs host calls from outside the Nuxt context (the session layout's `onMounted` after an `await`) inside it. */
let inApp: (fn: () => unknown) => unknown = fn => fn()

/** The session layout's side of the host: its session is ready, or ending. */
export const pluginSessions = {
    start(context: SessionContext) {
        session.value = context
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

/** Runs before a plugin's switch-off reloads the window (a session window saves its state first). */
export function onBeforePluginReload(flush: () => unknown) {
    beforeReload.add(flush)
    return () => beforeReload.delete(flush)
}

/** Each plugin's state in this window, for Settings → Plugins. */
export const pluginStates = () => host?.states
