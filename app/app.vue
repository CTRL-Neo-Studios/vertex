<script setup lang="ts">
import colors from 'tailwindcss/colors'
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppOpener} from "~/composables/app/useAppOpener";

const colorMode = useColorMode()
const appConfig = useAppConfig()
const {dispatcher} = useAppWindowMenu()
const $opener = useAppOpener()

const color = computed(() => colorMode.value === 'dark' ? (colors as any)[appConfig.ui.colors.neutral][900] : 'white')
const radius = computed(() => `:root { --ui-radius: ${appConfig.theme.radius}rem; }`)
const blackAsPrimary = computed(() => appConfig.theme.blackAsPrimary ? `:root { --ui-primary: black; } .dark { --ui-primary: white; }` : ':root {}')
const appFont = computed(() => `:root { --font-sans: '${appConfig.theme.appFont}', 'Geist', 'Inter', sans-serif; }`)
const appMonoFont = computed(() => `:root { --font-mono: '${appConfig.theme.appMonoFont}', 'JetBrains Mono', 'Google Sans Code', monospace, ui-monospace; }`)
const editorFont = computed(() => `:root { --font-editor: '${appConfig.theme.editorFont}', '${appConfig.theme.appFont}', 'Geist', 'Inter', var(--font-sans, sans-serif); }`)
const editorMonoFont = computed(() => `:root { --font-editor-code: '${appConfig.theme.editorMonoFont}', '${appConfig.theme.appMonoFont}', 'JetBrains Mono', monospace, ui-monospace; }`)

useHead({
    meta: [
        // { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'viewport', content: 'width=1920, initial-scale=1' },
        { key: 'theme-color', name: 'theme-color', content: color }
    ],
    style: [
        { innerHTML: radius, id: 'nuxt-ui-radius', tagPriority: -2 },
        { innerHTML: blackAsPrimary, id: 'nuxt-ui-black-as-primary', tagPriority: -2 },
        { innerHTML: appFont, id: 'nuxt-ui-app-font', tagPriority: -2 },
        { innerHTML: appMonoFont, id: 'nuxt-ui-app-mono-font', tagPriority: -2 },
        { innerHTML: editorFont, id: 'nuxt-ui-editor-font', tagPriority: -2 },
        { innerHTML: editorMonoFont, id: 'nuxt-ui-editor-mono-font', tagPriority: -2 }
    ],
    htmlAttrs: {
        lang: 'en'
    }
})

onBeforeUnmount(() => {
    dispatcher.unmount()
})

dispatcher.on('categories.about.toRepo', async function () {
    await $opener.openUrlInBrowser('https://github.com/CTRL-Neo-Studios/vertex')
})

dispatcher.on('categories.about.toDocs', async function () {
    await $opener.openUrlInBrowser('https://github.com/CTRL-Neo-Studios/vertex/wiki')
})

dispatcher.on('categories.about.toRepoIssues', async function () {
    await $opener.openUrlInBrowser('https://github.com/CTRL-Neo-Studios/vertex/issues')
})
</script>

<template>
    <UApp>
        <NuxtLayout>
            <NuxtPage/>
        </NuxtLayout>
    </UApp>
</template>

<style>
@reference "~/assets/css/main.css";

div[data-tauri-decorum-tb] {
    pointer-events: none;
    div[data-tauri-drag-region] {
        pointer-events: none;
    }
}

.page-enter-active,
.page-leave-active {
    transition: all 0.15s;
}
.page-enter-from,
.page-leave-to {
    opacity: 0;
    filter: blur(1rem);
}
</style>