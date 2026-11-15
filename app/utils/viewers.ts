import {isBasesFile, isCanvasFile, isImage, isLatexFile, isPlainTextFile, isUnreadableAsText, isWorkflowFile, isYamlFile} from "#shared/utils/fs/filenames";

/**
 * Which viewer opens which file. The tab page renders the first match; add new file types here and map
 * the id to its component in `app/components/viewerComponents.ts`.
 *
 * - `loadsText`: the tab page reads/autosaves the file as UTF-8 and binds it with `v-model`.
 * - `extras`: inputs beyond the common ones (`fileName`, `filePath`, `renaming`, `disabled`,
 *   `contentSaved`, `onRename`) that the tab page should pass to this viewer.
 */
export type ViewerId = 'markdown' | 'image' | 'bases' | 'workflow' | 'canvas' | 'yaml' | 'latex' | 'code'
export type ViewerExtra = 'editorInstance' | 'internalLinks' | 'codeBlocks' | 'sessionId' | 'imageSrc' | 'extensions'

export interface ViewerDefinition {
    id: ViewerId
    loadsText: boolean
    extras: ViewerExtra[]
    /** Session modes the viewer supports (bases and workflows need the workspace index). */
    modes?: ('workspace' | 'singlespace')[]
    match: (ext: string) => boolean
}

export const viewers: ViewerDefinition[] = [
    {id: 'markdown', loadsText: true, extras: ['editorInstance', 'internalLinks', 'codeBlocks', 'extensions'], match: isPlainTextFile},
    {id: 'image', loadsText: false, extras: ['imageSrc'], match: isImage},
    {id: 'bases', loadsText: true, extras: ['internalLinks', 'sessionId'], modes: ['workspace'], match: isBasesFile},
    {id: 'workflow', loadsText: true, extras: ['sessionId'], modes: ['workspace'], match: isWorkflowFile},
    // Cards show workspace files, so a canvas needs the index; in a singlespace it opens as JSON.
    {id: 'canvas', loadsText: true, extras: ['internalLinks', 'sessionId'], modes: ['workspace'], match: isCanvasFile},
    {id: 'yaml', loadsText: true, extras: [], match: isYamlFile},
    // Only the markdown editor exposes its CodeMirror view (`editorInstance`, for the outline's jumps).
    {id: 'latex', loadsText: true, extras: [], match: isLatexFile},
    {id: 'code', loadsText: true, extras: [], match: ext => !isUnreadableAsText(ext)},
]

export function viewerFor(ext: string, mode: 'workspace' | 'singlespace'): ViewerDefinition | undefined {
    return viewers.find(v => (!v.modes || v.modes.includes(mode)) && v.match(ext))
}
