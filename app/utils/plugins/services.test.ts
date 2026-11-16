import {describe, expect, it, vi} from 'vitest'
import {dataStore} from './services'

type Handler = (event: { payload: { plugin: string, root: string | null } }) => unknown
const handlers = vi.hoisted(() => [] as Handler[])
/** Registration finishes once `gate.open` resolves (open by default); `calls` lists the commands invoked. */
const gate = vi.hoisted(() => ({open: Promise.resolve() as Promise<void>}))
const calls = vi.hoisted(() => [] as string[])
vi.mock('@tauri-apps/api/event', () => ({
    listen: async (_: string, handler: Handler) => {
        await gate.open
        handlers.push(handler)
        return () => handlers.splice(handlers.indexOf(handler), 1)
    },
}))
// `data_get` answers with the scope it was asked for.
vi.mock('@tauri-apps/api/core', () => ({
    invoke: async (command: string, args: { root: string | null }) => {
        calls.push(command)
        return args.root ?? 'global'
    },
}))

describe('dataStore.onChange', () => {
    it('hears only its own plugin and scope, until removed', async () => {
        const seen: unknown[] = []
        const disposers: (() => void)[] = []
        const own = (dispose: () => void) => disposers.push(dispose)
        dataStore('notes', null, own).onChange(v => seen.push(v))
        const off = dataStore('notes', '/vault', own).onChange(v => seen.push(v))
        const fire = (plugin: string, root: string | null) => Promise.all(handlers.map(h => h({payload: {plugin, root}})))
        await vi.waitFor(() => expect(handlers).toHaveLength(2))

        await fire('notes', null)
        await fire('notes', '/vault')
        await fire('notes', '/other')
        await fire('other', null)
        expect(seen).toEqual(['global', '/vault'])

        off()
        await fire('notes', '/vault')
        expect(seen).toEqual(['global', '/vault'])
        disposers.forEach(d => d())
        await vi.waitFor(() => expect(handlers).toHaveLength(0))
    })

    it('lets set wait for a listener still registering, so a window hears its own write', async () => {
        let open!: () => void
        gate.open = new Promise<void>(resolve => open = resolve)
        const store = dataStore('notes', null, () => {})
        store.onChange(() => {})
        const written = store.set({n: 1})
        await new Promise(resolve => setTimeout(resolve, 10))
        expect(calls).not.toContain('plugin:vertex|data_set')
        open()
        await written
        expect(calls).toContain('plugin:vertex|data_set')
        gate.open = Promise.resolve()
    })
})
