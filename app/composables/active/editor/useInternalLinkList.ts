import type {EmbedMount, InternalLink} from "@type32/codemirror-rich-obsidian-editor";
import type {EmbedDef} from "#shared/plugin/api";
import type {ActiveSession} from "#shared/types/active/sessions";
import {fileNameFromPath, getFileExtensionFromPath, isPlainTextFile} from "#shared/utils/fs/filenames";
import {embeds} from "~/utils/contributions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

/**
 * What the markdown editor's links and embeds can point to (`<Editor :internal-link-map>`): the workspace's notes, and
 * the files a registered embed draws (`embeds`), each with the editor's mount for that embed (`mountOf`, one function per
 * registration). Empty in a singlespace window.
 */
export function useInternalLinkList(session: ActiveSession | undefined, mountOf: (def: EmbedDef) => EmbedMount) {
    const $index = useActiveWorkspaceIndex(session)
    return computed<InternalLink[]>(() => {
        if (!session?.workspaceSession) return []
        const defs = [...embeds.items.values()]
        return $index.getFilteredFiles(f => !f.isFolder).flatMap(f => {
            const ext = getFileExtensionFromPath(f.fileName)
            const name = fileNameFromPath(f.fullPath, true)
            if (isPlainTextFile(ext)) return [{name, filePath: f.relativePath, referenceId: f.uuid} satisfies InternalLink]
            const def = defs.find(d => d.match(ext))
            if (!def) return []
            // Files other than notes are linked by their full name by default, as Obsidian links them: `![[pic.png]]`
            // resolves there, `![[pic]]` doesn't.
            return [{
                name: def.linkName === 'name' ? name : f.fileName, filePath: f.relativePath, referenceId: f.uuid,
                embedMount: mountOf(def),
                ...(def.props && {componentProps: def.props(f)}),
            } satisfies InternalLink]
        })
    })
}
