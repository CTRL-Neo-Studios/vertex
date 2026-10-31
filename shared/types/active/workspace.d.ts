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

export interface ActiveSinglespaceFileIndex {
    uuid: string;
    fullPath: string;
    fileName: string,
    properties: YamlFormData,
}

export interface UITreeNode extends Omit<ActiveWorkspaceFileIndex, 'children'> {
    children: UITreeNode[]
}

/** Emitted by both index kinds; `removedNodes` holds every entry removed (folder contents included). */
export type IndexEvent<T = ActiveWorkspaceFileIndex> =
    | { type: 'create'; path: string; }
    | { type: 'remove'; path: string; removedNodes: T[] }
    | { type: 'rename'; oldPath: string; newPath: string; }
    | { type: 'modify'; path: string; };

export type WorkspaceIndexEvent = IndexEvent<ActiveWorkspaceFileIndex>
export type WorkspaceIndexListener = (event: WorkspaceIndexEvent) => void;
export type SinglespaceIndexEvent = IndexEvent<ActiveSinglespaceFileIndex>
export type SinglespaceIndexListener = (event: SinglespaceIndexEvent) => void;
