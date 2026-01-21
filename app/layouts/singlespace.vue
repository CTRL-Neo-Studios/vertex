<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import type {UnlistenFn} from "@tauri-apps/api/event";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $asesh = useAppSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const activeTreeItem = ref()
const $win = useAppWebviewWindows()

const loading = ref(true)
await until($sessionId).toMatch(v => v != undefined)

const {
    initializeIndex,
    updateIndex,
    clearIndex,
    getFileByUuid,
} = useActiveSinglespaceIndex($sesh.getSession($sessionId))
const {
    activeTabUuid,
    clearTabs
} = useActiveTabs($sesh.getSession($sessionId))
const {
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))
const $menu = useAppWindowMenu()
const $aseshNavi = useAppSessionNavigator()
const $act = useAppSessionActions()

let unlistenedWindows: { unlistenClose: UnlistenFn; unlistenDestroyed: UnlistenFn; } | undefined

$menu.dispatcher.on('categories.file.open.openFile', async () => {
    await until(loading).toBe(false)
    await $act.openSinglespaceAction()
})

$menu.dispatcher.on('categories.file.open.openFolder', async () => {
    await until(loading).toBe(false)
    await $act.openWorkspaceAction()
})

$menu.dispatcher.on('categories.file.new.newFile', async () => {
    await until(loading).toBe(false)
    await $act.createNewFileForSinglespace()
})

watch(activeTabUuid, (newValue) => {
    activeTreeItem.value = newValue
}, {deep: false})

onMounted(async () => {
    if (!unref($sessionId))
        await until($sessionId).toMatch(v => v != undefined)

    const activeSesh = $sesh.getSession($sessionId)
    if (!activeSesh) {
        await $navi.toHome()
        return;
    }

    unlistenedWindows = await $aseshNavi.addWindowCloseCallbacks(activeSesh)

    console.log(`Windows: ${await $win.getAppWindows()}`)
    await $menu.setMenu()

    loading.value = false
})

onBeforeUnmount(async () => {
    clearTabs()
    clearIndex()
    if (unlistenedWindows) {
        unlistenedWindows.unlistenClose()
        unlistenedWindows.unlistenDestroyed()
    }
    $sesh.removeSession($sessionId)
})

</script>

<template>
    <UDashboardGroup
        :class="['w-full h-full transition-colors duration-200', rightPanelCollapsed ? 'bg-default': 'bg-submuted']"
        unit="rem"
    >
        <slot/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>