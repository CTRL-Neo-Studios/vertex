import type {ChatMode, ChatStorage} from "#shared/types/app/chats";

/** One model a provider serves, with whatever metadata its `/models` list, Ollama or models.dev knew. */
export interface AiModelInfo {
    id: string,
    name?: string,
    /** Who made it (`anthropic`, `meta`…), for its icon. */
    vendor?: string,
    contextLength?: number,
    maxOutput?: number,
    inputModalities?: string[],
    outputModalities?: string[],
    toolCall?: boolean,
    reasoning?: boolean,
    openWeights?: boolean,
    /** USD per 1M tokens. */
    cost?: { input?: number, output?: number },
}

/** An OpenAI-compatible API. Its key lives in the OS keychain (Rust), bound to `baseURL`'s host. */
export interface AiProviderProfile {
    id: string,
    name: string,
    baseURL: string,
    /** The models the user enabled. */
    models: AiModelInfo[],
}

export interface AiModelProfile {
    id: string,
    name: string,
    providerId: string,
    modelId: string,
    systemPrompt: string,
    /** Chat tools (notes search/read, edit suggestions); unset = on. Off for models without tool calling. */
    tools?: false,
}

export interface AppAiConfig {
    providers: AiProviderProfile[],
    modelProfiles: AiModelProfile[],
    defaultModelProfile: string,
    /**
     * Feature id → model profile id; missing or unknown = the default profile, `''` = off. (Not `null`: a
     * workspace override of `null` means "remove the override".)
     */
    features: Record<string, string>,
    /** Where this workspace's chats are kept; switching leaves the existing ones where they are. */
    chatStorage: ChatStorage,
    /** The mode new chats start in. */
    chatMode: ChatMode,
}
