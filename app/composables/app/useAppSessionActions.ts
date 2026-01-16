import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppOpener} from "~/composables/app/useAppOpener";
import useUuid from "~/composables/utility/useUuid";
import {defaultAppSession} from "#shared/utils/defaults/apps";
import {useFileIO} from "~/composables/io/useFileIO";

/**
 * High-level actions for session/window management.
 * 
 * This composable provides reusable actions that can be triggered from:
 * - Native application menus
 * - Keyboard shortcuts
 * - UI buttons
 * - Context menus
 * 
 * Architecture Note:
 * This is a Layer 4 composable that orchestrates window creation by:
 * 1. Creating AppSession (Layer 1: useAppSessions)
 * 2. Creating the webview window (Window Manager)
 * 3. Hiding the main window (following the anchor pattern)
 * 
 * The newly created window will then:
 * 1. Initialize itself (plugin: initialize.client.ts)
 * 2. Fetch its AppSession
 * 3. Saturate itself (Layer 3: useAppSessionRecovery)
 */
export function useAppSessionActions() {
    const $sessions = useAppSessions()
    const $win = useAppWebviewWindows()
    const $open = useAppOpener()
    const $fio = useFileIO()

    /**
     * Opens a folder picker and creates a new workspace session window.
     * Intended to be called from the main window.
     */
    async function openWorkspaceAction() {
        const path = await $open.retrieveFolderOrFileAbsolutePath(false) // false = folder
        if (!path) return; // User cancelled

        // Step 1: Create and persist the AppSession
        const session = await $sessions.addAppSession(defaultAppSession({
            uuid: useUuid(),
            rootFileOrFolderAbsolutePath: path,
            sessionType: 'workspace',
            context: {
                openedAbsoluteFilePaths: []
            }
        }))

        // Step 2: Create the webview window
        const windowTitle = await $fio.getFileNameFromPath(path, true)
        $win.createAppWebviewWindow('/loading', `session-${session.uuid}`, windowTitle)

        // Step 3: Hide the main window (anchor pattern)
        const mainWindow = await $win.getCurrentAppWindow()
        if (await $win.isCurrentAppWindowMain()) {
            await mainWindow.hide()
        }
    }

    /**
     * Opens a file picker and creates a new singlespace session window.
     * Intended to be called from the main window.
     */
    async function openSinglespaceAction() {
        const path = await $open.retrieveFolderOrFileAbsolutePath(true) // true = file
        if (!path) return; // User cancelled

        // Step 1: Create and persist the AppSession
        const session = await $sessions.addAppSession(defaultAppSession({
            uuid: useUuid(),
            rootFileOrFolderAbsolutePath: path,
            sessionType: 'singlespace',
            context: {
                openedAbsoluteFilePaths: [path] // For singlespace, the file itself is the opened file
            }
        }))

        // Step 2: Create the webview window
        const windowTitle = await $fio.getFileNameFromPath(path, false) // false = include extension for files
        $win.createAppWebviewWindow('/loading', `session-${session.uuid}`, windowTitle)

        // Step 3: Hide the main window (anchor pattern)
        const mainWindow = await $win.getCurrentAppWindow()
        if (await $win.isCurrentAppWindowMain()) {
            await mainWindow.hide()
        }
    }

    /**
     * Generic action to open a workspace from a known path.
     * Useful for "Open Recent" functionality.
     * 
     * @param path Absolute path to the folder
     */
    async function openWorkspaceFromPath(path: string) {
        const session = await $sessions.addAppSession(defaultAppSession({
            uuid: useUuid(),
            rootFileOrFolderAbsolutePath: path,
            sessionType: 'workspace',
            context: {
                openedAbsoluteFilePaths: []
            }
        }))

        const windowTitle = await $fio.getFileNameFromPath(path, true)
        $win.createAppWebviewWindow('/loading', `session-${session.uuid}`, windowTitle)

        const mainWindow = await $win.getCurrentAppWindow()
        if (await $win.isCurrentAppWindowMain()) {
            await mainWindow.hide()
        }
    }

    /**
     * Generic action to open a singlespace from a known path.
     * Useful for "Open Recent" functionality.
     * 
     * @param path Absolute path to the file
     */
    async function openSinglespaceFromPath(path: string) {
        const session = await $sessions.addAppSession(defaultAppSession({
            uuid: useUuid(),
            rootFileOrFolderAbsolutePath: path,
            sessionType: 'singlespace',
            context: {
                openedAbsoluteFilePaths: [path]
            }
        }))

        const windowTitle = await $fio.getFileNameFromPath(path, false)
        $win.createAppWebviewWindow('/loading', `session-${session.uuid}`, windowTitle)

        const mainWindow = await $win.getCurrentAppWindow()
        if (await $win.isCurrentAppWindowMain()) {
            await mainWindow.hide()
        }
    }

    return {
        // Actions with file picker
        openWorkspaceAction,
        openSinglespaceAction,
        
        // Actions with known paths (for "Open Recent", drag & drop, etc.)
        openWorkspaceFromPath,
        openSinglespaceFromPath,
        
        // Aliases for backward compatibility (if needed)
        openFolderAction: openWorkspaceAction,
        openFileAction: openSinglespaceAction,
    }
}
