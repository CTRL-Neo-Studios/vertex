import {open} from "@tauri-apps/plugin-dialog";
import {stat} from "@tauri-apps/plugin-fs"
import {dirname} from "@tauri-apps/api/path"
import type {ActiveSession} from "#shared/types/active/sessions";
import {defaultActiveSession} from "#shared/utils/defaults/actives";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";

const FILE_PICKER_FILTERS = [
    {name: 'Markdown Files', extensions: ['md', 'mdx']},
    {name: 'Text Files', extensions: ['txt']},
    {name: 'LaTeX Documents', extensions: ['tex']},
    {name: 'Code Files', extensions: ['java', 'cs', 'css', 'ts', 'js', 'jsx', 'tsx', 'yaml', 'yml', 'toml', 'json', 'vue', 'html']},
]

/**
 * Turns a path on disk into a runtime ActiveSession inside the current window and routes to it.
 * Knows nothing about persistence or other windows.
 */
export function useAppSessionNavigator() {
    const $sesh = useActiveSessions()
    const $navi = useAppNavigator()

    function pickPath(asFile: boolean) {
        return open(asFile ? {directory: false, filters: FILE_PICKER_FILTERS} : {directory: true})
    }

    async function openFolderOrFileFromPath(absolutePath: PossiblyRef<string>): Promise<{
        redirect: 'workspace' | 'singlespace',
        workingSession: ActiveSession
    } | undefined> {
        const path = unref(absolutePath)
        const info = await stat(path)
        if (info.isSymlink) {
            console.error(`[useAppSessionNavigator] refusing to open symlink: ${path}`)
            return
        }
        const uuid = crypto.randomUUID()

        if (info.isDirectory) {
            if ($sesh.hasSessionWithPath(path)) return
            const session = $sesh.addSession(defaultActiveSession({uuid, workspaceSession: true, rootPath: path}))
            await $navi.toWorkspaceEmptyTab(uuid)
            return {redirect: 'workspace', workingSession: session}
        }

        const parentPath = await dirname(path)
        if ($sesh.hasSessionWithPath(path) || $sesh.hasSessionWithPath(parentPath)) return
        const session = $sesh.addSession(defaultActiveSession({uuid, workspaceSession: false, rootPath: parentPath}))
        const node = await useActiveWorkspaceIndex(session).openFile(path)
        if (!node) return
        await $navi.toSinglespaceTab(uuid, useActiveTabs(session).openTab(node.uuid))
        return {redirect: 'singlespace', workingSession: session}
    }

    return {
        pickPath,
        openFolderOrFileFromPath,
    }
}
