import {describe, expect, it} from 'vitest'
import {defaultAppSettings} from '#shared/utils/defaults/apps'
import {effectiveSettings, isOverridden, overridableAs, withAt} from './scopes'

const global = withAt(defaultAppSettings({deviceId: 'd'}), 'advancedThemeConfig.customCss', 'body { color: red }')

describe('effectiveSettings', () => {
    it('lays allowlisted overrides over the global settings and ignores the rest', () => {
        const local = {
            themeConfig: {primaryColor: 'rose'},
            viewConfig: {fileTree: {showFoldArrows: true}},
            language: 'zh-CN',
            updateChannel: 'evil',
            workflowConfig: {confirmTrash: false},
        }
        const s = effectiveSettings(global, local, false)
        expect(s.themeConfig).toEqual({...global.themeConfig, primaryColor: 'rose'})
        expect(s.viewConfig.fileTree).toEqual({...global.viewConfig.fileTree, showFoldArrows: true})
        expect([s.language, s.updateChannel, s.workflowConfig.confirmTrash, s.deviceId]).toEqual(['system', 'stable', true, 'd'])
    })

    it('applies custom CSS only in a trusted workspace', () => {
        const local = {advancedThemeConfig: {customCss: '* { display: none }'}}
        expect(effectiveSettings(global, local, false).advancedThemeConfig.customCss).toBe('body { color: red }')
        expect(effectiveSettings(global, local, true).advancedThemeConfig.customCss).toBe('* { display: none }')
    })

    it('drops values that would break out of the CSS they end up in', () => {
        const s = effectiveSettings(global, {themeConfig: {primaryColor: 'red; } * { x: y', roundedRadius: '0; } *{' as never}}, false)
        expect([s.themeConfig.primaryColor, s.themeConfig.roundedRadius]).toEqual(['indigo', 0.25])
    })
})

describe('overrides', () => {
    it('knows what a workspace may override, by entry or anything under it', () => {
        expect(['themeConfig', 'themeConfig.primaryColor', 'viewConfig.fileTree.showFoldArrows'].map(overridableAs))
            .toEqual(['workspace', 'workspace', 'workspace'])
        expect(overridableAs('advancedThemeConfig.customCss')).toBe('trustedWorkspace')
        expect(['advancedThemeConfig', 'language', 'workflowConfig.fileTrust', 'themeConfigX'].map(overridableAs))
            .toEqual([undefined, undefined, undefined, undefined])
    })

    it('a section counts as overridden only when something in it is', () => {
        const local = {themeConfig: {primaryColor: 'rose'}, viewConfig: {}}
        expect([isOverridden(local, 'themeConfig'), isOverridden(local, 'themeConfig.primaryColor'),
            isOverridden(local, 'themeConfig.neutralColor'), isOverridden(local, 'viewConfig')]).toEqual([true, true, false, false])
    })
})
