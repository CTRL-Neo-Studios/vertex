import {describe, expect, it} from 'vitest'
import type {PluginManifest} from '#shared/plugin/manifest'
import {defaultAppSettings} from '#shared/utils/defaults/apps'
import {withAt} from './paths'
import {effectiveSettings, isOverridden, overridableAs, settingsAllowlist, WORKSPACE_OVERRIDABLE} from './scopes'

const global = withAt(defaultAppSettings({deviceId: 'd'}), 'advancedThemeConfig.customCss', 'body { color: red }')
const kernel = WORKSPACE_OVERRIDABLE

describe('effectiveSettings', () => {
    it('lays allowlisted overrides over the global settings and ignores the rest', () => {
        const local = {
            themeConfig: {primaryColor: 'rose'},
            viewConfig: {fileTree: {showFoldArrows: true}},
            language: 'zh-CN',
            updateChannel: 'evil',
            workflowConfig: {confirmTrash: false},
        }
        const s = effectiveSettings(global, local, false, kernel)
        expect(s.themeConfig).toEqual({...global.themeConfig, primaryColor: 'rose'})
        expect(s.viewConfig.fileTree).toEqual({...global.viewConfig.fileTree, showFoldArrows: true})
        expect([s.language, s.updateChannel, s.workflowConfig.confirmTrash, s.deviceId]).toEqual(['system', 'stable', true, 'd'])
    })

    it('applies custom CSS only in a trusted workspace', () => {
        const local = {advancedThemeConfig: {customCss: '* { display: none }'}}
        expect(effectiveSettings(global, local, false, kernel).advancedThemeConfig.customCss).toBe('body { color: red }')
        expect(effectiveSettings(global, local, true, kernel).advancedThemeConfig.customCss).toBe('* { display: none }')
    })

    it('drops values that would break out of the CSS they end up in', () => {
        const s = effectiveSettings(global, {themeConfig: {primaryColor: 'red; } * { x: y', roundedRadius: '0; } *{' as never}}, false, kernel)
        expect([s.themeConfig.primaryColor, s.themeConfig.roundedRadius]).toEqual(['indigo', 0.25])
    })
})

describe('plugins in a workspace', () => {
    const graph: PluginManifest = {
        id: 'graph', name: 'Graph', version: '1', apiVersion: 1,
        config: {overridable: {depth: 'workspace', 'colors.tags': 'trustedWorkspace'}},
    }
    const allowlist = settingsAllowlist([graph])
    const withPlugins = defaultAppSettings({...global, plugins: {enabled: {git: false, ai: true}, config: {graph: {depth: 1, physics: 'slow', colors: {tags: 'red'}}}}})

    it('may turn any plugin off, but on only when trusted', () => {
        const local = {plugins: {enabled: {ai: false, git: true}}}
        expect(effectiveSettings(withPlugins, local, false, allowlist).plugins.enabled).toEqual({git: false, ai: false})
        expect(effectiveSettings(withPlugins, local, true, allowlist).plugins.enabled).toEqual({git: true, ai: false})
    })

    it('overrides only the config keys the manifest declares, the trusted-only ones in a trusted workspace', () => {
        const local = {plugins: {config: {graph: {depth: 5, physics: 'fast', colors: {tags: 'blue'}}}}} as never
        expect(effectiveSettings(withPlugins, local, false, allowlist).plugins.config).toEqual({graph: {depth: 5, physics: 'slow', colors: {tags: 'red'}}})
        expect(effectiveSettings(withPlugins, local, true, allowlist).plugins.config).toEqual({graph: {depth: 5, physics: 'slow', colors: {tags: 'blue'}}})
        expect(['plugins.config.graph.depth', 'plugins.config.graph.colors.tags', 'plugins.config.graph.physics', 'plugins.enabled.git']
            .map(p => overridableAs(p, allowlist))).toEqual(['workspace', 'trustedWorkspace', undefined, 'workspace'])
    })

    it('keeps the config and on/off of plugins it doesn\'t know through a save', () => {
        const saved = defaultAppSettings(JSON.parse(JSON.stringify(withPlugins)))
        expect(saved.plugins).toEqual({enabled: {git: false, ai: true}, config: {graph: {depth: 1, physics: 'slow', colors: {tags: 'red'}}}, sources: {}})
    })
})

describe('overrides', () => {
    it('knows what a workspace may override, by entry or anything under it', () => {
        expect(['themeConfig', 'themeConfig.primaryColor', 'viewConfig.fileTree.showFoldArrows'].map(p => overridableAs(p, kernel)))
            .toEqual(['workspace', 'workspace', 'workspace'])
        expect(overridableAs('advancedThemeConfig.customCss', kernel)).toBe('trustedWorkspace')
        expect(['advancedThemeConfig', 'language', 'workflowConfig.fileTrust', 'themeConfigX', 'plugins.config.graph.depth'].map(p => overridableAs(p, kernel)))
            .toEqual([undefined, undefined, undefined, undefined, undefined])
    })

    it('a section counts as overridden only when something in it is', () => {
        const local = {themeConfig: {primaryColor: 'rose'}, viewConfig: {}}
        expect([isOverridden(local, 'themeConfig'), isOverridden(local, 'themeConfig.primaryColor'),
            isOverridden(local, 'themeConfig.neutralColor'), isOverridden(local, 'viewConfig')]).toEqual([true, true, false, false])
    })
})
