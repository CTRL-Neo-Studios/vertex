import type {UIMessage} from "ai";

/**
 * Where a workspace's chats live: Vertex's app data (plain JSON, never in the workspace) or
 * `<root>/.vertex/chats` (age-encrypted, so it can sync; needs the chat vault unlocked).
 */
export type ChatStorage = 'app' | 'workspace'

/**
 * The workspace store's encryption: `none` = no password set yet, `locked` = set but its key isn't in memory,
 * `unlocked` = ready. App-data storage is never encrypted: always `open`.
 */
export type ChatVaultState = 'none' | 'locked' | 'unlocked' | 'open'

export interface ChatMessageMetadata {
    /** Workspace-relative paths of the notes attached to this (user) message. */
    notes?: string[],
    createdAt?: number,
    /** The model that wrote this (assistant) message. */
    modelId?: string,
}

export type VertexChatMessage = UIMessage<ChatMessageMetadata>

export interface ChatSummary {
    /** `[A-Za-z0-9-]{1,64}`; also the file name and the chat tab's id. */
    id: string,
    title: string,
    /** Virtual folder path, `''` = top level, `A/B` = nested. Stored inside the (encrypted) chat, not as a directory. */
    folder: string,
    /** Unix ms. */
    created: number,
    updated: number,
}

export interface ChatFile extends ChatSummary {
    version: 1,
    /** The model profile it was started with; missing = the chat feature's profile. */
    profileId?: string,
    messages: VertexChatMessage[],
}

export interface ChatIndex {
    chats: ChatSummary[],
    /** Every folder path, including empty ones and the parents of nested ones. */
    folders: string[],
}
