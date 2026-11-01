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
    const hash = 'a'.repeat(64)

    it('replaces invalid limits and keeps a zero timeout (no limit)', () => {
        const c = defaultAppWorkflowConfig({maxLoopIterations: -1, maxStackDepth: 2.5, wallClockTimeoutMs: 0})
        expect(c).toMatchObject({maxLoopIterations: 100_000, maxStackDepth: 64, wallClockTimeoutMs: 0, confirmTrash: true})
    })

    it('keeps only well-formed trust records', () => {
        const c = defaultAppWorkflowConfig({trustedPrograms: {
            [hash]: {name: 'Archive', trustedAt: '2026-11-01'},
            'not-a-hash': {name: 'x', trustedAt: 'y'},
            ['b'.repeat(64)]: {name: 'missing date'},
        }})
        expect(c.trustedPrograms).toEqual({[hash]: {name: 'Archive', trustedAt: '2026-11-01'}})
    })
})
