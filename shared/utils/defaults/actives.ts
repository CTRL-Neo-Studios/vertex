import type {ActiveWorkspaceFileIndex, UITreeNode} from "#shared/types/active/workspace";
import useUuid from "~/composables/utility/useUuid";

export function defaultActiveWorkspaceFileIndex(data?: Partial<ActiveWorkspaceFileIndex>): ActiveWorkspaceFileIndex {
    return {
        children: data?.children ?? [],
        fileName: data?.fileName ?? '',
        frontmatterProperties: data?.frontmatterProperties ?? {},
        uuid: data?.uuid ?? useUuid(),
        fullPath: data?.fullPath ?? '',
        isFolder: data?.isFolder ?? false,
        relativePath: data?.relativePath ?? ''
    } satisfies ActiveWorkspaceFileIndex
}

export function defaultUITreeNode(data?: Partial<UITreeNode>): UITreeNode {
    return {
        children: data?.children ?? [],
        fileName: data?.fileName ?? '',
        frontmatterProperties: data?.frontmatterProperties ?? {},
        uuid: data?.uuid ?? useUuid(),
        fullPath: data?.fullPath ?? '',
        isFolder: data?.isFolder ?? false,
        relativePath: data?.relativePath ?? ''
    } satisfies UITreeNode
}