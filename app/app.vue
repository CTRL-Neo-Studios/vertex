<script setup lang="ts">
import colors from 'tailwindcss/colors'
import {getCurrentWebviewWindow} from "@tauri-apps/api/webviewWindow";
import {relaunch} from "@tauri-apps/plugin-process";
import {useAppWindowMenu, useCommands} from "~/composables/app/useAppWindowMenu";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useAppFileStartHandler} from "~/composables/app/useAppFileStartHandler";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useAppUpdater} from "~/composables/app/useAppUpdater";
import {cssFontName} from "~/composables/app/useAppTheme";
import {Routes} from "#shared/constants/app";
import {stateClient} from "~/utils/stateClient";

const colorMode = useColorMode()
const appConfig = useAppConfig()
const $menu = useAppWindowMenu()
const $opener = useAppOpener()
const $act = useAppSessionActions()
const $settings = useAppSettings()
const $updater = useAppUpdater()
const $route = useRoute()
const $fileStart = useAppFileStartHandler()
const REPO = 'https://github.com/CTRL-Neo-Studios/vertex'
const notInUtilityPage = () => ![Routes.settings, Routes.loading, Routes.about].some(p => $route.path.startsWith(p))

// Commands available in every window. Session layouts register more (save, new folder, tabs…).
useCommands({
    'app.settings': {run: () => $settings.createOrFocusSettingsWindow(), enabled: () => !$route.path.startsWith(Routes.settings)},
    'app.about': {run: () => $settings.createOrFocusAboutWindow()},
    'app.checkUpdates': {run: () => $updater.checkForUpdates()},
    'app.quit': {run: () => stateClient.quit()},
    'file.openFile': {run: () => $act.openSinglespaceAction(), enabled: notInUtilityPage},
    'file.openFolder': {run: () => $act.openWorkspaceAction(), enabled: notInUtilityPage},
    'file.newFile': {run: () => $act.createNewFileForSinglespace(), enabled: notInUtilityPage},
    'view.reload': {run: () => relaunch()},
    'view.toggleFullscreen': {run: async () => {
        const w = getCurrentWebviewWindow()
        await w.setFullscreen(!(await w.isFullscreen()))
    }},
    'view.closeWindow': {run: () => getCurrentWebviewWindow().close()},
    'help.docs': {run: () => $opener.openUrlInBrowser(`${REPO}/wiki`)},
    'help.reportIssue': {run: () => $opener.openUrlInBrowser(`${REPO}/issues`)},
    'help.repo': {run: () => $opener.openUrlInBrowser(REPO)},
})

// macOS has one app menu for all windows, so the focused window re-applies its own; route and
// command changes re-evaluate which items are enabled.
let unlistenFocus: (() => void) | undefined
let unlistenOpen: (() => void) | undefined
const rebuildMenu = useDebounceFn(() => $menu.setMenu(), 50)
onMounted(async () => {
    await $menu.setMenu()
    unlistenFocus = await getCurrentWebviewWindow().onFocusChanged(({payload: focused}) => {
        if (focused) rebuildMenu()
    })
    unlistenOpen = await $fileStart.initializeOnMain()
})
onBeforeUnmount(() => {
    unlistenFocus?.()
    unlistenOpen?.()
})
const {locale} = useI18n()
watch([() => $route.path, $menu.handlers, locale], () => rebuildMenu())

const color = computed(() => colorMode.value === 'dark' ? (colors as unknown as Record<string, Record<number, string>>)[appConfig.ui.colors.neutral]?.[900] ?? 'white' : 'white')
const radius = computed(() => `:root { --ui-radius: ${appConfig.theme.radius}rem; }`)
const blackAsPrimary = computed(() => appConfig.theme.blackAsPrimary ? `:root { --ui-primary: black; } .dark { --ui-primary: white; }` : ':root {}')
// Font names can be any installed family; cssFontName keeps them inside their quotes.
const appFont = computed(() => `:root { --font-sans: '${cssFontName(appConfig.theme.appFont)}', 'Geist', 'Inter', sans-serif; }`)
const appMonoFont = computed(() => `:root { --font-mono: '${cssFontName(appConfig.theme.appMonoFont)}', 'Geist Mono', monospace, ui-monospace; }`)
const editorFont = computed(() => `:root { --font-editor: '${cssFontName(appConfig.theme.editorFont)}', '${cssFontName(appConfig.theme.appFont)}', 'Geist', 'Inter', sans-serif; }`)
const editorMonoFont = computed(() => `:root { --font-editor-code: '${cssFontName(appConfig.theme.editorMonoFont)}', '${cssFontName(appConfig.theme.appMonoFont)}', 'Geist Mono', monospace, ui-monospace; }`)

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