import {useAppRecents} from "~/composables/app/useAppRecents";

export default defineNuxtPlugin({
    name: 'initialize',
    async setup(nuxtApp) {
        await useAppRecents().load()
    }
})