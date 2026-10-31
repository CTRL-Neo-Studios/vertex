import {StateKey} from "#shared/constants/app";
import type {AppSession} from "#shared/types/app/sessions";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveTabs} from "~/composables/active/useActiveTabs";

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

    /** Restore tabs, focused tab and expanded folders after the workspace index is built. */
    async function recoverWorkspaceTabs(activeSession: ActiveSession, appSession: AppSession) {
        const {getFilesByPaths, getFileByPath} = useActiveWorkspaceIndex(activeSession)
        const {openTabs, getActiveTab} = useActiveTabs(activeSession)
        const expandedFolders = useState<string[]>(StateKey.expandedFolders(activeSession.uuid), () => [])
        const context = appSession.context

        expandedFolders.value = getFilesByPaths(context?.openedAbsoluteFolderPaths ?? []).map(f => f.uuid)

        const fileUuids = getFilesByPaths(context?.openedAbsoluteFilePaths ?? []).map(f => f.uuid)
        if (fileUuids.length === 0) return $navi.toWorkspaceEmptyTab(activeSession.uuid)

        const lastOpened = openTabs(fileUuids)
        const focused = getActiveTab(getFileByPath(context.lastFocusedAbsoluteFilePath ?? '')?.uuid)
        await $navi.toWorkspaceTab(activeSession.uuid, focused ?? lastOpened)
    }

    return {
        redirectAppSessionWindowToEditSpace,
        recoverWorkspaceTabs,
    }
}
