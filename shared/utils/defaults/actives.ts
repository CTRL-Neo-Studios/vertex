import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import type {ActiveTab} from "#shared/types/active/tabs";
import type {ActiveSession} from "#shared/types/active/sessions";

export function defaultActiveWorkspaceFileIndex(data?: Partial<ActiveWorkspaceFileIndex>): ActiveWorkspaceFileIndex {
    return {
        children: data?.children ?? [],
        fileName: data?.fileName ?? '',
        fileExt: data?.fileExt ?? '',
        properties: data?.properties ?? {},
        uuid: data?.uuid ?? crypto.randomUUID(),
        fullPath: data?.fullPath ?? '',
        isFolder: data?.isFolder ?? false,
        size: data?.size ?? 0,
        relativePath: data?.relativePath ?? '',
        forelinks: data?.forelinks ?? [],
        backlinks: data?.backlinks ?? [],
        createdTime: data?.createdTime ?? new Date(),
        modifiedTime: data?.modifiedTime ?? new Date(),
    } satisfies ActiveWorkspaceFileIndex
}

export function defaultActiveTab(data?: Partial<ActiveTab>): ActiveTab {
    return {
        changesSaved: data?.changesSaved ?? false,
        fileUuid: data?.fileUuid ?? crypto.randomUUID(),
        ...(data?.kind && {kind: data.kind}),
    } satisfies ActiveTab
}

export function defaultActiveSession(data?: Partial<ActiveSession>): ActiveSession {
    return {
        uuid: data?.uuid ?? crypto.randomUUID(),
        workspaceSession: data?.workspaceSession ?? false,
        rootPath: data?.rootPath || ''
    } satisfies ActiveSession
}
