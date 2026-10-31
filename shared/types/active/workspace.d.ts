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
    | { type: 'modify'; path: string; };

export type WorkspaceIndexListener = (event: WorkspaceIndexEvent) => void;
