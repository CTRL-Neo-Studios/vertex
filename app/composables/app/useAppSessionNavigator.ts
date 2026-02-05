import {open} from "@tauri-apps/plugin-dialog";
import {stat} from "@tauri-apps/plugin-fs"
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import useUuid from "~/composables/utility/useUuid";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {dirname} from "@tauri-apps/api/path"
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";
import {useAppWebviewWindows} from "~/composables/app/useAppWebviewWindows";
import type {ActiveSession} from "#shared/types/active/sessions";
import {defaultActiveSession} from "#shared/utils/defaults/actives";
import {useAppSessions} from "~/composables/app/useAppSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {UnlistenFn} from "@tauri-apps/api/event";
import {useActiveFileTreeMemo} from "~/composables/active/memoization/useActiveFileTreeMemo";

export function useAppSessionNavigator() {
    const $sesh = useActiveSessions()
    const $navi = useAppNavigator()
    const $win = useAppWebviewWindows()
    const $asesh = useAppSessions()

    async function retrieveFolderOrFileAbsolutePath(asFile: boolean) {
        let path: string | null

        if (asFile)
            path = await open({
                directory: false,
                filters: [{
                    name: 'Markdown Files',
                    extensions: ['md', 'mdx']
                }, {
                    name: 'Text Files',
                    extensions: ['txt']
                }, {
                    name: 'LaTeX Documents',
                    extensions: ['tex']
                }, {
                    name: 'Code Files',
                    extensions: ['java', 'cs', 'css', 'ts', 'js', 'jsx', 'tsx', 'yaml', 'yml', 'toml', 'json', 'vue', 'html']
                }]
            })
        else
            path = await open({
                directory: true
            })

        return path
    }

    /**
     * Open the selected folder or file.
     * @param asFile Should select only files or only folders.
     */
    async function openFolderOrFile(asFile: boolean) {
        const path = await retrieveFolderOrFileAbsolutePath(asFile)

        if (!path) return;

        await openFolderOrFileFromPath(path)
    }

    async function openFolderOrFileFromPath(absoluteFilePath: PossiblyRef<string>): Promise<{
        redirect: 'workspace' | 'singlespace',
        workingSession: ActiveSession
    } | undefined> {
        const path = unref(absoluteFilePath)
        const results = await stat(path)

        if (results.isSymlink) return;
        const sessionId = useUuid()
        if (results.isDirectory) {
            if (!$sesh.hasSessionWithPath(path)) {
                const sesh = $sesh.addSession(defaultActiveSession({
                    uuid: sessionId,
                    workspaceSession: true,
                    rootPath: path
                }))
                await $navi.toWorkspaceEmptyTab(sessionId)
                return {
                    redirect: 'workspace',
                    workingSession: sesh
                }
            } else {
                // No longer needed; handled on the use-end
            }
        } else if (results.isFile) {
            const parentPath: string = await dirname(path)
            if (!$sesh.hasSessionWithPath(path) && !$sesh.hasSessionWithPath(parentPath)) {
                const sesh = $sesh.addSession(defaultActiveSession({
                    uuid: sessionId,
                    workspaceSession: false,
                    rootPath: parentPath
                }))

                const {initializeIndex} = useActiveSinglespaceIndex(sesh)

                const index = await initializeIndex(path)

                const {
                    openTab
                } = useActiveTabs(sesh)
                await $navi.toSinglespaceTab(sessionId, openTab(index.uuid))

                return {
                    redirect: 'singlespace',
                    workingSession: sesh
                }
            } else {
                // No longer needed; handled on the use-end
            }
        } else {
            console.error("[Reptilian Brain] Never ever ever baby!")
        }
    }

    /**
     * Closes the current window and tries to return to the last opened window. It will only return to the main window when there is no more session windows.
     * @param session
     */
    async function destroyWindowAndTryReturnToLastWindow(session: ActiveSession) {
        if ($win.isCurrentAppWindowMain()) return;

        const currentWindow = $win.getCurrentAppWindow()

        await updateAppSessionContexts(session)

        if ((await $win.getSessionWindows()).length <= 1) {
            const mainWindow = await $win.showMainWindow()
            await mainWindow?.setFocus()
        }

        await currentWindow.destroy()
    }

    async function updateAppSessionContexts(session: ActiveSession) {
        const currentAppSession = unref($asesh.currentAppSession)

        if (!currentAppSession) return;

        if (currentAppSession.sessionType == 'workspace') {
            const {getFileByUuid} = useActiveWorkspaceIndex(session)
            const {activeTabUuid} = useActiveTabs(session)
            const {getFromIdMeta} = useActiveFileTreeMemo(session)
            const expandedFolders = useState<string[]>(`active.workspace.expanded-file-tree-items-${session?.uuid ?? useUuid()}`, () => [])
            const tabId = unref(activeTabUuid)

            await $asesh.updateAppSession(currentAppSession.uuid, {
                context: {
                    openedAbsoluteFilePaths: unref(useActiveTabs(session).tabs)
                        .map(i => getFileByUuid(i.fileUuid)?.fullPath)
                        .filter(i => i != undefined),
                    openedAbsoluteFolderPaths: unref(expandedFolders)
                        .map(i => getFileByUuid(getFromIdMeta(i)?.fid)?.fullPath)
                        .filter(i => i != undefined),
                    lastFocusedAbsoluteFilePath: tabId != null ? getFileByUuid(tabId)?.fullPath : undefined
                },
                lastUpdated: new Date()
            })
        } else {
            const {getFileByUuid} = useActiveSinglespaceIndex(session)
            await $asesh.updateAppSession(currentAppSession.uuid, {
                context: {
                    openedAbsoluteFilePaths: unref(useActiveTabs(session).tabs)
                        .map(i => getFileByUuid(i.fileUuid)?.fullPath)
                        .filter(i => i != undefined),
                    openedAbsoluteFolderPaths: [],
                },
                lastUpdated: new Date()
            })
        }
    }

    async function addWindowCloseCallbacks(session: ActiveSession): Promise<{ unlistenClose: UnlistenFn, unlistenDestroyed: UnlistenFn} | undefined> {
        const currentWindow = $win.getCurrentAppWindow()
        const currentAppSession = unref($asesh.currentAppSession)

        if (!currentAppSession) return;

        const unlistenClose = await currentWindow.listen('tauri://close-requested', async function (event) {
            await destroyWindowAndTryReturnToLastWindow(session)
        })

        const unlistenDestroyed = await currentWindow.listen('tauri://destroyed', async function (event) {
            await destroyWindowAndTryReturnToLastWindow(session)
        })

        console.log('Added window callbacks.')

        return {
            unlistenClose,
            unlistenDestroyed
        }
    }

    return {
        openFolderOrFile,
        openFolderOrFileFromPath,
        retrieveFolderOrFileAbsolutePath,
        destroyWindowAndTryReturnToLastWindow,
        addWindowCloseCallbacks,
        updateAppSessionContexts
    }
}