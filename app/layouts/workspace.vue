<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import type { UnlistenFn } from "@tauri-apps/api/event";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $asesh = useAppSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const activeTreeItem = ref()
const loading = ref(true)

await until($sessionId).toMatch(v => v != undefined)

const {
    buildIndex,
    startWatcher,
    stopWatcher,
    clearIndex,
    addWindowCloseCallbacks
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    activeTabUuid,
    clearTabs
} = useActiveTabs($sesh.getSession($sessionId))
const {
    leftPanelCollapsed,
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))
const {
    recoverWorkspaceTabs
} = useAppSessionRecovery()
const {
    getCurrentAppSession
} = useAppSessions()
const $menu = useAppWindowMenu($asesh.getCurrentAppSession() || undefined)
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
    const rootPath = activeSesh.rootPath

    await buildIndex(rootPath || '')
    await startWatcher(rootPath || '')
    unlistenedWindows = await addWindowCloseCallbacks()
    await $menu.setMenu()

    const appSesh = getCurrentAppSession()

    if (appSesh)
        await recoverWorkspaceTabs(activeSesh, appSesh)

    loading.value = false
})

onBeforeUnmount(async () => {
    clearTabs()
    await stopWatcher()
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
        :class="['w-full h-full transition-colors duration-200', leftPanelCollapsed && rightPanelCollapsed ? 'bg-default': 'bg-submuted']"
        unit="rem"
    >
        <DashboardLeftPanelSidebar/>
        <slot/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>