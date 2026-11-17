/**
 * The AI plugin's API (`ctx.use('ai')`): which model a feature uses, models to call, and the features listed on
 * Settings → Assistive AI → Features.
 */
import type {LanguageModel} from 'ai'
import type {AiConfig, AiModelProfile, AiProviderProfile} from '../shared/types'

export type {AiConfig, AiModelInfo, AiModelParams, AiModelProfile, AiProviderProfile} from '../shared/types'

/** A model profile ready to call. */
export interface AiModel {
    profile: AiModelProfile
    provider: AiProviderProfile
    /** A `fetch` for the provider through Rust, which adds its key; chat-completion requests get the profile's params. */
    fetch: typeof fetch
    /** An ai-sdk chat model (`generateText`, `streamText`); `params: false` leaves the profile's params out. */
    languageModel(options?: { params?: boolean }): LanguageModel
}

/** A feature that uses a model profile, with its picker on Settings → Assistive AI → Features. */
export interface AiFeatureDef {
    /** A setting-path segment (`plugins.config.ai.features.<id>`): no dots. */
    id: string
    /** i18n keys. */
    label: string
    description: string
}

export interface AiApi {
    /** The AI config in effect in this window (a workspace's overrides applied), checked and defaulted. Reactive. */
    config(): AiConfig
    /** Whether AI is on and the feature isn't switched off; says nothing about its model. Reactive. */
    featureOn(id: string): boolean
    /** The model a feature uses (its own profile, else the default); `null` when off or without a model. Reactive. */
    resolveFeature(id: string): AiModel | null
    /** A profile by id (a chat's own pick); `null` when AI is off, or the profile has no model or provider. Reactive. */
    resolveProfile(id: string): AiModel | null
    /** Changes a model profile (global settings). */
    updateProfile(id: string, patch: Partial<Omit<AiModelProfile, 'id'>>): Promise<void>
    /** Lists a feature on Features, in registration order; removed with the caller's scope, or by what it returns. */
    registerFeature(def: AiFeatureDef): () => void
}

declare module '#shared/plugin/api' {
    interface PluginApis {
        ai: AiApi
    }
}
