import {watch} from 'vue'
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow'
import {corePlugins} from '#build/core-plugins.mjs'
import {sessionUuidFromLabel, WindowLabel} from '#shared/constants/app'
import type {SessionContext} from '#shared/plugin/api'
import type {WindowKind} from '#shared/plugin/manifest'
import {pluginEnabled} from '#shared/plugin/resolve'
import {registerCommand} from '~/utils/commands'
import {useAppSettings} from '~/composables/app/useAppSettings'
import {useSettingsScope} from '~/composables/app/useSettingsScope'
import useQuickToasts from '~/composables/utility/useQuickToasts'
import {createPluginHost, type PluginHost} from '~/utils/plugins/host'

/** One host per window: each window is its own JavaScript realm. */
let host: PluginHost | undefined
const beforeReload = new Set<() => unknown>()

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
    // The Settings window edits other scopes; its own plugins follow the global settings.
    const settings = kind === 'settings' ? useAppSettings().config : useSettingsScope().effective
    const enabled = () => settings.value?.plugins.enabled ?? {}

    host = createPluginHost(corePlugins, {
        window: {kind, label},
        registerCommand,
        onFailed(manifest, error) {
            console.error(`[plugins] ${manifest.id} failed:`, error)
            toasts.error(t('app.plugins.failed', {name: manifest.name}), error instanceof Error ? error.message : String(error))
        },
        async reload() {
            for (const flush of beforeReload) await flush()
            window.location.reload()
        },
    })
    const apply = () => host!.apply(manifest => pluginEnabled(manifest, enabled()))
    await apply()
    watch(() => JSON.stringify(enabled()), () => void apply())
}

/** The session layout's side of the host: its session is ready, or ending. */
export const pluginSessions = {
    start: (context: SessionContext) => host?.startSession(context),
    end: () => host?.endSession(),
}

/** Runs before a plugin's switch-off reloads the window (a session window saves its state first). */
export function onBeforePluginReload(flush: () => unknown) {
    beforeReload.add(flush)
    return () => beforeReload.delete(flush)
}

/** Each plugin's state in this window, for Settings → Plugins. */
export const pluginStates = () => host?.states
