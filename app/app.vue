<script setup lang="ts">
import colors from 'tailwindcss/colors'

const colorMode = useColorMode()
const appConfig = useAppConfig()

const color = computed(() => colorMode.value === 'dark' ? (colors as any)[appConfig.ui.colors.neutral][900] : 'white')
const radius = computed(() => `:root { --ui-radius: ${appConfig.theme.radius}rem; }`)
const blackAsPrimary = computed(() => appConfig.theme.blackAsPrimary ? `:root { --ui-primary: black; } .dark { --ui-primary: white; }` : ':root {}')
const appFont = computed(() => `:root { --font-sans: '${appConfig.theme.font}', 'Geist', 'Inter', sans-serif; }`)
// const monoFont = computed(() => `:root { --font-mono: '${appConfig.theme.font}', 'JetBrains Mono', 'Google Sans Code', monospace, ui-monospace; }`)
const editorFont = computed(() => `:root { --font-editor: '${appConfig.theme.font}', 'Geist', 'Inter', var(--font-sans, sans-serif); }`)

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
        { innerHTML: editorFont, id: 'nuxt-ui-editor-font', tagPriority: -2 }
    ],
    htmlAttrs: {
        lang: 'en'
    }
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