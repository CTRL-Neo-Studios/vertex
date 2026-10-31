import {isBasesFile, isImage, isLatexFile, isPlainTextFile, isUnreadableAsText, isYamlFile} from "#shared/utils/fs/filenames";

/**
 * Which viewer opens which file. The tab page renders the first match; add new file types here and map
 * the id to its component in `app/components/viewerComponents.ts`.
 *
 * - `loadsText`: the tab page reads/autosaves the file as UTF-8 and binds it with `v-model`.
 * - `extras`: inputs beyond the common ones (`fileName`, `filePath`, `renaming`, `disabled`,
 *   `contentSaved`, `onRename`) that the tab page should pass to this viewer.
 */
export type ViewerId = 'markdown' | 'image' | 'bases' | 'yaml' | 'latex' | 'code'
export type ViewerExtra = 'editorInstance' | 'internalLinks' | 'codeBlocks' | 'sessionId' | 'imageSrc'

export interface ViewerDefinition {
    id: ViewerId
    loadsText: boolean
    extras: ViewerExtra[]
    /** Session modes the viewer supports (bases need the workspace index). */
    modes?: ('workspace' | 'singlespace')[]
    match: (ext: string) => boolean
}

export const viewers: ViewerDefinition[] = [
    {id: 'markdown', loadsText: true, extras: ['editorInstance', 'internalLinks', 'codeBlocks'], match: isPlainTextFile},
    {id: 'image', loadsText: false, extras: ['imageSrc'], match: isImage},
    {id: 'bases', loadsText: true, extras: ['internalLinks', 'sessionId'], modes: ['workspace'], match: isBasesFile},
    {id: 'yaml', loadsText: true, extras: [], match: isYamlFile},
    {id: 'latex', loadsText: true, extras: ['editorInstance'], match: isLatexFile},
    {id: 'code', loadsText: true, extras: ['editorInstance'], match: ext => !isUnreadableAsText(ext)},
]

export function viewerFor(ext: string, mode: 'workspace' | 'singlespace'): ViewerDefinition | undefined {
    return viewers.find(v => (!v.modes || v.modes.includes(mode)) && v.match(ext))
}
