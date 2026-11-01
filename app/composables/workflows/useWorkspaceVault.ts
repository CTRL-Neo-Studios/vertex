import {exists, mkdir, readDir, readTextFile, rename, writeTextFile} from "@tauri-apps/plugin-fs"
import type {ActiveSession} from "#shared/types/active/sessions"
import {parentOf, type Vault, type VaultEntry} from "#shared/workflows/vault"
import {useActiveTabs} from "~/composables/active/useActiveTabs"
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex"

/**
 * The workspace as a workflow Vault. Paths are vault-relative; every change goes through the index the same way
 * the app's own edits do (self-write marks, index moves, open tabs told to reload), so the file tree, backlinks and
 * tabs stay in sync and the watcher doesn't re-process the run's own writes.
 */
export function useWorkspaceVault(session: ActiveSession): Vault {
    const root = session.rootPath
    if (!root) throw new Error('Workflows need a workspace folder')
    const $index = useActiveWorkspaceIndex(session)
    const $tabs = useActiveTabs(session)
    const abs = (path: string) => (path ? `${root}/${path}` : root)
    const hidden = (path: string) => path.startsWith('.vertex/')

    const toEntry = (node: {relativePath: string, isFolder: boolean, properties: unknown}): VaultEntry => ({
        path: node.relativePath,
        isFolder: node.isFolder,
        properties: (node.properties ?? {}) as Record<string, unknown>,
    })

    /** Indexes a path and, for a folder, everything under it (hidden names skipped, as in a scan). */
    async function addTree(path: string) {
        const node = await $index.addFileToIndex(path, root)
        if (!node?.isFolder) return
        for (const e of await readDir(path)) if (!e.name.startsWith('.')) await addTree(`${path}/${e.name}`)
    }

    return {
        entry(path) {
            const node = $index.getFileByPath(abs(path))
            return node && node.relativePath ? toEntry(node) : undefined
        },
        entries() {
            return $index.getFilteredFiles(f => f.relativePath !== '').map(toEntry)
        },
        linksTo(path) {
            const node = $index.getFileByPath(abs(path))
            if (!node || node.isFolder) return []
            return $index.getRenameImpact(node.uuid).map(({file, targets}) => ({file: file.relativePath, targets}))
        },
        read: path => readTextFile(abs(path)),
        async write(path, text) {
            const full = abs(path)
            $index.markSelfWrite(full)
            await writeTextFile(full, text)
            await $index.updateIndex(full, text)
            $index.notifyModified(full)
        },
        async move(from, to) {
            const [src, dest] = [abs(from), abs(to)]
            if (from.toLowerCase() !== to.toLowerCase() && await exists(dest)) throw new Error(`"${to}" already exists`)
            // Mark every folder this creates, so the watcher doesn't index `.vertex/…` on its create events.
            const created: string[] = []
            for (let dir = parentOf(to); dir && !(await exists(abs(dir))); dir = parentOf(dir)) created.push(abs(dir))
            $index.markSelfWrite(src, dest, ...created)
            if (created.length) await mkdir(abs(parentOf(to)), {recursive: true})
            await rename(src, dest)
            if (hidden(to)) {
                // Into the trash: out of the index, and its tab closes like a deleted file's.
                for (const node of $index.removeFileFromIndex(src)) $tabs.closeTab(node.uuid)
            } else if (hidden(from)) {
                await addTree(dest)
            } else {
                await $index.moveFileInIndex(src, dest, root)
            }
        },
    }
}
