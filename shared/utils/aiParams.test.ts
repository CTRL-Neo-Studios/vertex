import {describe, expect, it} from "vitest";
import {sanitizeModelParams, withModelParams} from "./aiParams";

describe('sanitizeModelParams', () => {
    it('clamps numbers to their range, rounds integer ones and drops anything invalid', () => {
        expect(sanitizeModelParams({temperature: 5, topP: -1, topK: 12.6, seed: 'x', minP: NaN, stop: ['END', '', 3], extra: [1]}))
            .toEqual({temperature: 2, topP: 0, topK: 13, stop: ['END']})
    })

    it('is undefined when nothing is set, so a profile without parameters stores none', () => {
        expect([sanitizeModelParams(undefined), sanitizeModelParams({}), sanitizeModelParams({stop: [], extra: {}})]).toEqual([undefined, undefined, undefined])
    })
})

describe('withModelParams', () => {
    const params = {temperature: 0.3, topK: 20, maxOutputTokens: 500, stop: ['##'], extra: {reasoning_effort: 'low', temperature: 1}}

    it('adds the snake_case fields and extra ones, without overriding what the request sets itself', () => {
        const body = JSON.parse(withModelParams(JSON.stringify({model: 'm', messages: [], max_tokens: 5}), params))
        expect(body).toEqual({model: 'm', messages: [], max_tokens: 5, temperature: 1, top_k: 20, stop: ['##'], reasoning_effort: 'low'})
    })

    it('leaves bodies that aren\'t a JSON object as they are', () => {
        expect(withModelParams('not json', params)).toBe('not json')
        expect(withModelParams('[1]', params)).toBe('[1]')
    })
})
