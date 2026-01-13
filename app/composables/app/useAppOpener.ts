import {open} from "@tauri-apps/plugin-dialog";
import {stat} from "@tauri-apps/plugin-fs"
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {defaultActiveSession} from "#shared/utils/defaults/apps";
import useUuid from "~/composables/utility/useUuid";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {dirname} from "@tauri-apps/api/path"
import {useActiveSinglespaceIndex} from "~/composables/active/useActiveSinglespaceIndex";

export function useAppOpener() {
    const $sesh = useActiveSessions()
    const $navi = useAppNavigator()

    async function openFolderOrFile() {
        const path = await open({
            // directory: true,
            filters: [{
                name: 'Markdown Files',
                extensions: ['md', 'mdx']
            }, {
                name: 'Text Files',
                extensions: ['txt']
            }]
        })

        if (!path) return;

        const results = await stat(path)

        if (results.isSymlink) return;
        const sessionId = useUuid()
        if (results.isDirectory) {
            if (!$sesh.hasSessionWithPath(path)) {
                $sesh.addSession(defaultActiveSession({
                    uuid: sessionId,
                    workspaceSession: true,
                    rootPath: path
                }))
                await $navi.toWorkspaceEmptyTab(sessionId)
            } else {
                // TODO: jump to that window
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
            } else {
                // TODO: jump to that window; Since we're using the parent dir as a reference, it might be a workspace window or a singlespace window
            }
        } else {
            console.error("[Reptilian Brain] Never ever ever baby!")
        }
    }

    return {
        openFolderOrFile
    }
}