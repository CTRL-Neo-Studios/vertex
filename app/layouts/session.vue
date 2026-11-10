<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import {useAppSessionPersistence} from "~/composables/app/useAppSessionPersistence";
import {useSessionCommands} from "~/composables/app/useSessionCommands";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import {useChats} from "~/composables/ai/useChats";
import {watchGitPresence} from "~/composables/git/useGitRepo";
import {useGitAutoSync} from "~/composables/git/useGitAutoSync";
import DashboardSidePanel from "~/components/LayoutComponents/DashboardSidePanel.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import PanelStrip from "~/components/LayoutComponents/PanelStrip.vue";
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
const panels = usePanels(activeSesh)
// One drag state for the window's panel buttons, so a view can go from one side's list to the other's.
provide(PANEL_DRAG, usePanelDrag(panels.move))

// Whether the workspace is a git repository, for the views that need one (History), and auto-sync when it's on.
if (isWorkspace) {
    watchGitPresence(activeSesh)
    useGitAutoSync(activeSesh)
}

// Chats synced in from elsewhere: one refresh per burst of watcher events.
if (isWorkspace) {
    const {syncExternal} = useChats(activeSesh)
    const changedChats = new Set<string>()
    const flushChats = useDebounceFn(() => {
        const paths = [...changedChats]
        changedChats.clear()
        return syncExternal(paths)
    }, 500)
    onBeforeUnmount(index.on(event => {
        if (event.type !== 'chats') return
        changedChats.add(event.path)
        void flushChats()
    }))
}

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
</script>

<template>
    <UDashboardGroup class="w-full h-full transition-colors duration-200" unit="rem">
        <PanelStrip v-if="panels.style.value === 'strip'" side="left"/>
        <DashboardSidePanel side="left"/>
        <WorkspaceCommandPalette v-if="isWorkspace"/>
        <UDashboardSearch v-else shortcut="meta_p"/>
        <DashboardCenterPanel>
            <slot/>
        </DashboardCenterPanel>
        <DashboardSidePanel side="right"/>
        <PanelStrip v-if="panels.style.value === 'strip'" side="right"/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>
