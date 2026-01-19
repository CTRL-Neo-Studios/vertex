import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import useUuid from "~/composables/utility/useUuid";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppConfiguration} from "~/composables/app/useAppConfiguration";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initializing')
        
        const $asesh = useAppSessions()

        const cfg = await useAppConfiguration().load()

        // Initialize the current window session
        // Gets whether the current window is a `main` or a `session-` window
        const sesh = await $asesh.initializeCurrentAppSession()
        const $menu = useAppWindowMenu(sesh)
        await $menu.setMenu()
        
        // Attempts to recover the saved sessions on the `main` window
        // This function does not run on other windows

        if (cfg?.openLastOpenedWindows)
            await $asesh.recoverSavedAppSessions()
        
        // Saturation logic moved to /loading
        
        console.log('initialized')
    }
})