import { describe, expect, it } from 'vitest'
import { defaultAppAiConfig, defaultAppGitConfig, defaultAppPluginsConfig, defaultAppSession, defaultAppSessionContext, defaultAppSettings, defaultAppWorkflowConfig } from './apps'

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

describe('defaultAppPluginsConfig', () => {
    it('keeps on/off, config and source for any plugin id and drops values of the wrong kind', () => {
        expect(defaultAppPluginsConfig({
            enabled: {git: false, 'not-installed-here': true, broken: 'yes' as never},
            config: {graph: {depth: 2}, broken: 'x' as never} as never,
            sources: {graph: 'https://example.com/graph.zip', broken: 1 as never},
        })).toEqual({
            enabled: {git: false, 'not-installed-here': true},
            config: {graph: {depth: 2}},
            sources: {graph: 'https://example.com/graph.zip'},
        })
        expect(defaultAppSettings().plugins).toEqual({enabled: {}, config: {}, sources: {}})
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

    it('reads the old one-view-per-side panel state as the shown views', () => {
        expect(defaultAppSessionContext({leftPanelView: 'chats', rightPanelView: 'toc'}).shownPanelViews).toEqual(['chats', 'toc'])
        expect(defaultAppSessionContext({shownPanelViews: ['files', 'split', 'plugin:view'], leftPanelView: 'chats'}).shownPanelViews).toEqual(['files', 'plugin:view'])
        expect(defaultAppSessionContext({}).shownPanelViews).toEqual([])
    })

    it('reads the old chat and view tabs as saved tabs, keeping only well-formed view ids', () => {
        const context = defaultAppSessionContext({openedChatIds: ['c1'], openedViewIds: ['gitHistory', 'split', '../x', 'plugin:view'], lastFocusedViewId: 'gitHistory'})
        expect(context.openedTabs).toEqual([{kind: 'chat', id: 'c1'}, {kind: 'view', id: 'gitHistory'}, {kind: 'view', id: 'plugin:view'}])
        expect(context.lastFocusedTab).toEqual({kind: 'view', id: 'gitHistory'})
        expect(defaultAppSessionContext({lastFocusedChatId: 'c1', lastFocusedViewId: 'gitHistory'}).lastFocusedTab).toEqual({kind: 'chat', id: 'c1'})
        expect(defaultAppSessionContext({lastFocusedViewId: 'separator'}).lastFocusedTab).toBeUndefined()
        expect([defaultAppSessionContext({}).openedTabs, defaultAppSessionContext({}).lastFocusedTab]).toEqual([[], undefined])
    })

    it('drops malformed saved tabs and ignores the old fields once there are saved tabs', () => {
        const context = defaultAppSessionContext({
            openedTabs: [{kind: 'git-diff', id: 'diff-x'}, {kind: '', id: 'a'}, {kind: 'chat'}, 'chat', null, {kind: 'chat', id: 'c2', extra: 1}] as never,
            lastFocusedTab: {kind: 'chat', id: 5} as never,
            openedChatIds: ['c1'],
            lastFocusedChatId: 'c1',
        })
        expect(context.openedTabs).toEqual([{kind: 'git-diff', id: 'diff-x'}, {kind: 'chat', id: 'c2'}])
        expect(context.lastFocusedTab).toBeUndefined()
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

describe('defaultAppGitConfig', () => {
    it('keeps auto-sync off unless each part is turned on, with a positive interval', () => {
        expect(defaultAppSettings().gitConfig).toEqual({path: '', autoSync: {interval: 0, onOpen: false, pullOnFocus: false}})
        expect(defaultAppGitConfig({autoSync: {interval: 15, onOpen: true, pullOnFocus: true}}).autoSync).toEqual({interval: 15, onOpen: true, pullOnFocus: true})
        for (const interval of [-5, Number.NaN, Infinity, '15'] as never[]) {
            expect(defaultAppGitConfig({autoSync: {interval, onOpen: 'yes' as never}}).autoSync).toEqual({interval: 0, onOpen: false, pullOnFocus: false})
        }
    })
})

describe('defaultAppAiConfig', () => {
    it('seeds Local Ollama only when aiConfig is absent, so removing it sticks', () => {
        expect(defaultAppSettings().aiConfig.providers.map(p => p.id)).toEqual(['local-ollama'])
        expect(defaultAppAiConfig({providers: [], modelProfiles: []})).toEqual({
            enabled: true, providers: [], modelProfiles: [], defaultModelProfile: 'default', features: {}, chatStorage: 'app', chatMode: 'suggest',
            chatTitles: true, editorAssistant: {toolbar: true, slash: true, shortcut: true}, commitMessages: {autoSync: false, whenEmpty: true},
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

    it('keeps the switches on unless they are explicitly off (AI auto-sync messages: off unless on)', () => {
        const off = defaultAppAiConfig({enabled: false, chatTitles: false, editorAssistant: {toolbar: false, slash: 'no', shortcut: false}, commitMessages: {whenEmpty: false}})
        expect([off.enabled, off.chatTitles, off.editorAssistant, off.commitMessages]).toEqual([false, false, {toolbar: false, slash: true, shortcut: false}, {autoSync: false, whenEmpty: false}])
        const junk = defaultAppAiConfig({enabled: 0, chatTitles: null, editorAssistant: 'none', commitMessages: {autoSync: 'yes'}})
        expect([junk.enabled, junk.chatTitles, junk.editorAssistant, junk.commitMessages]).toEqual([true, true, {toolbar: true, slash: true, shortcut: true}, {autoSync: false, whenEmpty: true}])
        expect(defaultAppAiConfig({commitMessages: {autoSync: true}}).commitMessages.autoSync).toBe(true)
    })
})
