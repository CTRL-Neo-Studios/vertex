import {StateKey} from "#shared/constants/app";
import type {AppSession} from "#shared/types/app/sessions";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {tabKinds} from "~/utils/contributions";

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

    /** Restore tabs (files, then the other saved tabs), focused tab, expanded folders and the panels' state after the workspace index is built. */
    async function recoverWorkspaceTabs(activeSession: ActiveSession, appSession: AppSession) {
        const {getFilteredFiles} = useActiveWorkspaceIndex(activeSession)
        const {openTab, openTabs, getActiveTab, setActiveTab} = useActiveTabs(activeSession)
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
        // A kind that isn't registered (a plugin that's off), or a tab whose content is gone, has nothing to show.
        const saved = context.openedTabs.filter(({kind, id}) => {
            const def = tabKinds.get(kind)
            return !!def && (def.exists?.(id) ?? true)
        })
        if (fileUuids.length === 0 && saved.length === 0) return $navi.toWorkspaceEmptyTab(activeSession.uuid)

        let lastOpened = openTabs(fileUuids)
        for (const {kind, id} of saved) lastOpened = openTab(id, kind)
        const focused = getActiveTab(context.lastFocusedTab?.id ?? uuids(context.lastFocusedFilePath ? [context.lastFocusedFilePath] : [])[0]) ?? lastOpened
        // Opening made the last tab active; a reload (a plugin's switch-off) is on the focused tab's route already, so
        // navigating there changes nothing: mark it active here.
        if (focused) setActiveTab(focused.fileUuid)
        await $navi.toWorkspaceTab(activeSession.uuid, focused)
    }

    return {
        redirectAppSessionWindowToEditSpace,
        recoverWorkspaceTabs,
    }
}
