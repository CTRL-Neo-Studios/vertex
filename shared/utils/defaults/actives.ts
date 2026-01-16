import type {ActiveSinglespaceFileIndex, ActiveWorkspaceFileIndex, UITreeNode} from "#shared/types/active/workspace";
import useUuid from "~/composables/utility/useUuid";
import type {ActiveTab} from "#shared/types/active/tabs";
import type {ActiveSession} from "#shared/types/active/sessions";

export function defaultActiveWorkspaceFileIndex(data?: Partial<ActiveWorkspaceFileIndex>): ActiveWorkspaceFileIndex {
    return {
        children: data?.children ?? [],
        fileName: data?.fileName ?? '',
        frontmatterProperties: data?.frontmatterProperties ?? {},
        uuid: data?.uuid ?? useUuid(),
        fullPath: data?.fullPath ?? '',
        isFolder: data?.isFolder ?? false,
        relativePath: data?.relativePath ?? '',
        forelinks: data?.forelinks ?? []
    } satisfies ActiveWorkspaceFileIndex
}

export function defaultActiveSinglespaceFileIndex(data?: Partial<ActiveSinglespaceFileIndex>): ActiveSinglespaceFileIndex {
    return {
        fileName: data?.fileName ?? '',
        frontmatterProperties: data?.frontmatterProperties ?? {},
        uuid: data?.uuid ?? useUuid(),
        fullPath: data?.fullPath ?? '',
    } satisfies ActiveSinglespaceFileIndex
}

export function defaultUITreeNode(data?: Partial<UITreeNode>): UITreeNode {
    return {
        children: data?.children ?? [],
        fileName: data?.fileName ?? '',
        frontmatterProperties: data?.frontmatterProperties ?? {},
        uuid: data?.uuid ?? useUuid(),
        fullPath: data?.fullPath ?? '',
        isFolder: data?.isFolder ?? false,
        relativePath: data?.relativePath ?? '',
        forelinks: data?.forelinks ?? []
    } satisfies UITreeNode
}

export function defaultActiveTab(data?: Partial<ActiveTab>): ActiveTab {
    return {
        changesSaved: data?.changesSaved ?? false,
        fileUuid: data?.fileUuid ?? useUuid()
    } satisfies ActiveTab
}

export function defaultActiveSession(data?: Partial<ActiveSession>): ActiveSession {
    return {
        uuid: data?.uuid ?? useUuid(),
        workspaceSession: data?.workspaceSession ?? false,
        rootPath: data?.rootPath || ''
    } satisfies ActiveSession
}