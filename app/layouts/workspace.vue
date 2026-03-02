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
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
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
const activeTreeItem = ref()
const loading = ref(true)

await until($sessionId).toMatch(v => v != undefined)

const {
    buildIndex,
    startWatcher,
    stopWatcher,
    clearIndex,
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    activeTabUuid,
    clearTabs
} = useActiveTabs($sesh.getSession($sessionId))
// const {
//     leftPanelCollapsed,
//     rightPanelCollapsed
// } = useActiveLayouts($sesh.getSession($sessionId))
const {
    recoverWorkspaceTabs
} = useAppSessionRecovery()
const {
    getCurrentAppSession
} = useAppSessions()
const $menu = useAppWindowMenu()
const $act = useAppSessionActions()
const $aseshNavi = useAppSessionNavigator()
const $editorDispatcher = useActiveEditorDispatcher($sesh.getSession($sessionId))

let unlistenedWindows: { unlistenClose: UnlistenFn; unlistenDestroyed: UnlistenFn; } | undefined

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
    unlistenedWindows = await $aseshNavi.addWindowCloseCallbacks(activeSesh)
    await $menu.setMenu()

    const appSesh = getCurrentAppSession()

    if (appSesh)
        await recoverWorkspaceTabs(activeSesh, appSesh)

    console.log(`Windows: ${await $win.getAppWindows()}`)

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