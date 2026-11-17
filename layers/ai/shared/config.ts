import type {AiConfig, AiModelInfo, AiModelProfile, AiProviderProfile} from './types'
import {sanitizeModelParams} from './params'

type Loose = Record<string, unknown>
const isLoose = (v: unknown): v is Loose => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined)
/** Objects with a non-empty string `id`, first of each id kept, each mapped by `fn`. */
const byId = <T>(v: unknown, fn: (o: Loose & {id: string}) => T): T[] => {
    const seen = new Set<string>()
    return (Array.isArray(v) ? v : []).flatMap(o => {
        if (!isLoose(o) || typeof o.id !== 'string' || !o.id || seen.has(o.id)) return []
        seen.add(o.id)
        return [fn(o as Loose & {id: string})]
    })
}

export function sanitizeAiModel(m: Loose & {id: string}): AiModelInfo {
    const cost = isLoose(m.cost) ? {input: num(m.cost.input), output: num(m.cost.output)} : undefined
    return {
        id: m.id,
        name: str(m.name),
        vendor: str(m.vendor),
        contextLength: num(m.contextLength),
        maxOutput: num(m.maxOutput),
        inputModalities: strs(m.inputModalities),
        outputModalities: strs(m.outputModalities),
        toolCall: bool(m.toolCall),
        reasoning: bool(m.reasoning),
        openWeights: bool(m.openWeights),
        cost: cost && (cost.input !== undefined || cost.output !== undefined) ? cost : undefined,
    }
}

/** Written when there's no stored config at all (`plugins.config.ai`), so removing Local Ollama sticks. */
export const AI_SEED: AiConfig = {
    enabled: true,
    providers: [{id: 'local-ollama', name: 'Local Ollama', baseURL: 'http://localhost:11434/v1', models: []}],
    modelProfiles: [{id: 'default', name: 'Default', providerId: 'local-ollama', modelId: '', systemPrompt: ''}],
    defaultModelProfile: 'default',
    features: {},
}

/** The stored config (`plugins.config.ai`) checked and defaulted; the seed when there is none. */
export function aiConfigOf(data?: unknown): AiConfig {
    if (data === undefined || (isLoose(data) && !Object.keys(data).length)) return structuredClone(AI_SEED)
    const ai: Loose = isLoose(data) ? data : {}
    const providers = byId(ai.providers, (p): AiProviderProfile => ({
        id: p.id,
        name: str(p.name) ?? '',
        baseURL: str(p.baseURL) ?? '',
        models: byId(p.models, sanitizeAiModel),
    }))
    const modelProfiles = byId(ai.modelProfiles, (p): AiModelProfile => {
        const params = sanitizeModelParams(p.params)
        return {
            id: p.id,
            name: str(p.name) ?? '',
            providerId: str(p.providerId) ?? '',
            modelId: str(p.modelId) ?? '',
            systemPrompt: str(p.systemPrompt) ?? '',
            ...(p.tools === false && {tools: false as const}),
            ...(params && {params}),
        }
    })
    const preferred = str(ai.defaultModelProfile)
    const defaultModelProfile = modelProfiles.some(p => p.id === preferred) ? preferred! : modelProfiles[0]?.id ?? 'default'
    const features = Object.fromEntries(Object.entries(isLoose(ai.features) ? ai.features : {}).filter((e): e is [string, string] => typeof e[1] === 'string'))
    return {
        enabled: ai.enabled !== false,
        providers, modelProfiles, defaultModelProfile, features,
    }
}

/** Whether a feature is switched on: AI is, and the feature isn't set to off (`''`). Says nothing about its model. */
export const featureOn = (ai: AiConfig, featureId: string) => ai.enabled && ai.features[featureId] !== ''

/** A profile and its provider; `null` without a model or a provider. */
export function profileWithProvider(ai: AiConfig, profile: AiModelProfile | undefined) {
    const provider = profile && ai.providers.find(p => p.id === profile.providerId)
    return profile?.modelId && provider ? {profile, provider} : null
}

/** The profile a feature uses (its own, else the default) and its provider; `null` when off or without a model. */
export function resolveFeature(ai: AiConfig, featureId: string) {
    if (!featureOn(ai, featureId)) return null
    const chosen = ai.features[featureId]
    return profileWithProvider(ai, ai.modelProfiles.find(p => p.id === chosen) ?? ai.modelProfiles.find(p => p.id === ai.defaultModelProfile))
}
