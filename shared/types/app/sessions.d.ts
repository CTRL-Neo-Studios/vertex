export interface AppSessionContext {
    openedAbsoluteFilePaths: string[],
    openedAbsoluteFolderPaths: string[],
    lastFocusedAbsoluteFilePath?: string,
    /** Chat tabs, reopened after the file tabs (workspace sessions). */
    openedChatIds?: string[],
    /** Set instead of `lastFocusedAbsoluteFilePath` when the focused tab was a chat. */
    lastFocusedChatId?: string,
    leftPanelView?: 'files' | 'chats',
}

export interface AppSession {
    uuid: string,
    sessionType: 'workspace' | 'singlespace',
    rootFileOrFolderAbsolutePath?: string,
    context: AppSessionContext,
    lastUpdated?: Date,
	trustedDeviceIds: string[],
}
