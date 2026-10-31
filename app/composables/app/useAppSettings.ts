import {TauriEvent} from "@tauri-apps/api/event";
import {defaultAppSettings} from "#shared/utils/defaults/apps";
import type {AppSettings} from "#shared/types/app/settings";
import type {DeepPartial} from "#shared/types/types";
import {Routes, StateKey, WindowLabel} from "#shared/constants/app";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {stateClient} from "~/utils/stateClient";

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
            // First launch, or a legacy file that still needs migrating to the current shape.
            if (!stored || !('recoverSessions' in stored)) await stateClient.setSettings(config.value)
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

    async function createOrFocusSettingsWindow() {
        if (await $win.getAppWindowWithLabel(WindowLabel.settings)) {
            await $win.showWindowWithLabel(WindowLabel.settings)
            return
        }
        const settingsWindow = $win.createAppWebviewWindow(Routes.settings, WindowLabel.settings, 'Settings')
        // Settings has nothing to flush; let close proceed immediately.
        const unlisten = await settingsWindow.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async () => {
            unlisten()
            await settingsWindow.destroy()
        })
    }

    async function createOrFocusAboutWindow() {
        if (await $win.getAppWindowWithLabel(WindowLabel.about)) {
            await $win.showWindowWithLabel(WindowLabel.about)
            return
        }
        const aboutWindow = $win.createAppWebviewWindow(Routes.about, WindowLabel.about, undefined, {
            width: 420,
            height: 480,
            resizable: false,
            title: 'Vertex',
        })
        const unlisten = await aboutWindow.listen(TauriEvent.WINDOW_CLOSE_REQUESTED, async () => {
            unlisten()
            await aboutWindow.destroy()
        })
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
