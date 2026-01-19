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

export function useAppSessionNavigator() {
    const $sesh = useActiveSessions()
    const $navi = useAppNavigator()
    const $win = useAppWebviewWindows()

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

    return {
        openFolderOrFile,
        openFolderOrFileFromPath,
        retrieveFolderOrFileAbsolutePath
    }
}