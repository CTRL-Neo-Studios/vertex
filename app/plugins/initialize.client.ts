import {useAppRecents} from "~/composables/app/useAppRecents";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        console.log('initalizing Recents')
        await useAppRecents().load()
        console.log('recents initialized')
    }
})