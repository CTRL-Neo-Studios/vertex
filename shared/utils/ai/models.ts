import type {AiModelInfo} from "#shared/types/app/ai";

/**
 * Model metadata from three sources, none complete: the provider's OpenAI `/models` list (OpenRouter's carries
 * most), Ollama's `/api/show`, and the models.dev catalog. Earlier sources win; later ones only fill gaps.
 */

type Loose = Record<string, unknown>
const obj = (v: unknown): Loose | undefined => (typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Loose : undefined)
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : undefined)
/** OpenRouter prices are USD per token as strings; `-1` means variable. Rounded to drop float noise. */
const perMillion = (v: unknown) => {
    const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 1e12) / 1e6 : undefined
}
const withoutUndefined = <T extends object>(o: T) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>

/** `anthropic/claude-sonnet-4` → `anthropic`; else the catalog provider it was found under. */
export function vendorOf(id: string, catalogProvider?: string): string | undefined {
    const slash = id.indexOf('/')
    return slash > 0 ? id.slice(0, slash).toLowerCase() : catalogProvider
}

/** An OpenAI `/models` response (`{data: [{id}]}`), reading OpenRouter's extra fields when present. */
export function normalizeModels(listResponse: unknown): AiModelInfo[] {
    const data = obj(listResponse)?.data
    return (Array.isArray(data) ? data : []).flatMap((raw): AiModelInfo[] => {
        const m = obj(raw)
        const id = str(m?.id)
        if (!m || !id) return []
        const arch = obj(m.architecture), pricing = obj(m.pricing)
        const params = strs(m.supported_parameters)
        const cost = pricing && withoutUndefined({input: perMillion(pricing.prompt), output: perMillion(pricing.completion)})
        return [withoutUndefined({
            id,
            name: str(m.name),
            vendor: vendorOf(id),
            contextLength: num(m.context_length),
            maxOutput: num(obj(m.top_provider)?.max_completion_tokens),
            inputModalities: strs(arch?.input_modalities),
            outputModalities: strs(arch?.output_modalities),
            toolCall: params && params.includes('tools'),
            reasoning: params && params.includes('reasoning'),
            cost: cost && Object.keys(cost).length ? cost : undefined,
        }) as AiModelInfo]
    })
}

const normalizeURL = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase()

function fromCatalogModel(m: Loose, providerId: string | undefined): Partial<AiModelInfo> {
    const limit = obj(m.limit), modalities = obj(m.modalities), cost = obj(m.cost)
    const prices = cost && withoutUndefined({input: num(cost.input), output: num(cost.output)})
    return withoutUndefined({
        name: str(m.name),
        vendor: vendorOf(str(m.id) ?? '', providerId),
        contextLength: num(limit?.context),
        maxOutput: num(limit?.output),
        inputModalities: strs(modalities?.input),
        outputModalities: strs(modalities?.output),
        toolCall: bool(m.tool_call),
        reasoning: bool(m.reasoning),
        openWeights: bool(m.open_weights),
        cost: prices && Object.keys(prices).length ? prices : undefined,
    })
}

/**
 * Fills each model's missing fields from models.dev (`{[provider]: {id, api?, models: {[id]: …}}}`): first the
 * catalog provider whose `api` is `baseURL`, then any provider with the exact id, then the id after its last `/`
 * (preferring the provider named by the id's prefix).
 */
export function enrichFromCatalog(models: AiModelInfo[], catalog: unknown, baseURL: string): AiModelInfo[] {
    const providers = Object.values(obj(catalog) ?? {}).flatMap(p => (obj(p) ? [obj(p)!] : []))
    const matched = providers.find(p => typeof p.api === 'string' && normalizeURL(p.api) === normalizeURL(baseURL))
    const find = (list: Loose[], id: string) => {
        for (const p of list) {
            const hit = obj(obj(p.models)?.[id])
            if (hit) return fromCatalogModel(hit, str(p.id))
        }
    }
    return models.map(model => {
        const prefix = vendorOf(model.id)
        const byPrefix = prefix ? providers.filter(p => p.id === prefix) : []
        const hit = (matched && find([matched], model.id))
            ?? find(providers, model.id)
            ?? find([...byPrefix, ...providers], model.id.slice(model.id.lastIndexOf('/') + 1))
        return hit ? {...hit, ...withoutUndefined(model)} as AiModelInfo : model
    })
}

/** Ollama's `/api/show`: `capabilities` (`vision`, `tools`, `thinking`) and `model_info['<arch>.context_length']`. */
export function enrichFromOllamaShow(model: AiModelInfo, showResponse: unknown): AiModelInfo {
    const show = obj(showResponse)
    const caps = strs(show?.capabilities)
    const contextLength = Object.entries(obj(show?.model_info) ?? {}).find(([k, v]) => k.endsWith('.context_length') && num(v) !== undefined)?.[1] as number | undefined
    return {
        ...model,
        contextLength: model.contextLength ?? contextLength,
        ...(caps && {
            inputModalities: caps.includes('vision') ? ['text', 'image'] : ['text'],
            toolCall: caps.includes('tools'),
            reasoning: caps.includes('thinking'),
        }),
    }
}
