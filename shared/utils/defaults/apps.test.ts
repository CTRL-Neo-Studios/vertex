import { describe, expect, it } from 'vitest'
import { defaultAppAiConfig, defaultAppSession, defaultAppSessionContext, defaultAppSettings, defaultAppWorkflowConfig } from './apps'

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

describe('defaultAppSession', () => {
    it('reads old absolute context paths as relative to the root, dropping ones outside it', () => {
        const s = defaultAppSession({
            uuid: 'a', rootFileOrFolderAbsolutePath: '/w/Vault', context: {
                openedAbsoluteFilePaths: ['/w/Vault/A.md', '/w/Vault/Sub/B.md', '/w/Vault Old/C.md', '/elsewhere/D.md'],
                openedAbsoluteFolderPaths: ['/w/Vault/Sub'],
                lastFocusedAbsoluteFilePath: '/w/Vault/Sub/B.md',
            },
        })
        expect(s.context).toMatchObject({openedFilePaths: ['A.md', 'Sub/B.md'], openedFolderPaths: ['Sub'], lastFocusedFilePath: 'Sub/B.md'})
        expect([s.open, s.lastOpened]).toEqual([false, 0])
        expect(defaultAppSessionContext({openedFilePaths: ['X.md']}, '/w').openedFilePaths).toEqual(['X.md'])
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
        expect(defaultAppAiConfig({providers: [], modelProfiles: []})).toEqual({
            enabled: true, providers: [], modelProfiles: [], defaultModelProfile: 'default', features: {}, chatStorage: 'app', chatMode: 'suggest',
            chatTitles: true, editorAssistant: {toolbar: true, slash: true, shortcut: true},
        })
        expect(defaultAppAiConfig({chatStorage: 'workspace'}).chatStorage).toBe('workspace')
        expect(defaultAppAiConfig({chatStorage: 'cloud'}).chatStorage).toBe('app')
        expect(defaultAppAiConfig({chatMode: 'read'}).chatMode).toBe('read')
        expect(defaultAppAiConfig({chatMode: 'ask'}).chatMode).toBe('read')
        expect(defaultAppAiConfig({chatMode: 'write'}).chatMode).toBe('write')
        expect(defaultAppAiConfig({chatMode: 'yolo'}).chatMode).toBe('suggest')
    })

    it('drops malformed entries and falls back to the first profile as default', () => {
        const c = defaultAppAiConfig({
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
        expect(defaultAppAiConfig({modelProfiles: [{id: 'p', params: {temperature: 9, bogus: 1}}, {id: 'q', params: 'x'}]}).modelProfiles.map(p => p.params))
            .toEqual([{temperature: 2}, undefined])
        expect(c.features).toEqual({editorAssistant: ''})
    })

    it('keeps the switches on unless they are explicitly off', () => {
        const off = defaultAppAiConfig({enabled: false, chatTitles: false, editorAssistant: {toolbar: false, slash: 'no', shortcut: false}})
        expect([off.enabled, off.chatTitles, off.editorAssistant]).toEqual([false, false, {toolbar: false, slash: true, shortcut: false}])
        const junk = defaultAppAiConfig({enabled: 0, chatTitles: null, editorAssistant: 'none'})
        expect([junk.enabled, junk.chatTitles, junk.editorAssistant]).toEqual([true, true, {toolbar: true, slash: true, shortcut: true}])
    })
})
