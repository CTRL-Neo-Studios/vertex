import type {NoteMeta} from "#shared/utils/index/parse";

/** A file's properties as parsed: a note's frontmatter, a YAML file's body. */
export type NoteProperties = Record<string, unknown>

/*
Usage Scope: Active Workspaces
 */
export interface ActiveWorkspaceFileIndex {
    uuid: string;
    fullPath: string;
    relativePath: string,
    fileName: string,
    fileExt: string,
    isFolder: boolean,
    size: number,
    children: string[]
    properties: NoteProperties,
    /** Its `icon` property when that's text (a folder's comes from its properties file): what the file tree reads. */
    icon?: string
    forelinks: string[]
    backlinks: string[]
    /** Body tags, link texts and embeds of a note, for Bases; empty for other files. */
    meta: NoteMeta
    createdTime: Date,
    modifiedTime: Date,
}

/** What the file tree shows of an index entry: nothing a save changes but its icon, so saving doesn't rebuild the tree. */
export interface UITreeNode extends Pick<ActiveWorkspaceFileIndex, 'uuid' | 'fileName' | 'relativePath' | 'isFolder' | 'icon'> {
    children: UITreeNode[]
}

/** `removedNodes` holds every entry removed (folder contents included). */
export type WorkspaceIndexEvent =
    | { type: 'create'; path: string; }
    | { type: 'remove'; path: string; removedNodes: ActiveWorkspaceFileIndex[] }
    | { type: 'rename'; oldPath: string; newPath: string; }
    | { type: 'modify'; path: string; }
    /**
     * Anything under the root changed on disk, dot paths (`.git/`) and the app's own writes included; whole-folder
     * watches only. For views that re-read their state from disk, like git's status.
     */
    | { type: 'changed'; paths: string[]; };

export type WorkspaceIndexListener = (event: WorkspaceIndexEvent) => void;
