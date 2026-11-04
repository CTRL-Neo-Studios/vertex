import { describe, expect, it } from 'vitest'
import { defaultAppSettings, defaultAppWorkflowConfig } from './apps'

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
