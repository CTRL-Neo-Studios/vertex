<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useAppWindowMenu} from "~/composables/app/useAppWindowMenu";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessionActions} from "~/composables/app/useAppSessionActions";
import {useAppSessionPersistence} from "~/composables/app/useAppSessionPersistence";
import SinglespaceCommandPalette from "~/components/SinglespaceCommandPalette.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const $win = useAppWebviewWindows()

const loading = ref(true)
await until($sessionId).toMatch(v => v != undefined)

const activeSesh = $sesh.getSession($sessionId)
const {clearIndex, startWatcher, stopWatcher} = useActiveSinglespaceIndex(activeSesh)
const {clearTabs} = useActiveTabs(activeSesh)
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

$menu.dispatcher.on('categories.file.new.newFile', async () => {
    await until(loading).toBe(false)
    await $act.createNewFileForSinglespace()
})

$menu.dispatcher.on('categories.view.closeWindow', async () => {
    await $win.getCurrentAppWindow().close()
})

onMounted(async () => {
    if (!activeSesh?.rootPath) {
        await $navi.toHome()
        return
    }

    unregisterClose = await $persistence?.registerCloseHandlers()
    await startWatcher(activeSesh.rootPath)
    // The navigator already opened the file's tab before routing here.
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
