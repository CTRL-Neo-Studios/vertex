import {emitTo} from "@tauri-apps/api/event";
import {defaultAppSettings} from "#shared/utils/defaults/apps";
import type {AppSettings} from "#shared/types/app/settings";
import type {DeepPartial} from "#shared/types/types";
import {StateKey, WindowLabel} from "#shared/constants/app";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {stateClient} from "~/utils/stateClient";

/** Sent to an open Settings window with the scope (workspace root, or `null` for User) to switch to. */
export const SETTINGS_SCOPE_EVENT = 'vertex://settings-scope'
/** Sent to an open Settings window with the page (path) to show. */
export const SETTINGS_ROUTE_EVENT = 'vertex://settings-route'

/**
 * Per-window mirror of app settings. Rust (src-tauri/src/state.rs) is the only writer of settings.json
 * and broadcasts every change, so all windows converge on the latest saved value without re-reading disk.
 */
export function useAppSettings() {
    const config = useState<AppSettings | null>(StateKey.settings, () => null)
    const isLoaded = useState<boolean>(StateKey.settingsLoaded, () => false)
    const $win = useAppWebviewWindows()

    async function load() {
        if (isLoaded.value) return unref(config)
        try {
            const stored = await stateClient.getSettings()
            config.value = defaultAppSettings(stored ?? undefined)
            // First launch, or a file that still needs migrating to the current shape. Rust reads `aiConfig`
            // (AI requests are checked against its providers), so the seeded one must reach the file too.
            if (!stored || !('recoverSessions' in stored) || !('aiConfig' in stored)) await stateClient.setSettings(config.value)
        } catch (error) {
            console.error("[useAppSettings] failed to load settings:", error)
            config.value = defaultAppSettings()
        } finally {
            isLoaded.value = true
        }
        return unref(config)
    }

    /**
     * Subscribe once per window (called from the init plugin). Broadcasts equal to the local value are this
     * window's own save echoing back; ignoring them keeps deep `watch(config…, save)` from looping.
     */
    function listen() {
        return stateClient.onSettingsChanged(s => {
            const next = defaultAppSettings(s)
            if (JSON.stringify(next) !== JSON.stringify(config.value)) config.value = next
        })
    }

    /** Update in memory only; call `save()` to persist and broadcast. */
    function set(data: DeepPartial<AppSettings>) {
        if (config.value) config.value = defaultAppSettings({...unref(config), ...data})
    }

    async function save(data?: DeepPartial<AppSettings>): Promise<boolean> {
        if (!config.value) {
            console.warn("[useAppSettings] save() before load(); skipped")
            return false
        }
        if (data) set(data)
        try {
            await stateClient.setSettings(config.value)
            return true
        } catch (error) {
            console.error("[useAppSettings] failed to save settings:", error)
            return false
        }
    }

    /**
     * `scope`: a workspace root to open on (`null` = User); `path`: the Settings page to show (default: its first). An
     * open Settings window switches to both.
     */
    async function createOrFocusSettingsWindow(scope: string | null = null, path?: string) {
        if (await $win.getAppWindowWithLabel(WindowLabel.settings)) {
            await $win.showWindowWithLabel(WindowLabel.settings)
            await emitTo(WindowLabel.settings, SETTINGS_SCOPE_EVENT, scope)
            if (path) await emitTo(WindowLabel.settings, SETTINGS_ROUTE_EVENT, path)
            return
        }
        await $win.openAppWindow({kind: 'settings', path, scope})
    }

    async function createOrFocusAboutWindow() {
        if (await $win.getAppWindowWithLabel(WindowLabel.about)) {
            await $win.showWindowWithLabel(WindowLabel.about)
            return
        }
        await $win.openAppWindow({kind: 'about'})
    }

    return {
        config,
        isLoaded,
        load,
        listen,
        set,
        save,
        createOrFocusSettingsWindow,
        createOrFocusAboutWindow,
    }
}
