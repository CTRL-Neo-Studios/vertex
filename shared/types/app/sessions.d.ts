import type {PanelViewId} from "#shared/types/app/settings";

/** What a session window had open, restored when it reopens. Paths are relative to the workspace root, as the index has them. */
export interface AppSessionContext {
    openedFilePaths: string[],
    openedFolderPaths: string[],
    lastFocusedFilePath?: string,
    /** Chat tabs, reopened after the file tabs (workspace sessions). */
    openedChatIds?: string[],
    /** Set instead of `lastFocusedFilePath` when the focused tab was a chat. */
    lastFocusedChatId?: string,
    /** Each side panel's view, and whether it's collapsed (the right one is, unless saved open). */
    leftPanelView?: PanelViewId,
    rightPanelView?: PanelViewId,
    leftPanelCollapsed?: boolean,
    rightPanelCollapsed?: boolean,
}

/** A workspace or single file Vertex has opened: the recents list, and what each window restores. */
export interface AppSession {
    uuid: string,
    sessionType: 'workspace' | 'singlespace',
    rootFileOrFolderAbsolutePath?: string,
    context: AppSessionContext,
    /** Whether its window is open now. Rust keeps it from window events; a quit leaves it set, and the next launch turns it into `reopen`. */
    open: boolean,
    /** Its window was open when Vertex last quit (or crashed): what recovery reopens. Set by Rust at launch. */
    reopen?: boolean,
    /** Unix ms when its window last opened or was closed; recents are newest first. */
    lastOpened: number,
    /** Kept in recents past the cap, and listed first. */
    pinned?: boolean,
}
