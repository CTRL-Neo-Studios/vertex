import {listen} from '@tauri-apps/api/event'
import {readTextFile, writeTextFile} from '@tauri-apps/plugin-fs'
import {isPermissionGranted, requestPermission, sendNotification} from '@tauri-apps/plugin-notification'
import type {HostServices, Store} from '#shared/plugin/api'
import type {PluginManifest} from '#shared/plugin/manifest'
import {httpFetch} from '~/utils/httpFetch'
import {pickToOpen, pickToSave} from '~/utils/dialogs'
import {vertexInvoke} from '~/utils/vertexInvoke'
import {registerTrustedFormat, type WindowTrust} from '~/composables/app/useTrust'
import {pageTheme} from '~/utils/plugins/theme'

/** Sent by Rust `data_set` to every window; `root` is `null` for a plugin's global document. */
export const PLUGIN_DATA_CHANGED = 'vertex://plugin-data-changed'

/**
 * Plugin `plugin`'s document in one scope: the global one (`root` `null`) or a workspace's. `own` ties each `onChange`
 * listener to the current scope, as the host's registrations are.
 */
export function dataStore<T>(plugin: string, root: string | null, own: (dispose: () => void) => void): Store<T> {
    const get = async () => (await vertexInvoke<T | null>('data_get', {plugin, root})) ?? undefined
    /** Listeners still registering: `set` waits for them, so a window hears its own write right after `onChange`. */
    const registering = new Set<Promise<unknown>>()
    return {
        get,
        async set(value) {
            await Promise.all(registering)
            await vertexInvoke('data_set', {plugin, root, value})
        },
        onChange(fn) {
            let stopped = false
            const unlisten = listen<{ plugin: string, root: string | null }>(PLUGIN_DATA_CHANGED, async ({payload}) => {
                if (payload.plugin !== plugin || payload.root !== root) return
                const value = await get()
                if (!stopped) fn(value)
            })
            registering.add(unlisten)
            void unlisten.finally(() => registering.delete(unlisten))
            const stop = () => {
                if (stopped) return
                stopped = true
                void unlisten.then(off => off())
            }
            own(stop)
            return stop
        },
    }
}

/**
 * `ctx.dialogs` for one plugin: the Open and Save dialogs, and the text of the files it picked there. `readText` takes
 * what its Open dialogs picked (files, not folders), `writeText` what its Save dialogs did; any other path is refused
 * here, as Rust's scope would refuse one outside the window's reach.
 */
export function pluginDialogs(plugin: string): HostServices['dialogs'] {
    const picked = {open: new Set<string>(), save: new Set<string>()}
    const check = (path: string, by: 'open' | 'save') => {
        if (!picked[by].has(path)) throw new Error(`${plugin}: "${path}" wasn't picked in its ${by === 'open' ? 'Open' : 'Save'} dialog`)
    }
    return {
        async open(options = {}) {
            const path = await pickToOpen(options)
            if (path && !options.directory) picked.open.add(path)
            return path
        },
        async save(options) {
            const path = await pickToSave(options)
            if (path) picked.save.add(path)
            return path
        },
        async readText(path) {
            check(path, 'open')
            return await readTextFile(path)
        },
        async writeText(path, text) {
            check(path, 'save')
            await writeTextFile(path, text)
        },
    }
}

/**
 * `ctx.notifications` for one plugin: refused without the `notifications` permission (the kernel grants the window the
 * notification plugin only while a plugin asking for it is on there). The first one asks the user to allow them.
 */
export function pluginNotifications(manifest: PluginManifest): HostServices['notifications'] {
    return {
        async send({title, body}) {
            if (!manifest.permissions?.includes('notifications')) throw new Error(`${manifest.id}: notifications need the "notifications" permission`)
            if (!(await isPermissionGranted()) && (await requestPermission()) !== 'granted') return false
            sendNotification({title, ...(body !== undefined && {body})})
            return true
        },
    }
}

/**
 * What a plugin gets from the kernel; `root` is the window's workspace (`null` without one); `window` what the Nuxt
 * app's context holds: its trust (`useTrust`) and its strings (`$i18n`).
 */
export function hostServices(manifest: PluginManifest, root: string | null, own: (dispose: () => void) => void, window: {trust: WindowTrust, i18n: HostServices['i18n']}): HostServices {
    const {trust} = window
    const plugin = manifest.id
    return {
        http: {fetch: httpFetch},
        secrets: {
            get: async name => (await vertexInvoke<string | null>('secret_get', {plugin, name})) ?? undefined,
            set: (name, value) => vertexInvoke('secret_set', {plugin, name, value}),
            delete: name => vertexInvoke('secret_delete', {plugin, name}),
        },
        data: {
            global: dataStore(plugin, null, own),
            workspace: root ? dataStore(plugin, root, own) : undefined,
        },
        dialogs: pluginDialogs(plugin),
        notifications: pluginNotifications(manifest),
        i18n: window.i18n,
        ui: {theme: pageTheme()},
        trust: {
            allows: trust.allows,
            trustFile: async (path, hash) => { await trust.trustFile(path, hash) },
            trustFolder: (path, nested, pin) => trust.trustFolder(path, nested, {pin}),
            followEdit: trust.followEdit,
            format(def) {
                const remove = registerTrustedFormat(def)
                own(remove)
                return remove
            },
        },
    }
}
