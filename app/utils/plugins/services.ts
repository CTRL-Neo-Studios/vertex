import {listen} from '@tauri-apps/api/event'
import type {HostServices, Store} from '#shared/plugin/api'
import {httpFetch} from '~/utils/httpFetch'
import {pickToOpen, pickToSave} from '~/utils/dialogs'
import {vertexInvoke} from '~/utils/vertexInvoke'

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

/** What `plugin` gets from the kernel; `root` is the window's workspace (`null` without one). */
export function hostServices(plugin: string, root: string | null, own: (dispose: () => void) => void): HostServices {
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
        dialogs: {open: pickToOpen, save: pickToSave},
    }
}
