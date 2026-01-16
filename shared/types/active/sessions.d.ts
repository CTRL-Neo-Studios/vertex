export interface ActiveSession {
    uuid: string,
    workspaceSession: boolean,
    rootPath?: string,
}

export interface AppSession {
    uuid: string,
    sessionType: 'workspace' | 'singlespace',
    rootPath?: string,
    context: AppSessionContext
}

export interface AppSessionContext {
    openedAbsoluteFilePaths: string[],
}