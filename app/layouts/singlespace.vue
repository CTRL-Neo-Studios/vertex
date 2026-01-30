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
import SinglespaceCommandPalette from "~/components/SinglespaceCommandPalette.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

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
    startWatcher,
    stopWatcher
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
    if (!activeSesh || !activeSesh.rootPath) {
        await $navi.toHome()
        return;
    }

    unlistenedWindows = await $aseshNavi.addWindowCloseCallbacks(activeSesh)

    console.log(`Windows: ${await $win.getAppWindows()}`)
    await $menu.setMenu()

    await startWatcher(activeSesh.rootPath)

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
        <SinglespaceCommandPalette/>
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