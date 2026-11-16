import {convertFileSrc} from "@tauri-apps/api/core";
import type {InternalLink} from "@type32/codemirror-rich-obsidian-editor";
import type {ActiveSession} from "#shared/types/active/sessions";
import {fileNameFromPath, getFileExtensionFromPath, isBasesFile, isImage, isPlainTextFile} from "#shared/utils/fs/filenames";
import {EditorProseEmbedImageDisplay, ViewerEditorBasesEmbed} from "#components";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

/**
 * What the markdown editor's links and embeds can point to (`<Editor :internal-link-map>`): the workspace's notes,
 * images and bases. Empty in a singlespace window.
 */
export function useInternalLinkList(session: ActiveSession | undefined) {
    const $index = useActiveWorkspaceIndex(session)
    return computed<InternalLink[]>(() => {
        if (!session?.workspaceSession) return []
        return $index.getFilteredFiles(f => !f.isFolder).flatMap(f => {
            const ext = getFileExtensionFromPath(f.fileName)
            const name = fileNameFromPath(f.fullPath, true)
            if (isPlainTextFile(ext)) return [{name, filePath: f.relativePath, referenceId: f.uuid} satisfies InternalLink]
            // Files other than notes are linked by their full name, as Obsidian links them: `![[pic.png]]` resolves there,
            // `![[pic]]` doesn't.
            if (isImage(ext)) return [{
                name: f.fileName, filePath: f.relativePath, referenceId: f.uuid,
                embedComponent: EditorProseEmbedImageDisplay,
                componentProps: {srcPath: convertFileSrc(f.fullPath), display: name},
            } satisfies InternalLink]
            if (isBasesFile(ext)) return [{name: f.fileName, filePath: f.relativePath, referenceId: f.uuid, embedComponent: ViewerEditorBasesEmbed} satisfies InternalLink]
            return []
        })
    })
}
