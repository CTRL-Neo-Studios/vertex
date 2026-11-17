import {describe, expect, it, vi} from 'vitest'
import {nextTick, ref, watch} from 'vue'
import type {HostServices, PluginContext, PluginDefinition, PluginEntry} from '#shared/plugin/api'
import type {PluginManifest} from '#shared/plugin/manifest'
import {createPluginHost} from './host'

const SESSION = {
    session: {uuid: 's1', workspaceSession: true, rootPath: '/vault'},
    views: {show: () => {}, openInTab: () => {}},
    index: {
        files: () => [], tree: () => [], byPath: () => undefined, byUuid: () => undefined, resolveLink: () => undefined,
        backlinks: () => [], forelinks: () => [], links: () => [], unresolved: () => [], on: () => () => {},
    },
    commands: {list: () => [], paletteGroups: () => []},
    files: {
        assetUrl: () => '', write: async () => {}, create: async () => undefined, edit: async () => {}, move: async () => {},
        undo: async () => {}, redo: async () => {}, importAttachments: async () => [], pick: async () => undefined, vault: () => { throw new Error('none') },
        iconFor: () => undefined, openFolders: ref<string[]>([]), menuFor: () => [], newItems: () => [],
        copy: async () => {}, paste: async () => [], remove: async () => {}, importDrop: async () => [],
        drag: {start: () => {}, rows: () => undefined}, openWithDefaultApp: async () => {}, reveal: async () => {},
    },
    properties: {types: () => ({}), setType: async () => {}},
    tabs: {open: async () => {}, close: async () => {}, active: () => null, list: () => []},
    editor: {viewOf: () => undefined, embedFor: () => undefined},
    watch: () => () => {},
}

function setup(plugins: Record<string, { manifest?: Partial<PluginManifest>, setup?: (ctx: PluginContext) => void, loadError?: Error }>) {
    const log: string[] = []
    const commands = new Map<string, string>()
    const loaded: string[] = []
    const entries: PluginEntry[] = Object.entries(plugins).map(([id, p]) => ({
        manifest: {id, name: id, version: '1.0.0', apiVersion: 1, ...p.manifest},
        source: 'core',
        load: async () => {
            loaded.push(id)
            if (p.loadError) throw p.loadError
            return {default: {setup: ctx => { log.push(id); return p.setup?.(ctx) }} satisfies PluginDefinition}
        },
    }))
    const onFailed = vi.fn()
    const host = createPluginHost(entries, {
        window: {kind: 'session', label: 'session-s1'},
        config: () => ({value: {}, set: async () => {}, overridden: () => false}),
        services: () => ({}) as HostServices,
        contribute(point, owner, def) {
            // Commands by their id; other points by `point:owner`, enough to see them come and go.
            const key = point === 'command' ? (def as {id: string}).id : `${point}:${owner}`
            commands.set(key, owner)
            return () => commands.delete(key)
        },
        onFailed,
    })
    return {host, log, commands, loaded, onFailed}
}

const allOn = () => true

