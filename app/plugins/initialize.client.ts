import {isPermissionGranted, requestPermission} from "@tauri-apps/plugin-notification";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppTheme} from "~/composables/app/useAppTheme";

/**
 * Runs once per window. Only wires services: every window mirrors the Rust-owned sessions/settings via
 * change events; the main window additionally recovers saved sessions. Anything that needs component
 * context (menus, toasts, the OS open queue) starts in app.vue.
 */
export default defineNuxtPlugin({
    name: 'initialize',
    async setup() {
        const $asesh = useAppSessions()
        const $win = useAppWebviewWindows()
        const $settings = useAppSettings()
        const $theme = useAppTheme()

        const cfg = await $settings.load()
        $theme.loadThemeFromConfig()
        // Window lifetime == listener lifetime; Tauri drops webview listeners when the window is destroyed.
        await $settings.listen()
        await $asesh.listen()
        await $asesh.initializeCurrentAppSession()

        // Re-apply theme whenever another window (e.g. Settings) saves.
        watch(() => $settings.config.value?.themeConfig, () => $theme.loadThemeFromConfig(), {deep: true})

        if (!$win.isCurrentAppWindowMain()) return

        if (!(await isPermissionGranted())) await requestPermission()
        if (cfg) await $asesh.recoverSavedAppSessions(cfg.recoverSessions)
    }
})
