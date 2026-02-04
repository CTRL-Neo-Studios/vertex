import type {FrontmatterProperties} from "#shared/types/types";
import {type TreeItem} from "@nuxt/ui";
import type {InternalLinkNode} from "#codemirror-rich-obsidian-editor/editor-types"
import type {YamlFormData} from "@type32/yaml-editor-form";

/*
Usage Scope: Active Workspaces
 */
export interface ActiveWorkspaceFileIndex {
    uuid: string;
    fullPath: string;
    relativePath: string,
    fileName: string,
    isFolder: boolean,
    children: string[]
    properties: YamlFormData,
    forelinks: string[]
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
