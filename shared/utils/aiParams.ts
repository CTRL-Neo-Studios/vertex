import type {AiModelParams} from "#shared/types/app/ai";

type NumberParam = Exclude<keyof AiModelParams, 'stop' | 'extra'>

/**
 * The numeric parameters: their request field, range, step and the value a "custom" switch starts from. Ranges follow
 * the OpenAI API where it has the field; `slider: false` for open-ended ones.
 */
export const AI_NUMBER_PARAMS: readonly {
    key: NumberParam, field: string, min: number, max: number, step: number, start: number, integer?: true, slider?: false,
}[] = [
    {key: 'temperature', field: 'temperature', min: 0, max: 2, step: 0.05, start: 0.7},
    {key: 'topP', field: 'top_p', min: 0, max: 1, step: 0.01, start: 0.9},
    {key: 'topK', field: 'top_k', min: 1, max: 200, step: 1, start: 40, integer: true},
    {key: 'minP', field: 'min_p', min: 0, max: 1, step: 0.01, start: 0.05},
    {key: 'frequencyPenalty', field: 'frequency_penalty', min: -2, max: 2, step: 0.05, start: 0},
    {key: 'presencePenalty', field: 'presence_penalty', min: -2, max: 2, step: 0.05, start: 0},
    {key: 'repetitionPenalty', field: 'repetition_penalty', min: 0, max: 2, step: 0.05, start: 1.1},
    {key: 'maxOutputTokens', field: 'max_tokens', min: 1, max: 10_000_000, step: 1, start: 4096, integer: true, slider: false},
    {key: 'seed', field: 'seed', min: 0, max: 2 ** 31 - 1, step: 1, start: 42, integer: true, slider: false},
]

const STOP_LIMIT = 16
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Stored parameters as parameters: numbers clamped to their range (integers rounded), the rest dropped when invalid; `undefined` when none are left. */
export function sanitizeModelParams(data: unknown): AiModelParams | undefined {
    if (!isObject(data)) return undefined
    const out: AiModelParams = {}
    for (const p of AI_NUMBER_PARAMS) {
        const v = data[p.key]
        if (typeof v !== 'number' || !Number.isFinite(v)) continue
        out[p.key] = Math.min(p.max, Math.max(p.min, p.integer ? Math.round(v) : v))
    }
    const stop = Array.isArray(data.stop) ? data.stop.filter((s): s is string => typeof s === 'string' && s !== '').slice(0, STOP_LIMIT) : []
    if (stop.length) out.stop = stop
    if (isObject(data.extra) && Object.keys(data.extra).length) out.extra = data.extra
    return Object.keys(out).length ? out : undefined
}

/** The request fields `params` sets: snake_case, then `extra` as it is. */
export function paramsFields(params: AiModelParams): Record<string, unknown> {
    const fields: Record<string, unknown> = {}
    for (const p of AI_NUMBER_PARAMS) if (params[p.key] !== undefined) fields[p.field] = params[p.key]
    if (params.stop?.length) fields.stop = params.stop
    return {...fields, ...params.extra}
}

/**
 * A chat-completion request body with `params`' fields added where it doesn't set them itself (a call's own
 * `max_tokens`, say, wins). Bodies that aren't a JSON object come back unchanged.
 */
export function withModelParams(body: string, params: AiModelParams): string {
    let parsed: unknown
    try {
        parsed = JSON.parse(body)
    } catch {
        return body
    }
    if (!isObject(parsed)) return body
    return JSON.stringify({...paramsFields(params), ...parsed})
}
