import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import useUuid from "~/composables/utility/useUuid";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {listen} from "@tauri-apps/api/event";
import {invoke} from "@tauri-apps/api/core";
import {useAppFileStartHandler} from "~/composables/app/useAppFileStartHandler";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppTheme} from "~/composables/app/useAppTheme";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useAppWindowEventBus} from "~/composables/app/useAppWindowEventBus";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initializing')
        
        const $asesh = useAppSessions()
        const $win = useAppWebviewWindows()
        const $settings = useAppSettings()
        const $bus = useAppWindowEventBus()
        const $theme = useAppTheme()

        const cfg = await $settings.load()

        // Initialize the current window session
        // Gets whether the current window is a `main` or a `session-` window
        const sesh = await $asesh.initializeCurrentAppSession()
        const $menu = useAppWindowMenu()
        await $menu.setMenu()

        await $win.getCurrentAppWindow().listen('tauri://focus', async () => {
            await Promise.all([
                $menu.setMenu(),
                $settings.load(),
                $asesh.load()
            ])
            $theme.loadThemeFromConfig()
            $bus.emit('focus')
        })

        await $win.getCurrentAppWindow().listen('tauri://blur', () => {
            $bus.emit('blur')
        })

        await $win.getCurrentAppWindow().listen('tauri://close-requested', () => {
            $bus.emit('closeRequested')
        })

        await $win.getCurrentAppWindow().listen('tauri://destroyed', () => {
            $bus.emit('destroyed')
        })
        
        // Attempts to recover the saved sessions on the `main` window
        // This function does not run on other windows

        if (cfg?.openLastOpenedWindows && $win.isCurrentAppWindowMain())
            await $asesh.recoverSavedAppSessions()

        await useAppFileStartHandler().initializeOnMain()
        
        // Saturation logic moved to /loading
        
        console.log('initialized')
    }
})