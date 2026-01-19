export interface AppSessionContext {
    openedAbsoluteFilePaths: string[],
}

export interface AppSession {
    uuid: string,
    sessionType: 'workspace' | 'singlespace',
    rootFileOrFolderAbsolutePath?: string,
    context: AppSessionContext,
    lastUpdated?: Date
}