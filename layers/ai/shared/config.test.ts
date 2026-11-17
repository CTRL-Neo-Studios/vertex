import {describe, expect, it} from 'vitest'
import {aiConfigOf} from './config'

describe('aiConfigOf', () => {
    it('is the seed (Local Ollama) only when nothing is stored, so removing it sticks', () => {
        expect(aiConfigOf().providers.map(p => p.id)).toEqual(['local-ollama'])
        expect(aiConfigOf({}).providers.map(p => p.id)).toEqual(['local-ollama'])
        expect(aiConfigOf({providers: [], modelProfiles: []})).toEqual({
            enabled: true, providers: [], modelProfiles: [], defaultModelProfile: 'default', features: {}, chatStorage: 'app', chatMode: 'suggest',
            chatTitles: true, editorAssistant: {toolbar: true, slash: true, shortcut: true}, commitMessages: {autoSync: false, whenEmpty: true},
        })
        expect(aiConfigOf({chatStorage: 'workspace'}).chatStorage).toBe('workspace')
        expect(aiConfigOf({chatStorage: 'cloud'}).chatStorage).toBe('app')
        expect(aiConfigOf({chatMode: 'read'}).chatMode).toBe('read')
        expect(aiConfigOf({chatMode: 'ask'}).chatMode).toBe('read')
        expect(aiConfigOf({chatMode: 'write'}).chatMode).toBe('write')
        expect(aiConfigOf({chatMode: 'yolo'}).chatMode).toBe('suggest')
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

    it('keeps the switches on unless they are explicitly off (AI auto-sync messages: off unless on)', () => {
        const off = aiConfigOf({enabled: false, chatTitles: false, editorAssistant: {toolbar: false, slash: 'no', shortcut: false}, commitMessages: {whenEmpty: false}})
        expect([off.enabled, off.chatTitles, off.editorAssistant, off.commitMessages]).toEqual([false, false, {toolbar: false, slash: true, shortcut: false}, {autoSync: false, whenEmpty: false}])
        const junk = aiConfigOf({enabled: 0, chatTitles: null, editorAssistant: 'none', commitMessages: {autoSync: 'yes'}})
        expect([junk.enabled, junk.chatTitles, junk.editorAssistant, junk.commitMessages]).toEqual([true, true, {toolbar: true, slash: true, shortcut: true}, {autoSync: false, whenEmpty: true}])
        expect(aiConfigOf({commitMessages: {autoSync: true}}).commitMessages.autoSync).toBe(true)
    })
})
