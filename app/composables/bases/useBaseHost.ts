import type {BaseFile, BaseHost} from "@type32/obsidian-bases-parser";
import type {ActiveSession} from "#shared/types/active/sessions";
import {baseFile} from "#shared/utils/index/baseFile";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

/**
 * The workspace's files and link graph as Bases reads them, keyed by workspace-relative path: every file, not only
 * notes. Reactive: a query run in a `computed` re-runs when a file is created, edited, renamed or deleted.
 */
export function useBaseHost(session: ActiveSession) {
    const $index = useActiveWorkspaceIndex(session)
    const files = computed(() => {
        const byPath = new Map<string, {file: BaseFile, backlinks: string[]}>()
        for (const node of Object.values($index.fileIndex.value)) {
            if (!node.isFolder) byPath.set(node.relativePath, {file: baseFile(node), backlinks: node.backlinks})
        }
        return byPath
    })
    const paths = computed(() => [...files.value.keys()])
    // ponytail: links resolve as the link graph does (by name or path, first registered wins), not relative to `from`.
    const host: BaseHost = {
        file: path => files.value.get(path)?.file ?? null,
        resolve: link => $index.resolveLink(link)?.relativePath ?? null,
        backlinks: path => (files.value.get(path)?.backlinks ?? []).flatMap((id) => {
            const node = $index.getFileByUuid(id)
            return node ? [node.relativePath] : []
        }),
    }
    return {host, paths}
}
