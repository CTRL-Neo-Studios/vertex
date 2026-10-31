import {isPermissionGranted, requestPermission} from "@tauri-apps/plugin-notification";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppTheme} from "~/composables/app/useAppTheme";
import {resolveLocale} from "#shared/utils/locale";

/**
 * Runs once per window. Only wires services: every window mirrors the Rust-owned sessions/settings via
 * change events; the main window additionally recovers saved sessions. Anything that needs component
 * context (menus, toasts, the OS open queue) starts in app.vue.
 */
export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
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

        // UI language: setting (or OS language when `system`), applied in every window and on every change.
        const i18n = nuxtApp.$i18n
        const applyLocale = async () => {
            const codes = i18n.locales.value.map(l => (typeof l === 'string' ? l : l.code))
            const locale = resolveLocale($settings.config.value?.language ?? 'system', codes, navigator.languages)
            // setLocale lazy-loads the messages; await it so the first render/menu already uses them.
            if (i18n.locale.value !== locale) await i18n.setLocale(locale as typeof i18n.locale.value)
            document.documentElement.lang = locale
        }
        await applyLocale()
        watch(() => $settings.config.value?.language, applyLocale)

        if (!$win.isCurrentAppWindowMain()) return

        if (!(await isPermissionGranted())) await requestPermission()
        if (cfg) await $asesh.recoverSavedAppSessions(cfg.recoverSessions)
    }
})
