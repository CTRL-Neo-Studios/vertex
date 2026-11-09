import {invoke, type Channel} from "@tauri-apps/api/core";

/**
 * Thin client for the Rust AI commands (src-tauri). Provider API keys go in through `setKey` and never come
 * back out: Rust adds them to `request`s itself, and only for URLs on the provider's own `baseURL` origin.
 */
export const AiCommand = {
    keySet: 'ai_key_set',
    keyHas: 'ai_key_has',
    request: 'ai_request',
    requestCancel: 'ai_request_cancel',
    modelCatalog: 'ai_model_catalog',
} as const

export interface AiResponseHead {
    status: number,
    headers: Record<string, string>,
}

/** Body chunks as `ArrayBuffer`s, then one `{end: true}` or `{error}`. */
export type AiChunk = ArrayBuffer | { end?: true, error?: string }

export const aiClient = {
    /** Saves to the OS keychain; an empty key removes it. Call after the settings write that adds the provider or changes its `baseURL`. */
    setKey: (providerId: string, key: string) => invoke(AiCommand.keySet, {providerId, key}),
    hasKey: (providerId: string) => invoke<boolean>(AiCommand.keyHas, {providerId}),
    /** Resolves with the head once headers arrive; the body streams through `onChunk`. Use `createAiFetch`. */
    request: (args: {requestId: string, providerId: string, url: string, method: string, headers: Record<string, string>, body: string | null, onChunk: Channel<AiChunk>}) =>
        invoke<AiResponseHead>(AiCommand.request, args),
    cancelRequest: (requestId: string) => invoke(AiCommand.requestCancel, {requestId}),
    /** The models.dev catalog (`https://models.dev/api.json`), cached by Rust for a day. */
    modelCatalog: () => invoke<unknown>(AiCommand.modelCatalog),
}
