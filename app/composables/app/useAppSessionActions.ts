import {save} from "@tauri-apps/plugin-dialog";
import {create, exists, mkdir} from "@tauri-apps/plugin-fs";
import {defaultAppSession} from "#shared/utils/defaults/apps";
import {sessionWindowLabel} from "#shared/constants/app";
import type {AppSession} from "#shared/types/app/sessions";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useAppSessionNavigator} from "~/composables/app/useAppSessionNavigator";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import GitCloneModal from "~/components/Git/GitCloneModal.vue";

/**
 * User-facing "open something" actions, callable from menus, buttons and the OS open queue.
 * Each opened path gets one persisted AppSession and one `session-{uuid}` window; reopening a path
 * focuses its existing window. The new window initializes itself from /loading.
 */
export function useAppSessionActions() {
    const $sessions = useAppSessions()
    const $open = useAppSessionNavigator()
    const $win = useAppWebviewWindows()
    const $qt = useQuickToasts()
    const $toast = useToast()
    const {t} = useI18n()
    const overlay = useOverlay()

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
            title: t('app.home.createFileDialog'),
        })

        if (!path) return;

        if (await exists(path)) {
            $qt.error(t('app.home.fileExists'))
            return;
        }

        if (!['.md', '.txt', '.mdx'].some(ext => path.endsWith(ext))) {
            $qt.error(t('app.home.notMarkdown'))
            return;
        }

        try {
            await (await create(path)).close()

            if (openImmediately) {
                await openSinglespaceFromPath(path)
            }
        } catch(e) {
            console.error(e)
            $qt.error(t('app.home.createFailed'), e instanceof Error ? e.message : String(e));
        }

        return path;
    }

    /** A save dialog for the new folder's place and name; creates it and opens it as a workspace. */
    async function newWorkspaceAction() {
        const path = await save({title: t('app.home.newWorkspaceDialog'), defaultPath: t('app.home.newWorkspaceName')})
        if (!path) return
        if (await exists(path)) return $qt.error(t('app.home.folderExists'), path)
        try {
            await mkdir(path, {recursive: true})
        } catch (e) {
            return $qt.error(t('app.home.createFailed'), e instanceof Error ? e.message : String(e))
        }
        return openWorkspaceFromPath(path)
    }

    /** Clones a repository into a new folder (`GitCloneModal`) and opens it as a workspace. */
    async function cloneWorkspaceAction() {
        const path = await overlay.create(GitCloneModal, {destroyOnClose: true}).open().result
        if (path) await openWorkspaceFromPath(path)
    }

    /** The path is gone: says so, offering to drop its recent entry. */
    function notFound(path: string, session: AppSession | undefined) {
        $toast.add({
            title: t('app.home.notFound'),
            description: path,
            color: 'warning',
            icon: 'i-lucide-folder-x',
            ...(session && {
                actions: [{
                    label: t('app.home.removeRecent'),
                    color: 'neutral' as const,
                    variant: 'outline' as const,
                    onClick: () => void $sessions.removeAppSession(session.uuid),
                }],
            }),
        })
    }

    /** Opens `path` in its own window, or brings that window forward (unminimized) when it's open already. */
    async function openFromPath(path: string | undefined, sessionType: AppSession['sessionType']) {
        if (!path) return
        await $sessions.load()
        const existing = $sessions.getAppSessionFromAbsolutePath(path)
        if (!(await exists(path))) return notFound(path, existing)
        if (existing && await $win.showWindowWithLabel(sessionWindowLabel(existing.uuid))) return
        const session = existing ?? await $sessions.addAppSession(defaultAppSession({rootFileOrFolderAbsolutePath: path, sessionType}))
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
        newWorkspaceAction,
        cloneWorkspaceAction,

        // Actions with known paths (for "Open Recent", drag & drop, etc.)
        openWorkspaceFromPath,
        openSinglespaceFromPath,
        createNewFileForSinglespace
    }
}
