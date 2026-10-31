import {save} from "@tauri-apps/plugin-dialog";
import {defaultAppSession, defaultAppSessionContext} from "#shared/utils/defaults/apps";
import type {AppSession} from "#shared/types/app/sessions";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useFileIO} from "~/composables/io/useFileIO";
import useQuickToasts from "~/composables/utility/useQuickToasts";

/**
 * User-facing "open something" actions, callable from menus, buttons and the OS open queue.
 * Each opened path gets one persisted AppSession and one `session-{uuid}` window; reopening a path
 * focuses its existing window. The new window initializes itself from /loading.
 */
export function useAppSessionActions() {
    const $sessions = useAppSessions()
    const $open = useAppSessionNavigator()
    const $fio = useFileIO()
    const $qt = useQuickToasts()

    /**
     * Opens a folder picker and creates a new workspace session window.
     * Intended to be called from the main window.
     */
    async function openWorkspaceAction() {
        const path = await $open.pickPath(false)
        if (!path) return; // User cancelled

        return await openWorkspaceFromPath(path)
    }

    /**
     * Opens a file picker and creates a new singlespace session window.
     * Intended to be called from the main window.
     */
    async function openSinglespaceAction() {
        const path = await $open.pickPath(true)
        if (!path) return; // User cancelled

        return await openSinglespaceFromPath(path)
    }

    async function createNewFileForSinglespace(openImmediately: boolean = true) {
        const path = await save({
            filters: [{
                name: 'Markdown Files',
                extensions: ['md']
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

    async function openFromPath(path: string | undefined, sessionType: AppSession['sessionType']) {
        if (!path || !(await $fio.pathExists(path))) return

        await $sessions.load()
        const existing = $sessions.getAppSessionFromAbsolutePath(path)
        if (existing) {
            const window = await $sessions.getWebviewWindowWithAppSession(existing)
            if (window) return window.setFocus()
        }
        const session = existing ?? await $sessions.addAppSession(defaultAppSession({
            rootFileOrFolderAbsolutePath: path,
            sessionType,
            context: defaultAppSessionContext({openedAbsoluteFilePaths: sessionType === 'singlespace' ? [path] : []}),
        }))
        await $sessions.createWindowFromAppSession(session)
    }

    /** Open a folder as a workspace (e.g. "Open Recent"). */
    const openWorkspaceFromPath = (path?: string) => openFromPath(path, 'workspace')
    /** Open a single file as a singlespace (e.g. "Open Recent", OS file association). */
    const openSinglespaceFromPath = (path?: string) => openFromPath(path, 'singlespace')

    return {
        // Actions with file picker
        openWorkspaceAction,
        openSinglespaceAction,
        
        // Actions with known paths (for "Open Recent", drag & drop, etc.)
        openWorkspaceFromPath,
        openSinglespaceFromPath,
        createNewFileForSinglespace
    }
}
