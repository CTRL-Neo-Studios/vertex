<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import {useAppSessionPersistence} from "~/composables/app/useAppSessionPersistence";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import WorkspaceCommandPalette from "~/components/WorkspaceCommandPalette.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $asesh = useAppSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const $win = useAppWebviewWindows()
const loading = ref(true)

await until($sessionId).toMatch(v => v != undefined)

const activeSesh = $sesh.getSession($sessionId)
const {buildIndex, startWatcher, stopWatcher, clearIndex} = useActiveWorkspaceIndex(activeSesh)
const {clearTabs} = useActiveTabs(activeSesh)
const {recoverWorkspaceTabs} = useAppSessionRecovery()
const $menu = useAppWindowMenu()
const $act = useAppSessionActions()
const $persistence = activeSesh ? useAppSessionPersistence(activeSesh) : undefined
const $editorDispatcher = useActiveEditorDispatcher(activeSesh)

let unregisterClose: (() => void) | undefined

$menu.dispatcher.on('categories.file.open.openFile', async () => {
    await until(loading).toBe(false)
    await $act.openSinglespaceAction()
})

$menu.dispatcher.on('categories.file.open.openFolder', async () => {
    await until(loading).toBe(false)
    await $act.openWorkspaceAction()
})

$menu.dispatcher.on('categories.view.closeWindow', async () => {
    await $win.getCurrentAppWindow().close()
})

onMounted(async () => {
    if (!activeSesh) {
        await $navi.toHome()
        return
    }

    unregisterClose = await $persistence?.registerCloseHandlers()
    await buildIndex(activeSesh.rootPath || '')
    await startWatcher(activeSesh.rootPath || '')

    const appSesh = $asesh.getCurrentAppSession()
    if (appSesh) await recoverWorkspaceTabs(activeSesh, appSesh)
    // Track changes only after restore, so the restored state is never overwritten by an empty one.
    $persistence?.start()

    loading.value = false
})

onBeforeUnmount(async () => {
    unregisterClose?.()
    clearTabs()
    await stopWatcher()
    clearIndex()
    $editorDispatcher.dispatcher.unmount()
    $menu.dispatcher.unmount()
    $sesh.removeSession($sessionId)
})

function callToTocEntryWithDefaults(node: TocEntry) {
    $editorDispatcher.emitToTocEntry({
        node: node,
        verticalMargin: 70,
        verticalScrollStrategy: 'start'
    })
}
</script>

<template>
    <UDashboardGroup
        :class="['w-full h-full transition-colors duration-200']"
        unit="rem"
    >
        <DashboardLeftPanelSidebar/>
        <WorkspaceCommandPalette/>
        <DashboardCenterPanel>
            <slot/>
        </DashboardCenterPanel>
        <DashboardRightPanelSidebar @to-toc="callToTocEntryWithDefaults"/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>
