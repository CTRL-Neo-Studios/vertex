import type {ActiveSinglespaceFileIndex, ActiveWorkspaceFileIndex, UITreeNode} from "#shared/types/active/workspace";
import useUuid from "~/composables/utility/useUuid";
import type {AppSession, AppSessionContext} from "#shared/types/active/sessions";

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

export function defaultActiveWindowSession(data?: Partial<AppSession>): AppSession {
    return {
        uuid: data?.uuid ?? useUuid(),
        sessionType: data?.sessionType ?? 'workspace',
        rootPath: data?.rootPath ?? '',
        context: defaultActiveWindowSessionContext(data?.context)
    }
}

export function defaultActiveWindowSessionContext(data?: Partial<AppSessionContext>): AppSessionContext {
    return {
        openedAbsoluteFilePaths: data?.openedAbsoluteFilePaths ?? []
    }
}