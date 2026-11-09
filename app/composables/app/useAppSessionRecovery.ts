import {StateKey} from "#shared/constants/app";
import type {AppSession} from "#shared/types/app/sessions";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";

/**
 * Brings a freshly created session window back to its persisted state:
 * open the root path (creates the ActiveSession), then restore tabs and expanded folders.
 */
export function useAppSessionRecovery() {
    const $open = useAppSessionNavigator()
    const $win = useAppWebviewWindows()
    const $navi = useAppNavigator()

    /** Called from /loading in a `session-` window. */
    async function redirectAppSessionWindowToEditSpace(appSession: AppSession) {
        if (!appSession.rootFileOrFolderAbsolutePath) {
            console.error(`[useAppSessionRecovery] AppSession ${appSession.uuid} has no root path`)
            return
        }
        const result = await $open.openFolderOrFileFromPath(appSession.rootFileOrFolderAbsolutePath)
        await $win.getCurrentAppWindow().setFocus()
        return result
    }

    /** Restore tabs (files, then chats), focused tab, expanded folders and the left sidebar's view after the workspace index is built. */
    async function recoverWorkspaceTabs(activeSession: ActiveSession, appSession: AppSession) {
        const {getFilteredFiles} = useActiveWorkspaceIndex(activeSession)
        const {openTab, openTabs, getActiveTab} = useActiveTabs(activeSession)
        const expandedFolders = useState<string[]>(StateKey.expandedFolders(activeSession.uuid), () => [])
        const context = appSession.context
        const byPath = new Map(getFilteredFiles(() => true).map(f => [f.relativePath, f.uuid]))
        const uuids = (paths: string[]) => paths.map(p => byPath.get(p)).filter((u): u is string => !!u)

        expandedFolders.value = uuids(context.openedFolderPaths)
        const layouts = useActiveLayouts(activeSession)
        layouts.shownPanelViews.value = context.shownPanelViews ?? []
        layouts.leftPanelCollapsed.value = context.leftPanelCollapsed ?? false
        layouts.rightPanelCollapsed.value = context.rightPanelCollapsed ?? true
        layouts.bottomPanelCollapsed.value = context.bottomPanelCollapsed ?? false

        const fileUuids = uuids(context.openedFilePaths)
        const chatIds = context.openedChatIds ?? []
        if (fileUuids.length === 0 && chatIds.length === 0) return $navi.toWorkspaceEmptyTab(activeSession.uuid)

        let lastOpened = openTabs(fileUuids)
        for (const id of chatIds) lastOpened = openTab(id, 'chat')
        const focused = getActiveTab(context.lastFocusedChatId ?? uuids(context.lastFocusedFilePath ? [context.lastFocusedFilePath] : [])[0])
        await $navi.toWorkspaceTab(activeSession.uuid, focused ?? lastOpened)
    }

    return {
        redirectAppSessionWindowToEditSpace,
        recoverWorkspaceTabs,
    }
}
