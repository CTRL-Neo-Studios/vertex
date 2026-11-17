import type {AiModelProfile, AiProviderProfile} from "../../shared/types";
import {aiConfigOf} from "../../shared/config";
import {aiContext} from "../plugin";

/**
 * Providers and model profiles: global settings (a workspace can only pick `features`, through Settings' scope), read
 * here as this window's plugin sees them (the Settings window's: the global ones) and written whole.
 */
export function useAiConfig() {
    const ctx = aiContext()
    const ai = computed(() => aiConfigOf(ctx.config.value))

    const write = (patch: Record<string, unknown>) => ctx.config.set(patch)

    async function addProvider(data: Omit<AiProviderProfile, 'id'>) {
        const provider = {...data, id: crypto.randomUUID()}
        await write({providers: [...ai.value.providers, provider]})
        return provider
    }
    const updateProvider = (id: string, patch: Partial<Omit<AiProviderProfile, 'id'>>) =>
        write({providers: ai.value.providers.map(p => (p.id === id ? {...p, ...patch} : p))})
    /** Rust drops each removed provider's saved key. Profiles using one stay, without a provider, until edited. */
    const removeProviders = (ids: string[]) => write({providers: ai.value.providers.filter(p => !ids.includes(p.id))})

    async function addModelProfile(data: Omit<AiModelProfile, 'id'>) {
        const profile = {...data, id: crypto.randomUUID()}
        await write({modelProfiles: [...ai.value.modelProfiles, profile]})
        return profile
    }
    const updateModelProfile = (id: string, patch: Partial<Omit<AiModelProfile, 'id'>>) =>
        write({modelProfiles: ai.value.modelProfiles.map(p => (p.id === id ? {...p, ...patch} : p))})
    /** The default profile never goes; features and chats using a removed one fall back to the default. */
    const removeModelProfiles = (ids: string[]) =>
        write({modelProfiles: ai.value.modelProfiles.filter(p => p.id === ai.value.defaultModelProfile || !ids.includes(p.id))})
    const setDefaultModelProfile = (id: string) => write({defaultModelProfile: id})

    return {ai, addProvider, updateProvider, removeProviders, addModelProfile, updateModelProfile, removeModelProfiles, setDefaultModelProfile}
}
