import { useAppSessionNavigator } from "~/composables/app/useAppSessionNavigator";
import { useAppWebviewWindows } from "~/composables/app/useAppWebviewWindows";
import { useActiveWorkspaceIndex } from "~/composables/active/useActiveWorkspaceIndex";
import { useActiveTabs } from "~/composables/active/useActiveTabs";
import type {AppSession} from "#shared/types/app/sessions";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";
import useUuid from "~/composables/utility/useUuid";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";

/**
 * Orchestrates the recovery/saturation of session windows.
 * This composable sits at a higher level than useAppSessions and useAppSessionNavigator,
 * coordinating between them to recover window states from persisted AppSessions.
 * 
 * Separation of Concerns:
 * - useAppSessions: Pure persistence layer for AppSession CRUD
 * - useAppSessionNavigator: Pure business logic for opening files/folders and creating ActiveSessions
 * - useAppSessionRecovery: Orchestration layer that uses both to recover window state
 */
export function useAppSessionRecovery() {
    const $open = useAppSessionNavigator();
    const $win = useAppWebviewWindows();
    const $navi = useAppNavigator()
    const lastRedirect = useState<{redirect: "workspace" | "singlespace", workingSession: ActiveSession} | undefined>('app.store.lastRedirected', () => undefined)

    /**
     * Saturates a session window by:
     * 1. Opening the folder/file from the AppSession (creates ActiveSession)
     * 2. Recovering tabs based on AppSession context
     * 3. Focusing the window
     * 
     * This function should be called by newly created session windows during initialization.
     * 
     * @param appSession The persisted AppSession to recover from
     */
    async function redirectAppSessionWindowToEditSpace(appSession: AppSession) {
        if (!appSession?.rootFileOrFolderAbsolutePath) {
            console.warn('[useAppSessionRecovery] Cannot saturate session without rootPath');
            return;
        }

        // Step 1: Open the folder/file (this creates the ActiveSession)
        const result = await $open.openFolderOrFileFromPath(appSession.rootFileOrFolderAbsolutePath);
        
        // Step 2: Focus the window
        const window = $win.getCurrentAppWindow();
        await window.setFocus();

        lastRedirect.value = result

        return result
    }

    /**
     * Recovers tabs for a workspace session based on AppSession context.
     * 
     * @param activeSession The runtime ActiveSession created by opening the folder
     * @param appSession The persisted AppSession containing tab context
     */
    async function recoverWorkspaceTabs(activeSession: ActiveSession, appSession: AppSession) {
        console.log(`Recovering App Session ${appSession.uuid} with Active Session ${activeSession.uuid}...`)
        const openedFilePaths = appSession.context?.openedAbsoluteFilePaths || [];
        const openedFolderPaths = appSession.context?.openedAbsoluteFolderPaths || []
        
        if (openedFilePaths.length === 0) {
            await $navi.toWorkspaceEmptyTab(activeSession.uuid)
        } else {
            const {getFilesByPaths, getFileByPath} = useActiveWorkspaceIndex(activeSession);
            const {openTabs, getActiveTab} = useActiveTabs(activeSession);
            const {putToIdMeta} = useActiveFileTreeMemo(activeSession)

            console.log(`Reading saved opened files: ${openedFilePaths}`)

            const files = getFilesByPaths(openedFilePaths);
            const fileUuids = files.map(file => file.uuid);
            const folders = getFilesByPaths(openedFolderPaths)
            const expandedFolders = useState<string[]>(`active.workspace.expanded-file-tree-items-${activeSession?.uuid ?? useUuid()}`, () => [])

            console.log(`Recovered opened tabs: ${fileUuids}`)

            if (fileUuids.length > 0) {
                const lastTab = openTabs(fileUuids)
                const recordedLastOpenedTab = getActiveTab(getFileByPath(appSession.context.lastFocusedAbsoluteFilePath || '')?.uuid)
                if (!recordedLastOpenedTab)
                    await $navi.toWorkspaceTab(activeSession.uuid, lastTab)
                else
                    await $navi.toWorkspaceTab(activeSession.uuid, recordedLastOpenedTab)
            }

            if (folders.length > 0) {
                folders.forEach(i => {
                    expandedFolders.value.push(`${i.fileName}${i.uuid.slice(0, 4)}`) // push the obfuscated folder names there
                })
            }
        }

        console.log(`Recovered.`)
    }

    return {
        redirectAppSessionWindowToEditSpace,
        recoverWorkspaceTabs
    };
}
