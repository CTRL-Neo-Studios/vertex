import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import useUuid from "~/composables/utility/useUuid";
import {defaultAppSession} from "#shared/utils/defaults/apps";
import {useFileIO} from "~/composables/io/useFileIO";
import type {AppSession} from "#shared/types/app/sessions";
import {save} from "@tauri-apps/plugin-dialog";
import useQuickToasts from "~/composables/utility/useQuickToasts";

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
    const $open = useAppSessionNavigator()
    const $fio = useFileIO()
    const $qt = useQuickToasts()

    /**
     * Opens a folder picker and creates a new workspace session window.
     * Intended to be called from the main window.
     */
    async function openWorkspaceAction() {
        const path = await $open.retrieveFolderOrFileAbsolutePath(false) // false = folder
        if (!path) return; // User cancelled

        return await openWorkspaceFromPath(path)
    }

    /**
     * Opens a file picker and creates a new singlespace session window.
     * Intended to be called from the main window.
     */
    async function openSinglespaceAction() {
        const path = await $open.retrieveFolderOrFileAbsolutePath(true) // true = file
        if (!path) return; // User cancelled

        return await openSinglespaceFromPath(path)
    }

    async function createNewFileForSinglespace(openImmediately: boolean = true) {
        let path = await save({
            filters: [{
                name: 'Markdown Files',
                extensions: ['md', 'mdx']
            }, {
                name: 'Text Files',
                extensions: ['txt']
            }],
            title: 'Create new Markdown/Text File',
        })

        if (!path) return;

        if (await $fio.pathExists(path)) {
            $qt.error('A file already exists in that path.')
            return;
        }

        const fileName = await $fio.getFileNameFromPath(path)
        const allowedExtensions: string[] = [".md", ".txt", "mdx"]

        // If the returned file path does not end with any extensions listed above
        console.log(`returned path ${path}`)
        if (allowedExtensions.findIndex(i => fileName.endsWith(i)) == -1) {
            $qt.error('Your file must be a Markdown/Text file.')
            return;
        }

        try {
            const file = await $fio.createFile(path)
            await file?.close()

            if (openImmediately) {
                await openSinglespaceFromPath(path)
            }
        } catch(e: any) {
            console.error(e)
            $qt.error('Unable to create file', e.message);
        }

        return path;
    }

    /**
     * Generic action to open a workspace from a known path.
     * Useful for "Open Recent" functionality.
     * 
     * @param path Absolute path to the folder
     */
    async function openWorkspaceFromPath(path?: string) {
        if (!path || !(await $fio.pathExists(path))) return;

        async function createWindow(path: string, existingSession?: AppSession) {
            let session
            if (!existingSession)
                session = await $sessions.addAppSession(defaultAppSession({
                    uuid: useUuid(),
                    rootFileOrFolderAbsolutePath: path,
                    sessionType: 'workspace',
                    context: {
                        openedAbsoluteFilePaths: []
                    }
                }))
            else
                session = existingSession

            return await $sessions.createWindowFromAppSession(session)
        }

        const sesh = await $sessions.getAppSessionFromAbsolutePath(path)
        if (sesh) {
            const window = await $sessions.getWebviewWindowWithAppSession(sesh)
            if (window) {
                await window.setFocus()
            } else {
                return await createWindow(path, sesh)
            }
        } else {
            return await createWindow(path)
        }
    }

    /**
     * Generic action to open a singlespace from a known path.
     * Useful for "Open Recent" functionality.
     * 
     * @param path Absolute path to the file
     */
    async function openSinglespaceFromPath(path?: string) {
        if (!path || !(await $fio.pathExists(path))) return;

        async function createWindow(path: string, existingSession?: AppSession) {
            let session
            if (!existingSession)
                session = await $sessions.addAppSession(defaultAppSession({
                    uuid: useUuid(),
                    rootFileOrFolderAbsolutePath: path,
                    sessionType: 'singlespace',
                    context: {
                        openedAbsoluteFilePaths: [path]
                    }
                }))
            else
                session = existingSession

            return await $sessions.createWindowFromAppSession(session)
        }

        const sesh = await $sessions.getAppSessionFromAbsolutePath(path)
        if (sesh) {
            const window = await $sessions.getWebviewWindowWithAppSession(sesh)
            if (window) {
                await window.setFocus()
            } else {
                return await createWindow(path, sesh)
            }
        } else {
            return await createWindow(path)
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

        createNewFileForSinglespace
    }
}
