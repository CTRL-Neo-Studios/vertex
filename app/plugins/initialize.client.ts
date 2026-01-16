import {useAppRecents} from "~/composables/app/useAppRecents";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import useUuid from "~/composables/utility/useUuid";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initializing')
        
        const $asesh = useAppSessions()
        const $recv = useAppSessionRecovery()
        
        await useAppRecents().load()

        // Initialize the current window session
        // Gets whether the current window is a `main` or a `session-` window
        const currentAppSession = await $asesh.initializeCurrentAppSession()
        
        // Attempts to recover the saved sessions on the `main` window
        // This function does not run on other windows
        await $asesh.recoverSavedAppSessions()
        
        // If the current window is a `session-` window, saturate it
        if (currentAppSession) {
            await $recv.saturateSessionWindow(currentAppSession)
        }
        
        console.log('initialized')
    }
})