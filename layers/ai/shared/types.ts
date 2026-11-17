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
    /** What the profile's requests set beyond the model; missing (or each unset field) = the provider's default. */
    params?: AiModelParams,
}

/**
 * A model profile's request parameters (ranges in `AI_NUMBER_PARAMS`). Sent as OpenAI-style snake_case fields, only
 * where the request doesn't set them itself; a provider ignores the ones it doesn't know.
 */
export interface AiModelParams {
    temperature?: number,
    topP?: number,
    topK?: number,
    minP?: number,
    frequencyPenalty?: number,
    presencePenalty?: number,
    repetitionPenalty?: number,
    maxOutputTokens?: number,
    seed?: number,
    /** Sequences that end the reply. */
    stop?: string[],
    /** Provider-specific fields, sent as they are (e.g. `reasoning_effort`). */
    extra?: Record<string, unknown>,
}

/** `plugins.config.ai` as the plugin reads it (`aiConfigOf`). */
export interface AiConfig {
    providers: AiProviderProfile[],
    /** Every AI feature; off is as if each one were off. */
    enabled: boolean,
    modelProfiles: AiModelProfile[],
    defaultModelProfile: string,
    /**
     * Feature id → model profile id; missing or unknown = the default profile, `''` = off. (Not `null`: a
     * workspace override of `null` means "remove the override".)
     */
    features: Record<string, string>,
}
