import type {YamlFormData} from "@type32/yaml-editor-form";

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
    properties: YamlFormData,
    forelinks: string[]
    backlinks: string[]
    createdTime: Date,
    modifiedTime: Date,
}

export interface UITreeNode extends Omit<ActiveWorkspaceFileIndex, 'children'> {
    children: UITreeNode[]
}

/** `removedNodes` holds every entry removed (folder contents included). */
export type WorkspaceIndexEvent =
    | { type: 'create'; path: string; }
    | { type: 'remove'; path: string; removedNodes: ActiveWorkspaceFileIndex[] }
    | { type: 'rename'; oldPath: string; newPath: string; }
    | { type: 'modify'; path: string; }
    /** Something under `.vertex/chats/` changed (sync, another device); the index itself ignores dot paths. */
    | { type: 'chats'; path: string; }
    /**
     * Anything under the root changed on disk, dot paths (`.git/`) and the app's own writes included; whole-folder
     * watches only. For views that re-read their state from disk, like git's status.
     */
    | { type: 'changed'; paths: string[]; };

export type WorkspaceIndexListener = (event: WorkspaceIndexEvent) => void;
