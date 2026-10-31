<script setup lang="ts">
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import {useAppSessionPersistence} from "~/composables/app/useAppSessionPersistence";
import {useSessionCommands} from "~/composables/app/useSessionCommands";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import DashboardRightPanelSidebar from "~/components/LayoutComponents/DashboardRightPanelSidebar.vue";
import WorkspaceCommandPalette from "~/components/WorkspaceCommandPalette.vue";
import {Routes} from "#shared/constants/app";

/**
 * Frame for a session window (workspace or singlespace): builds the index, restores tabs,
 * starts persistence, registers session commands, and tears everything down on unmount.
 */
const $route = useRoute()
const $sessionId = computed(() => $route.params.sessionId as string)
await until($sessionId).toMatch(v => v != undefined)

const $sesh = useActiveSessions()
const activeSesh = $sesh.getSession($sessionId)
const isWorkspace = !!activeSesh?.workspaceSession
const $asesh = useAppSessions()
const index = useActiveWorkspaceIndex(activeSesh)
const {clearTabs} = useActiveTabs(activeSesh)
const {recoverWorkspaceTabs} = useAppSessionRecovery()
const $persistence = activeSesh ? useAppSessionPersistence(activeSesh) : undefined
const $editorDispatcher = useActiveEditorDispatcher(activeSesh)
useSessionCommands(activeSesh)

let unregisterClose: (() => void) | undefined

onMounted(async () => {
    // A webview reload drops in-memory sessions; /loading rebuilds this window from its persisted AppSession.
    if (!activeSesh?.rootPath) return navigateTo(Routes.loading)
    unregisterClose = await $persistence?.registerCloseHandlers()
    if (isWorkspace) {
        await index.buildIndex(activeSesh.rootPath)
        const appSesh = $asesh.getCurrentAppSession()
        if (appSesh) await recoverWorkspaceTabs(activeSesh, appSesh)
    }
    // Singlespace: the navigator already opened the file's tab before routing here.
    await index.startWatcher(activeSesh.rootPath)
    // Track changes only after restore, so the restored state is never overwritten by an empty one.
    $persistence?.start()
})

onBeforeUnmount(async () => {
    unregisterClose?.()
    clearTabs()
    await index.stopWatcher()
    index.clearIndex()
    $editorDispatcher.dispatcher.unmount()
    $sesh.removeSession($sessionId)
})

function toToc(node: TocEntry) {
    $editorDispatcher.emitToTocEntry({node, verticalMargin: 70, verticalScrollStrategy: 'start'})
}
</script>

<template>
    <UDashboardGroup class="w-full h-full transition-colors duration-200" unit="rem">
        <template v-if="isWorkspace">
            <DashboardLeftPanelSidebar/>
            <WorkspaceCommandPalette/>
        </template>
        <UDashboardSearch v-else shortcut="meta_p"/>
        <DashboardCenterPanel>
            <slot/>
        </DashboardCenterPanel>
        <DashboardRightPanelSidebar @to-toc="toToc"/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>
