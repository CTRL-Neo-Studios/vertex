import type {AiModelProfile, AiProviderProfile, AppAiConfig} from "#shared/types/app/ai";
import {useAppSettings} from "~/composables/app/useAppSettings";

/** Whether a feature is switched on: AI is, and the feature isn't set to off (`''`). Says nothing about its model. */
export const aiFeatureOn = (ai: AppAiConfig | undefined, featureId: string) => !!ai?.enabled && ai.features[featureId] !== ''

/**
 * The model profile and provider a feature uses: its own profile, else the default one; `null` when the
 * feature (or AI) is off, or the profile has no model or provider.
 */
export function resolveAiFeature(ai: AppAiConfig, featureId: string): {profile: AiModelProfile, provider: AiProviderProfile} | null {
    if (!aiFeatureOn(ai, featureId)) return null
    const chosen = ai.features[featureId]
    const profile = ai.modelProfiles.find(p => p.id === chosen) ?? ai.modelProfiles.find(p => p.id === ai.defaultModelProfile)
    const provider = profile && ai.providers.find(p => p.id === profile.providerId)
    return profile?.modelId && provider ? {profile, provider} : null
}

/**
 * Providers and model profiles: global settings (a workspace can only pick `features`, through the settings
 * scope). Whole-`aiConfig` saves, as Workflows does with `workflowConfig`.
 */
export function useAiConfig() {
    const {config, save} = useAppSettings()
    const ai = computed(() => config.value?.aiConfig)

    const write = (patch: Partial<AppAiConfig>) => save({aiConfig: {...ai.value!, ...patch}})

    async function addProvider(data: Omit<AiProviderProfile, 'id'>) {
        const provider = {...data, id: crypto.randomUUID()}
        await write({providers: [...ai.value!.providers, provider]})
        return provider
    }
    const updateProvider = (id: string, patch: Partial<Omit<AiProviderProfile, 'id'>>) =>
        write({providers: ai.value!.providers.map(p => (p.id === id ? {...p, ...patch} : p))})
    /** Rust drops the provider's saved key with it. Profiles using it stay, without a provider, until edited. */
    const removeProvider = (id: string) => write({providers: ai.value!.providers.filter(p => p.id !== id)})

    async function addModelProfile(data: Omit<AiModelProfile, 'id'>) {
        const profile = {...data, id: crypto.randomUUID()}
        await write({modelProfiles: [...ai.value!.modelProfiles, profile]})
        return profile
    }
    const updateModelProfile = (id: string, patch: Partial<Omit<AiModelProfile, 'id'>>) =>
        write({modelProfiles: ai.value!.modelProfiles.map(p => (p.id === id ? {...p, ...patch} : p))})
    /** The default profile can't go; features using a removed one fall back to the default. */
    const removeModelProfile = (id: string) => id !== ai.value!.defaultModelProfile
        && write({modelProfiles: ai.value!.modelProfiles.filter(p => p.id !== id)})

    return {ai, addProvider, updateProvider, removeProvider, addModelProfile, updateModelProfile, removeModelProfile}
}