describe('createPluginHost', () => {
    it('starts plugins after what they require, and never fetches one that is off', async () => {
        const {host, log, loaded} = setup({chat: {manifest: {requires: ['ai']}}, ai: {}, canvas: {}})
        await host.apply(m => m.id !== 'canvas')
        expect(log).toEqual(['ai', 'chat'])
        expect(loaded).not.toContain('canvas')
        expect(host.states.get('canvas')).toEqual({status: 'off', reason: {kind: 'disabled'}})
        expect(host.states.get('chat')).toEqual({status: 'active'})
    })

    it('only starts plugins made for its window', async () => {
        const {host, log} = setup({main: {manifest: {windows: ['main']}}, both: {manifest: {windows: ['main', 'session']}}})
        await host.apply(allOn)
        expect(log).toEqual(['both'])
        expect(host.states.has('main')).toBe(false)
    })

    it('marks a plugin whose setup throws as failed, removes what it registered, and starts the rest', async () => {
        const {host, commands, onFailed} = setup({
            broken: {setup: ctx => { ctx.commands.register({id: 'x', label: 'x', run() {}}); throw new Error('boom') }},
            dependent: {manifest: {requires: ['broken']}},
            fine: {setup: ctx => { ctx.commands.register({id: 'y', label: 'y', run() {}}) }},
        })
        await host.apply(allOn)
        expect(host.states.get('broken')).toEqual({status: 'failed', error: 'boom'})
        expect(host.states.get('dependent')).toEqual({status: 'off', reason: {kind: 'requirementFailed', requirement: 'broken'}})
        expect(host.states.get('fine')).toEqual({status: 'active'})
        expect([...commands.keys()]).toEqual(['fine:y'])
        expect(onFailed).toHaveBeenCalledOnce()
    })

    it('fails a plugin with an async setup or a broken entry', async () => {
        const {host} = setup({
            async: {setup: (async () => {}) as unknown as PluginDefinition['setup']},
            unloadable: {loadError: new Error('chunk missing')},
        })
        await host.apply(allOn)
        expect(host.states.get('async')).toMatchObject({status: 'failed', error: expect.stringMatching(/synchronous/)})
        expect(host.states.get('unloadable')).toEqual({status: 'failed', error: 'chunk missing'})
    })

    it('stops what the plugin set up when its scope stops: registrations and effects', async () => {
        const seen: number[] = []
        const counter = ref(0)
        const {host, commands} = setup({
            a: {setup: ctx => {
                ctx.commands.register({id: 'cmd', label: 'cmd', run() {}})
                ctx.views.tabKind({kind: 'a-tab', describe: () => undefined})
                ctx.home.action({id: 'a-home', label: 'l', icon: 'i', run() {}})
                watch(counter, n => seen.push(n))
            }},
        })
        await host.apply(allOn)
        counter.value = 1
        await nextTick()
        expect(commands.has('a:cmd')).toBe(true)
        host.stop()
        counter.value = 2
        await nextTick()
        expect(commands.size).toBe(0)
        expect(seen).toEqual([1])
    })

    it('runs onSession callbacks once the session starts, and ends what they registered with the session', async () => {
        const sessions: string[] = []
        const {host, commands} = setup({
            a: {setup: ctx => {
                ctx.commands.register({id: 'always', label: 'always', run() {}})
                ctx.onSession(({session}) => {
                    sessions.push(session.uuid)
                    ctx.commands.register({id: 'session', label: 'session', run() {}})
                })
            }},
        })
        await host.apply(allOn)
        expect(sessions).toEqual([])
        host.startSession(SESSION)
        expect(sessions).toEqual(['s1'])
        expect([...commands.keys()]).toEqual(['a:always', 'a:session'])
        host.endSession()
        expect([...commands.keys()]).toEqual(['a:always'])
    })

    it('runs the callbacks of a plugin turned on during a session right away', async () => {
        const sessions: string[] = []
        const {host} = setup({late: {setup: ctx => ctx.onSession(({session}) => { sessions.push(session.uuid) })}})
        await host.apply(() => false)
        host.startSession(SESSION)
        await host.apply(allOn)
        expect(sessions).toEqual(['s1'])
    })

    it('fails a plugin whose onSession callback throws or rejects', async () => {
        const {host} = setup({
            sync: {setup: ctx => ctx.onSession(() => { throw new Error('sync') })},
            async: {setup: ctx => ctx.onSession(async () => { throw new Error('async') })},
        })
        await host.apply(allOn)
        host.startSession(SESSION)
        await Promise.resolve()
        expect(host.states.get('sync')).toEqual({status: 'failed', error: 'sync'})
        expect(host.states.get('async')).toEqual({status: 'failed', error: 'async'})
    })

    it('keeps a running plugin that is turned off running until the app restarts', async () => {
        const {host, log} = setup({a: {}, b: {}})
        await host.apply(allOn)
        await host.apply(m => m.id !== 'b')
        expect(host.states.get('b')).toEqual({status: 'active'})
        await host.apply(allOn)
        expect(log).toEqual(['a', 'b'])
    })

    it('retries a failed plugin only after it is turned off and on again', async () => {
        let attempts = 0
        const {host} = setup({flaky: {setup: () => { if (++attempts === 1) throw new Error('first') }}})
        await host.apply(allOn)
        await host.apply(allOn)
        expect(attempts).toBe(1)
        await host.apply(() => false)
        await host.apply(allOn)
        expect(attempts).toBe(2)
        expect(host.states.get('flaky')).toEqual({status: 'active'})
    })

    it('hands a plugin\'s API to the plugins that use it, now or once it starts', async () => {
        const got: unknown[] = []
        const {host} = setup({
            ai: {setup: ctx => ctx.provide({model: 'm'})},
            chat: {manifest: {requires: ['ai']}, setup: ctx => got.push(ctx.use('ai' as never))},
            git: {setup: ctx => ctx.whenPlugin('later' as never, api => got.push(api))},
            later: {setup: ctx => ctx.provide({later: true})},
        })
        await host.apply(m => m.id !== 'later')
        expect(got).toEqual([{model: 'm'}])
        await host.apply(allOn)
        expect(got).toEqual([{model: 'm'}, {later: true}])
    })
})
