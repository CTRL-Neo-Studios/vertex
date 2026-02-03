import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useAppFileStartHandler} from "~/composables/app/useAppFileStartHandler";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppTheme} from "~/composables/app/useAppTheme";
import {useAppWindowEventBus} from "~/composables/app/useAppWindowEventBus";
import {isPermissionGranted, requestPermission} from "@tauri-apps/plugin-notification";
import {useAppCrossWindowEvents} from "~/composables/app/useAppCrossWindowEvents";
import {exit} from "@tauri-apps/plugin-process";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initializing')
        
        const $asesh = useAppSessions()
        const $win = useAppWebviewWindows()
        const $settings = useAppSettings()
        const $bus = useAppWindowEventBus()
        const $theme = useAppTheme()
        const $ce = useAppCrossWindowEvents()

        const cfg = await $settings.load()

        // Initialize the current window session
        // Gets whether the current window is a `main` or a `session-` window
        if (!(await isPermissionGranted())) await requestPermission()
        const sesh = await $asesh.initializeCurrentAppSession()
        const $menu = useAppWindowMenu()
        await $menu.setMenu()

        await $win.getCurrentAppWindow().listen('tauri://focus', async () => {
            await Promise.all([
                $menu.setMenu(),
                $settings.load(true),
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

        if ($win.isCurrentAppWindowMain()) {
            if (cfg?.openLastOpenedWindows)
                await $asesh.recoverSavedAppSessions()

            await $ce.listenQuitVertex(async (event) => {
                await $win.closeAllSessionWindows()
                await $win.hideMainWindow()
                const {isPending} = useTimeout(500, {controls: true})
                // await until($win.sessionWindowCount).toMatch(v => v != undefined && v.length <= 0)
                await until(isPending).toBe(false)
                await exit()
            })
        }

        await useAppFileStartHandler().initializeOnMain()
        
        // Saturation logic moved to /loading
        
        console.log('initialized')
    }
})