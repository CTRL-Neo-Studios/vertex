import type {BaseFile, BaseHost} from "@type32/obsidian-bases-parser";
import type {SessionContext} from "#shared/plugin/api";
import {baseFile} from "./baseFile";

/**
 * The workspace's files and link graph as Bases reads them, keyed by workspace-relative path: every file, not only
 * notes. Reactive: a query run in a `computed` re-runs when a file is created, edited, renamed or deleted.
 */
export function useBaseHost({index}: SessionContext) {
    const files = computed(() => {
        const byPath = new Map<string, {file: BaseFile, backlinks: string[]}>()
        for (const node of index.files()) {
            if (!node.isFolder) byPath.set(node.relativePath, {file: baseFile(node), backlinks: node.backlinks})
        }
        return byPath
    })
    const paths = computed(() => [...files.value.keys()])
    // ponytail: links resolve as the link graph does (by name or path, first registered wins), not relative to `from`.
    const host: BaseHost = {
        file: path => files.value.get(path)?.file ?? null,
        resolve: link => index.resolveLink(link)?.relativePath ?? null,
        backlinks: path => (files.value.get(path)?.backlinks ?? []).flatMap((id) => {
            const node = index.byUuid(id)
            return node ? [node.relativePath] : []
        }),
    }
    return {host, paths}
}
