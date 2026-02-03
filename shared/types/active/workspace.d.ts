import type {FrontmatterProperties} from "#shared/types/types";
import {type TreeItem} from "@nuxt/ui";
import type {InternalLinkNode} from "#codemirror-rich-obsidian-editor/editor-types"
import type {YamlFormData} from "@type32/yaml-editor-form"; // Look here: new type for plugin

/*
Usage Scope: Active Workspaces
 */
export interface ActiveWorkspaceFileIndex { // Using the Hybrid ID Approach: uuid for Stable UI References, fullPath for primary key for fileIndex.
    uuid: string; // The stable UI identifier
    fullPath: string; // The primary key for the index
    relativePath: string,
    fileName: string,
    isFolder: boolean,
    children: string[] // Contains the `fullPath` of children
    properties: YamlFormData,
    forelinks: string[], // Referenced links, in terms of uuids in this file
    createdTime: Date,
    modifiedTime: Date,
}

export interface ActiveSinglespaceFileIndex { // Using the Hybrid ID Approach: uuid for Stable UI References, fullPath for primary key for fileIndex.
    uuid: string; // The stable UI identifier
    fullPath: string; // The primary key for the index
    fileName: string,
    properties: YamlFormData,
}

export interface UITreeNode extends Omit<ActiveWorkspaceFileIndex, 'children'> {
    children: UITreeNode[]
}

export type WorkspaceIndexEvent =
    | { type: 'create'; path: string; }
    | { type: 'remove'; path: string; removedNodes: ActiveWorkspaceFileIndex[] }
    | { type: 'rename'; oldPath: string; newPath: string; }
    | { type: 'modify'; path: string; };

export type WorkspaceIndexListener = (event: WorkspaceIndexEvent) => void;

export type SinglespaceIndexEvent =
    | { type: 'remove'; path: string; removedNode: ActiveSinglespaceFileIndex }
    | { type: 'rename'; oldPath: string; newPath: string; }
    | { type: 'modify'; path: string; };

export type SinglespaceIndexListener = (event: SinglespaceIndexEvent) => void;