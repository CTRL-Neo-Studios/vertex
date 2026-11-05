import { describe, expect, it } from 'vitest'
import { defaultAppAiConfig, defaultAppSettings, defaultAppWorkflowConfig } from './apps'

describe('defaultAppSettings recovery migration', () => {
    it('maps legacy openLastOpenedWindows=true to workspaces (previous behaviour)', () => {
        expect(defaultAppSettings({ openLastOpenedWindows: true }).recoverSessions).toBe('workspaces')
    })

    it('maps legacy false / missing to none', () => {
        expect(defaultAppSettings({ openLastOpenedWindows: false }).recoverSessions).toBe('none')
        expect(defaultAppSettings().recoverSessions).toBe('none')
    })

    it('explicit recoverSessions wins over the legacy flag', () => {
        expect(defaultAppSettings({ recoverSessions: 'both', openLastOpenedWindows: false }).recoverSessions).toBe('both')
    })

    it('rejects unknown values', () => {
        expect(defaultAppSettings({ recoverSessions: 'everything' as never }).recoverSessions).toBe('none')
    })

    it('does not persist the legacy key', () => {
        expect(defaultAppSettings({ openLastOpenedWindows: true })).not.toHaveProperty('openLastOpenedWindows')
    })

    it('keeps an existing deviceId', () => {
        expect(defaultAppSettings({ deviceId: 'abc' }).deviceId).toBe('abc')
    })
})

describe('defaultAppWorkflowConfig', () => {
    it('replaces invalid limits and keeps a zero timeout (no limit)', () => {
        const c = defaultAppWorkflowConfig({maxLoopIterations: -1, maxStackDepth: 2.5, wallClockTimeoutMs: 0})
        expect(c).toMatchObject({maxLoopIterations: 100_000, maxStackDepth: 64, wallClockTimeoutMs: 0, confirmTrash: true})
    })

    it('drops the old trust records, which moved to trust.json, and defaults file trust to path and content', () => {
        const c = defaultAppWorkflowConfig({trustedWorkspaces: {'/v': {trustedAt: 'x'}}, fileTrust: 'bogus'} as never)
        expect(c).not.toHaveProperty('trustedWorkspaces')
        expect(c.fileTrust).toBe('content')
        expect(defaultAppWorkflowConfig({fileTrust: 'path'}).fileTrust).toBe('path')
    })
})

describe('defaultAppAiConfig', () => {
    it('seeds Local Ollama only when aiConfig is absent, so removing it sticks', () => {
        expect(defaultAppSettings().aiConfig.providers.map(p => p.id)).toEqual(['local-ollama'])
        expect(defaultAppAiConfig({providers: [], modelProfiles: []})).toEqual({providers: [], modelProfiles: [], defaultModelProfile: 'default', features: {}})
    })

    it('drops malformed entries and falls back to the first profile as default', () => {
        const c = defaultAppAiConfig({
            providers: [{id: 'p', name: 'P', baseURL: 'http://x/v1', models: [{id: 'm', contextLength: 'big'}, {name: 'no id'}]}, {name: 'no id'}, 'x', {id: 'p'}],
            modelProfiles: [{id: 'a', providerId: 'p', modelId: 'm'}, null],
            defaultModelProfile: 'gone',
            features: {editorAssistant: '', other: 3},
        })
        expect(c.providers).toEqual([{id: 'p', name: 'P', baseURL: 'http://x/v1', models: [{id: 'm'}]}])
        expect(c.modelProfiles).toEqual([{id: 'a', name: '', providerId: 'p', modelId: 'm', systemPrompt: ''}])
        expect(c.defaultModelProfile).toBe('a')
        expect(c.features).toEqual({editorAssistant: ''})
    })
})
