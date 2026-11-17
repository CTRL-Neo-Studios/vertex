import {describe, expect, it} from 'vitest'
import {aiConfigOf} from './config'

describe('aiConfigOf', () => {
    it('is the seed (Local Ollama) only when nothing is stored, so removing it sticks', () => {
        expect(aiConfigOf().providers.map(p => p.id)).toEqual(['local-ollama'])
        expect(aiConfigOf({}).providers.map(p => p.id)).toEqual(['local-ollama'])
        expect(aiConfigOf({providers: [], modelProfiles: []})).toEqual({
            enabled: true, providers: [], modelProfiles: [], defaultModelProfile: 'default', features: {},
        })
    })

    it('drops malformed entries and falls back to the first profile as default', () => {
        const c = aiConfigOf({
            providers: [{id: 'p', name: 'P', baseURL: 'http://x/v1', models: [{id: 'm', contextLength: 'big'}, {name: 'no id'}]}, {name: 'no id'}, 'x', {id: 'p'}],
            modelProfiles: [{id: 'a', providerId: 'p', modelId: 'm'}, null, {id: 'b', providerId: 'p', modelId: 'm', tools: false}, {id: 'c', providerId: 'p', modelId: 'm', tools: 'off'}],
            defaultModelProfile: 'gone',
            features: {editorAssistant: '', other: 3},
        })
        expect(c.providers).toEqual([{id: 'p', name: 'P', baseURL: 'http://x/v1', models: [{id: 'm'}]}])
        expect(c.modelProfiles).toEqual([
            {id: 'a', name: '', providerId: 'p', modelId: 'm', systemPrompt: ''},
            {id: 'b', name: '', providerId: 'p', modelId: 'm', systemPrompt: '', tools: false},
            {id: 'c', name: '', providerId: 'p', modelId: 'm', systemPrompt: ''},
        ])
        expect(c.defaultModelProfile).toBe('a')
        expect(aiConfigOf({modelProfiles: [{id: 'p', params: {temperature: 9, bogus: 1}}, {id: 'q', params: 'x'}]}).modelProfiles.map(p => p.params))
            .toEqual([{temperature: 2}, undefined])
        expect(c.features).toEqual({editorAssistant: ''})
    })

    it('keeps AI on unless it is explicitly off', () => {
        expect(aiConfigOf({enabled: false}).enabled).toBe(false)
        expect(aiConfigOf({enabled: 0}).enabled).toBe(true)
    })
})
