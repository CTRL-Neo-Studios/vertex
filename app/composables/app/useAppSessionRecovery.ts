import { useAppOpener } from "~/composables/app/useAppOpener";
import { useAppWebviewWindows } from "~/composables/app/useAppWebviewWindows";
import { useActiveWorkspaceIndex } from "~/composables/active/useActiveWorkspaceIndex";
import { useActiveTabs } from "~/composables/active/useActiveTabs";
import type {AppSession} from "#shared/types/app/sessions";
import type {ActiveSession} from "#shared/types/active/sessions";

/**
 * Orchestrates the recovery/saturation of session windows.
 * This composable sits at a higher level than useAppSessions and useAppOpener,
 * coordinating between them to recover window states from persisted AppSessions.
 * 
 * Separation of Concerns:
 * - useAppSessions: Pure persistence layer for AppSession CRUD
 * - useAppOpener: Pure business logic for opening files/folders and creating ActiveSessions
 * - useAppSessionRecovery: Orchestration layer that uses both to recover window state
 */
export function useAppSessionRecovery() {
    const $open = useAppOpener();
    const $win = useAppWebviewWindows();

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
    async function saturateSessionWindow(appSession: AppSession) {
        if (!appSession?.rootFileOrFolderAbsolutePath) {
            console.warn('[useAppSessionRecovery] Cannot saturate session without rootPath');
            return;
        }

        // Step 1: Open the folder/file (this creates the ActiveSession)
        const result = await $open.openFolderOrFileFromPath(appSession.rootFileOrFolderAbsolutePath);
        
        // Step 2: Focus the window
        const window = await $win.getCurrentAppWindow();
        await window.setFocus();

        // Step 3: If successfully opened and it's a workspace, recover tabs
        if (result?.workingSession && result.redirect === 'workspace') {
            await recoverWorkspaceTabs(result.workingSession, appSession);
        }

        // For singlespace, the file is already opened by useAppOpener, no tab recovery needed
    }

    /**
     * Recovers tabs for a workspace session based on AppSession context.
     * 
     * @param activeSession The runtime ActiveSession created by opening the folder
     * @param appSession The persisted AppSession containing tab context
     */
    async function recoverWorkspaceTabs(activeSession: ActiveSession, appSession: AppSession) {
        const openedFilePaths = appSession.context?.openedAbsoluteFilePaths || [];
        
        if (openedFilePaths.length === 0) {
            return; // No tabs to recover
        }

        const { getFilesByPaths } = useActiveWorkspaceIndex(activeSession);
        const { openTabs } = useActiveTabs(activeSession);
        
        const files = getFilesByPaths(openedFilePaths);
        const fileUuids = files.map(file => file.uuid);
        
        if (fileUuids.length > 0) {
            openTabs(fileUuids);
        }
    }

    return {
        saturateSessionWindow,
        recoverWorkspaceTabs
    };
}
