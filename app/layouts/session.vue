<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useFileActions} from "~/composables/active/useFileActions";
import {editorViewOf} from "~/composables/active/editor/useActiveEditorExtensions";
import {usePropertyTypes} from "~/composables/active/editor/usePropertyTypes";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionRecovery} from "~/composables/app/useAppSessionRecovery";
import {useAppSessionPersistence} from "~/composables/app/useAppSessionPersistence";
import {useSessionCommands} from "~/composables/app/useSessionCommands";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import DashboardSidePanel from "~/components/LayoutComponents/DashboardSidePanel.vue";
import DashboardCenterPanel from "~/components/LayoutComponents/DashboardCenterPanel.vue";
import PanelStrip from "~/components/LayoutComponents/PanelStrip.vue";
import TabSwitcher from "~/components/TabSwitcher.vue";
import VaultPickModal from "~/components/Modals/VaultPickModal.vue";
import {Routes, StateKey} from "#shared/constants/app";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {SessionContext} from "#shared/plugin/api";
import {pluginSession, pluginSessions} from "~/utils/plugins/runtime";
import {registeredCommands} from "~/utils/commands";
import {embeds, overlays, paletteGroups} from "~/utils/contributions";
import {fileUrl} from "~/utils/fileUrl";
import {draggedRows, fromFile} from "~/utils/outsideItems";

/**
 * Frame for a session window (workspace or singlespace): builds the index, restores tabs, starts persistence,
 * registers session commands, hands the session to plugins (`onSession`), and tears everything down on unmount.
 */
const $route = useRoute()
const $sessionId = computed(() => $route.params.sessionId as string)
await until($sessionId).toMatch(v => v != undefined)

const $sesh = useActiveSessions()
const activeSesh = $sesh.getSession($sessionId)
const isWorkspace = !!activeSesh?.workspaceSession
const $asesh = useAppSessions()
const index = useActiveWorkspaceIndex(activeSesh)
const $tabs = useActiveTabs(activeSesh)
const $tools = useActiveWorkspaceTools(activeSesh)
const propertyTypes = usePropertyTypes(activeSesh)
const $files = activeSesh ? useFileActions(activeSesh) : undefined
const openFolders = useState<string[]>(StateKey.expandedFolders($sessionId.value), () => [])
const vaultPicker = useOverlay().create(VaultPickModal)
const {recoverWorkspaceTabs} = useAppSessionRecovery()
const $persistence = activeSesh ? useAppSessionPersistence(activeSesh) : undefined
useSessionCommands(activeSesh)
const panels = usePanels(activeSesh)
// One drag state for the window's panel buttons, so a view can go from one side's list to the other's.
provide(PANEL_DRAG, usePanelDrag(panels.move))
// Plugins' overlays (the command palette), drawn once the session is handed to plugins.
const shownOverlays = computed(() => [...overlays.items.values()].filter(def => !def.when || def.when(panels.context.value)))

/** Removed with the plugin's session scope when called from an `onSession` callback; the caller may remove it sooner. */
function withScope<T extends () => unknown>(off: T) {
    if (getCurrentScope()) onScopeDispose(off)
    return off
}

/** A single-file window has no workspace to share: its index is empty to plugins and nothing is watched. */
const NO_INDEX: SessionContext['index'] = {
    files: () => [], tree: () => [], byPath: () => undefined, byUuid: () => undefined, resolveLink: () => undefined,
    backlinks: () => [], forelinks: () => [], links: () => [], unresolved: () => [], on: () => () => {},
}

/** The session as plugins' `onSession` callbacks get it. */
function sessionContext(session: ActiveSession): SessionContext {
    return {
        session,
        views: {show: panels.showView, openInTab: panels.openInTab},
        index: isWorkspace ? {
            files: () => Object.values(index.fileIndex.value),
            tree: () => index.fileTree.value,
            byPath: index.getFileByPath,
            byUuid: uuid => index.getFileByUuid(uuid) ?? undefined,
            resolveLink: index.resolveLink,
            backlinks: uuid => index.getFileByUuid(uuid)?.backlinks ?? [],
            forelinks: uuid => index.getFileByUuid(uuid)?.forelinks ?? [],
            links: index.links,
            unresolved: index.unresolved,
            on: listener => withScope(index.on(listener)),
        } : NO_INDEX,
        commands: {
            list: () => [...registeredCommands.values()],
            paletteGroups: () => [...paletteGroups.items.values()],
        },
        files: {
            assetUrl: fileUrl,
            write: $tools.saveContent,
            async create(folder, name) {
                const dir = await $tools.ensureFolder(folder)
                return (await $tools.createFile(index.getFileByPath(dir)?.uuid, name)) ?? undefined
            },
            edit: $tools.editNotes,
            move: (uuids, folder) => $tools.moveFiles(uuids, folder ? `${session.rootPath}/${folder}` : session.rootPath!),
            undo: () => $tools.undo(),
            redo: () => $tools.redo(),
            importAttachments: async files => (isWorkspace ? $tools.importAttachments(files.map(fromFile)) : []),
            pick: async options => (isWorkspace ? vaultPicker.open({...options, sessionId: session.uuid}).result : undefined),
            iconFor: name => $files!.iconFor(name),
            openFolders,
            menuFor: (uuids, options) => $files!.menuFor(uuids, options),
            newItems: folder => $files!.newItems(folder),
            copy: uuids => $files!.copy(uuids),
            paste: folder => $files!.paste(folder),
            remove: uuids => $files!.remove(uuids),
            importDrop: (transfer, folder, options) => $files!.importDrop(transfer, folder, options),
            drag: {start: (...args) => $files!.dragStart(...args), rows: draggedRows},
        },
        properties: {
            types: () => propertyTypes?.types.value ?? {},
            setType: async (key, type) => { await propertyTypes?.set(key, type) },
        },
        tabs: {
            open: (id, kind) => useAppNavigator().toWorkspaceTab(session.uuid, $tabs.openTab(id, kind)),
            close: $tabs.closeTabElsewhere,
            active: () => $tabs.activeTabUuid.value,
            list: () => $tabs.tabs.value.map(t => ({kind: t.kind, id: t.fileUuid})),
        },
        editor: {
            viewOf: tabId => editorViewOf(session, tabId),
            embedFor: ext => [...embeds.items.values()].find(def => def.match(ext)),
        },
        watch: (prefix, fn) => (isWorkspace ? withScope(index.watchUnder(prefix, fn)) : () => {}),
    }
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
    // Plugins' `onSession` callbacks: the index is built and the tabs are back.
    pluginSessions.start(sessionContext(activeSesh))
})

onBeforeUnmount(async () => {
    pluginSessions.end()
    unregisterClose?.()
    $tabs.clearTabs()
    await index.stopWatcher()
    index.clearIndex()
    $sesh.removeSession($sessionId)
})
</script>

<template>
    <UDashboardGroup class="w-full h-full transition-colors duration-200" unit="rem">
        <PanelStrip v-if="panels.style.value === 'strip'" side="left"/>
        <DashboardSidePanel side="left"/>
        <template v-if="pluginSession()">
            <PluginMount v-for="def in shownOverlays" :key="def.id" :ui="def" :props="{session: pluginSession()}"/>
        </template>
        <TabSwitcher v-if="isWorkspace && activeSesh" :session="activeSesh"/>
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
