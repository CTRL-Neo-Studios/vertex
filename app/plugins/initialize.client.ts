import {useAppRecents} from "~/composables/app/useAppRecents";
import {useAppSessions} from "~/composables/app/useAppSessions";
import useUuid from "~/composables/utility/useUuid";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initalizing')
        const $ws = useAppSessions()
        await useAppRecents().load()

        const sesh = await $ws.initializeCurrentAppSession() // Initialize the current window session, gets whether the current window is a `main` or a `session-` window or not
        await $ws.recoverSavedAppSessions() // attempts to recover the saved sessions on the `main` window, this function does not run on other windows
        if (sesh) { // if the current window is a `session-` window, saturate the current window
            await $ws.saturateAppSession(sesh)
        } else {

        }
        console.log('initialized')
    }
})