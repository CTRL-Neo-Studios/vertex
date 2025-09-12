import {open} from "@tauri-apps/plugin-dialog";
import {stat} from "@tauri-apps/plugin-fs"
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {defaultActiveSession} from "#shared/utils/defaults/apps";
import useUuid from "~/composables/utility/useUuid";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveTabs} from "~/composables/active/useActiveTabs";

export function useAppOpener() {
    const $sesh = useActiveSessions()
    const $navi = useAppNavigator()

    async function openFolderOrFile() {
        const path = await open({
            directory: true,
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
        } else {
            if (!$sesh.hasSessionWithPath(path)) {
                const sesh = $sesh.addSession(defaultActiveSession({
                    uuid: sessionId,
                    workspaceSession: false
                }))

                const {
                    openTab
                } = useActiveTabs(sesh)
                await $navi.toSinglespaceTab(sessionId, openTab(useUuid()))
            } else {
                // TODO: jump to that window
            }
        }
    }

    return {
        openFolderOrFile
    }
}