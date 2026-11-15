import {describe, expect, it} from 'vitest'
import type {PluginManifest} from './manifest'
import {pluginEnabled, resolvePlugins} from './resolve'

const plugin = (id: string, requires: string[] = [], extra: Partial<PluginManifest> = {}): PluginManifest =>
    ({id, name: id, version: '1.0.0', apiVersion: 1, requires, ...extra})
const resolve = (plugins: PluginManifest[], off: string[] = [], installed: string[] = []) =>
    resolvePlugins(plugins, m => !off.includes(m.id), new Set([...plugins.map(p => p.id), ...installed]))

describe('resolvePlugins', () => {
    it('orders each plugin after what it requires, keeping the given order otherwise', () => {
        const {order, off} = resolve([plugin('chat', ['ai']), plugin('git', ['ai?']), plugin('ai'), plugin('canvas')])
        expect(order).toEqual(['ai', 'chat', 'git', 'canvas'])
        expect(off.size).toBe(0)
    })

    it('turns off a plugin whose requirement is missing, and what requires it', () => {
        const {order, off} = resolve([plugin('chat', ['ai']), plugin('assistant', ['chat']), plugin('canvas')])
        expect(order).toEqual(['canvas'])
        expect(off.get('chat')).toEqual({kind: 'missing', requirement: 'ai'})
        expect(off.get('assistant')).toEqual({kind: 'requirementOff', requirement: 'chat'})
    })

    it('tells a requirement that is turned off, or made for other windows, from a missing one', () => {
        const {off} = resolve([plugin('ai'), plugin('chat', ['ai']), plugin('palette', ['main-only'])], ['ai'], ['main-only'])
        expect(off.get('ai')).toEqual({kind: 'disabled'})
        expect(off.get('chat')).toEqual({kind: 'requirementOff', requirement: 'ai'})
        expect(off.get('palette')).toEqual({kind: 'requirementOff', requirement: 'main-only'})
    })

    it('turns off every plugin of a cycle, and what requires them', () => {
        const {order, off} = resolve([plugin('a', ['b']), plugin('b', ['c']), plugin('c', ['a']), plugin('d', ['a']), plugin('e')])
        expect(order).toEqual(['e'])
        for (const id of ['a', 'b', 'c']) expect(off.get(id)).toEqual({kind: 'cycle', cycle: ['a', 'b', 'c']})
        expect(off.get('d')).toEqual({kind: 'requirementOff', requirement: 'a'})
    })

    it('ignores an optional requirement that is off, and breaks cycles through optional ones', () => {
        const {order, off} = resolve([plugin('git', ['ai?']), plugin('ai'), plugin('x', ['y?']), plugin('y', ['x?'])], ['ai'])
        expect(order).toEqual(['git', 'y', 'x'])
        expect(off.has('git')).toBe(false)
    })
})

describe('pluginEnabled', () => {
    it('follows the user, then the manifest, then on', () => {
        expect(pluginEnabled(plugin('a'), {})).toBe(true)
        expect(pluginEnabled(plugin('a', [], {enabledByDefault: false}), {})).toBe(false)
        expect(pluginEnabled(plugin('a', [], {enabledByDefault: false}), {a: true})).toBe(true)
        expect(pluginEnabled(plugin('a'), {a: false})).toBe(false)
    })
})
