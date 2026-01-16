import {useAppRecents} from "~/composables/app/useAppRecents";
import {useActiveWindowSessions} from "~/composables/active/useActiveWindowSessions";
import useUuid from "~/composables/utility/useUuid";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initalizing Recents')
        await useAppRecents().load()
        useActiveWindowSessions().initialize()
        console.log('recents initialized')
    }
})