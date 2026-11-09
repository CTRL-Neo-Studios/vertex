import {describe, expect, it} from 'vitest'
import {enrichFromCatalog, enrichFromOllamaShow, normalizeModels, vendorOf} from './models'

describe('normalizeModels', () => {
    it('reads OpenRouter fields and converts per-token prices to per million', () => {
        const [m] = normalizeModels({data: [{
            id: 'anthropic/claude-sonnet-4',
            name: 'Anthropic: Claude Sonnet 4',
            context_length: 200000,
            architecture: {input_modalities: ['text', 'image', 'file'], output_modalities: ['text']},
            pricing: {prompt: '0.000003', completion: '0.000015'},
            top_provider: {max_completion_tokens: 64000},
            supported_parameters: ['tools', 'reasoning', 'temperature'],
        }]})
        expect(m).toEqual({
            id: 'anthropic/claude-sonnet-4',
            name: 'Anthropic: Claude Sonnet 4',
            vendor: 'anthropic',
            contextLength: 200000,
            maxOutput: 64000,
            inputModalities: ['text', 'image', 'file'],
            outputModalities: ['text'],
            toolCall: true,
            reasoning: true,
            cost: {input: 3, output: 15},
        })
    })

    it('keeps plain OpenAI entries to their id and drops malformed ones', () => {
        expect(normalizeModels({data: [{id: 'llama3.2:latest', object: 'model'}, {id: ''}, null, 'x']})).toEqual([{id: 'llama3.2:latest'}])
        expect(normalizeModels({error: 'nope'})).toEqual([])
    })

    it('ignores variable (-1) prices', () => {
        expect(normalizeModels({data: [{id: 'openrouter/auto', pricing: {prompt: '-1', completion: '-1'}}]})[0]!.cost).toBeUndefined()
    })
})

describe('enrichFromCatalog', () => {
    const catalog = {
        // Listed first so a global search would find its entry before the matched provider's.
        other: {id: 'other', models: {'gpt-4o': {id: 'gpt-4o', name: 'Other GPT-4o', limit: {context: 1, output: 1}}}},
        openai: {id: 'openai', api: 'https://api.openai.com/v1/', models: {
            'gpt-4o': {id: 'gpt-4o', name: 'GPT-4o', tool_call: true, modalities: {input: ['text', 'image'], output: ['text']}, limit: {context: 128000, output: 16384}, cost: {input: 2.5, output: 10}},
        }},
        anthropic: {id: 'anthropic', models: {'claude-sonnet-4': {id: 'claude-sonnet-4', name: 'Claude Sonnet 4', reasoning: true, limit: {context: 200000, output: 64000}}}},
    }

    it('prefers the provider whose api is the baseURL over a global match', () => {
        const [m] = enrichFromCatalog([{id: 'gpt-4o'}], catalog, 'https://api.openai.com/v1')
        expect(m).toMatchObject({name: 'GPT-4o', vendor: 'openai', contextLength: 128000, toolCall: true, cost: {input: 2.5, output: 10}})
    })

    it('falls back to a global match, by exact id then by the id after the last slash', () => {
        expect(enrichFromCatalog([{id: 'gpt-4o'}], catalog, 'http://localhost:1234/v1')[0]!.name).toBe('Other GPT-4o')
        const [m] = enrichFromCatalog([{id: 'anthropic/claude-sonnet-4', vendor: 'anthropic'}], catalog, 'https://openrouter.ai/api/v1')
        expect(m).toMatchObject({name: 'Claude Sonnet 4', reasoning: true, contextLength: 200000})
    })

    it('only fills missing fields', () => {
        const [m] = enrichFromCatalog([{id: 'gpt-4o', name: 'Mine', contextLength: 5}], catalog, 'https://api.openai.com/v1')
        expect(m).toMatchObject({name: 'Mine', contextLength: 5, maxOutput: 16384})
    })

    it('leaves unknown models alone', () => {
        expect(enrichFromCatalog([{id: 'mystery'}], catalog, '')).toEqual([{id: 'mystery'}])
    })
})

describe('enrichFromOllamaShow', () => {
    it('maps capabilities and the architecture context length', () => {
        const m = enrichFromOllamaShow({id: 'qwen3-vl:8b'}, {
            capabilities: ['completion', 'vision', 'tools', 'thinking'],
            model_info: {'general.architecture': 'qwen3vl', 'qwen3vl.context_length': 262144},
        })
        expect(m).toEqual({id: 'qwen3-vl:8b', contextLength: 262144, inputModalities: ['text', 'image'], toolCall: true, reasoning: true})
    })

    it('text-only without vision; no capabilities leaves the model as is', () => {
        expect(enrichFromOllamaShow({id: 'a'}, {capabilities: ['completion']})).toMatchObject({inputModalities: ['text'], toolCall: false, reasoning: false})
        expect(enrichFromOllamaShow({id: 'a', toolCall: true}, {})).toEqual({id: 'a', toolCall: true, contextLength: undefined})
    })
})

describe('vendorOf', () => {
    it('uses the id prefix, else the catalog provider', () => {
        expect(vendorOf('Meta-Llama/llama-3')).toBe('meta-llama')
        expect(vendorOf('gpt-4o', 'openai')).toBe('openai')
        expect(vendorOf('gpt-4o')).toBeUndefined()
    })
})
