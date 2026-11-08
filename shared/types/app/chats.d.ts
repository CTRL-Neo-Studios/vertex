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
    /** Workspace-relative paths of the notes and folders attached to this (user) message. */
    notes?: string[],
    folders?: string[],
    createdAt?: number,
    /** The chat's mode when this (user) message was sent; the model is told where it changed. */
    mode?: ChatMode,
    /** The model (and profile) that wrote this (assistant) message. */
    modelId?: string,
    profileId?: string,
    /** Every model call that wrote this (assistant) message: one, plus one per tool round answered in the webview. */
    requests?: ChatRequestInfo[],
    /** Write mode: the note changes this (assistant) message staged, one per note, for the user to review. */
    changes?: ChatChange[],
}

/** A note change a Write-mode reply staged, and what became of it. */
export interface ChatChange {
    /** Workspace-relative. */
    path: string,
    /** The note's text when first staged; `null` = it didn't exist (the reply creates it). */
    before: string | null,
    after: string,
    /**
     * `conflict`: the note changed after it was staged, so it wasn't applied. `undone`: applied, then reverted by a
     * rewind past its reply.
     */
    state: 'pending' | 'applied' | 'discarded' | 'conflict' | 'undone',
}

/** One model call of a reply, as the context view shows it. */
export interface ChatRequestInfo {
    profileId: string,
    modelId: string,
    startedAt: number,
    /** Missing when the call was stopped or failed. */
    finishedAt?: number,
    finishReason?: string,
    /** Tokens, as far as the provider reported them. */
    usage?: {input?: number, output?: number, reasoning?: number, cachedInput?: number},
    /** The instructions without the notes' text. */
    prompt: string,
    /** The notes sent, and how many of their characters (after the cap). */
    notes: {path: string, chars: number}[],
    /** Tool names: sent loaded, or deferred until a tool search finds them. */
    tools: {loaded: string[], deferred: string[]},
}

export type VertexChatMessage = UIMessage<ChatMessageMetadata>

/**
 * Branches: where an edit or a retry replaced the rest of a conversation, the alternative rests, keyed by the id of the
 * message before that point (`''` = the start). `null` marks the one shown now, which lives in `messages`.
 */
export type ChatForks = Record<string, (VertexChatMessage[] | null)[]>

/**
 * What a chat may do to notes: `read` only reads; `suggest` proposes edits the user accepts or rejects in the editor;
 * `write` stages changes (and new notes) that the user reviews and applies after the reply. Stored `ask` is `read`.
 */
export type ChatMode = 'read' | 'suggest' | 'write'

/** The notes a chat may change: the ones named in it (open, attached or `@`-mentioned, their folders'), a folder's, any. */
export type ChatScope = {kind: 'named'} | {kind: 'workspace'} | {kind: 'folder', path: string}

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
    forks?: ChatForks,
    /** Missing = the settings' `chatMode` (chats from before modes). */
    mode?: ChatMode,
    /** Missing = named. */
    scope?: ChatScope,
    /** Sites (`hostname`s) `fetchUrl` may fetch from without asking. */
    allowedHosts?: string[],
}

export interface ChatIndex {
    chats: ChatSummary[],
    /** Every folder path, including empty ones and the parents of nested ones. */
    folders: string[],
}

/** A chat whose messages contain the searched text, with that text in context (`…` marks a cut). */
export interface ChatHit {
    id: string,
    snippet: string,
}
