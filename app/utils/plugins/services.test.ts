import {describe, expect, it, vi} from 'vitest'
import type {PluginManifest} from '#shared/plugin/manifest'
import {dataStore, pluginDialogs, pluginNotifications} from './services'

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
// `data_get` answers with the scope it was asked for; the dialogs with a path each.
vi.mock('@tauri-apps/api/core', () => ({
    invoke: async (command: string, args: { root: string | null }) => {
        calls.push(command)
        if (command.endsWith('dialog_open')) return '/picked/in.ics'
        if (command.endsWith('dialog_save')) return '/picked/out.ics'
        return args.root ?? 'global'
    },
}))
const files = vi.hoisted(() => new Map<string, string>([['/picked/in.ics', 'BEGIN:VCALENDAR'], ['/etc/hosts', 'secret']]))
vi.mock('@tauri-apps/plugin-fs', () => ({
    readTextFile: async (path: string) => files.get(path) ?? '',
    writeTextFile: async (path: string, text: string) => void files.set(path, text),
}))
const shown = vi.hoisted(() => [] as unknown[])
vi.mock('@tauri-apps/plugin-notification', () => ({
    isPermissionGranted: async () => true,
    requestPermission: async () => 'granted',
    sendNotification: (n: unknown) => void shown.push(n),
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

describe('pluginDialogs', () => {
    it('reads only what its Open dialog picked and writes only what its Save dialog did', async () => {
        const dialogs = pluginDialogs('tasks')
        await expect(dialogs.readText('/picked/in.ics')).rejects.toThrow("wasn't picked")
        expect(await dialogs.open()).toBe('/picked/in.ics')
        expect(await dialogs.readText('/picked/in.ics')).toBe('BEGIN:VCALENDAR')
        await expect(dialogs.readText('/etc/hosts')).rejects.toThrow("wasn't picked")
        await expect(dialogs.writeText('/picked/in.ics', 'x')).rejects.toThrow("wasn't picked")

        expect(await dialogs.save()).toBe('/picked/out.ics')
        await dialogs.writeText('/picked/out.ics', 'BEGIN:VCALENDAR\r\nEND:VCALENDAR')
        expect(files.get('/picked/out.ics')).toBe('BEGIN:VCALENDAR\r\nEND:VCALENDAR')
        // Another plugin's picks are its own.
        await expect(pluginDialogs('other').readText('/picked/in.ics')).rejects.toThrow("wasn't picked")
    })
})

describe('pluginNotifications', () => {
    const manifest = (permissions: PluginManifest['permissions']) => ({id: 'tasks', name: 'Tasks', version: '1.0.0', apiVersion: 1, permissions}) as PluginManifest
    it('sends only for a plugin that asks for the permission', async () => {
        await expect(pluginNotifications(manifest(['network'])).send({title: 'Due'})).rejects.toThrow('"notifications" permission')
        expect(shown).toEqual([])
        expect(await pluginNotifications(manifest(['notifications'])).send({title: 'Due', body: 'Ship invoice'})).toBe(true)
        expect(shown).toEqual([{title: 'Due', body: 'Ship invoice'}])
    })
})
