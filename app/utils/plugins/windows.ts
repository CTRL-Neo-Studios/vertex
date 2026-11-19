import {listen} from '@tauri-apps/api/event'
import {currentMonitor} from '@tauri-apps/api/window'
import {getCurrentWebviewWindow, WebviewWindow} from '@tauri-apps/api/webviewWindow'
import {LogicalPosition, LogicalSize} from '@tauri-apps/api/dpi'
import {pluginWindowFromLabel, pluginWindowLabel, sessionUuidFromLabel} from '#shared/constants/app'
import type {PluginWindowHandle, WindowChannel, WindowMessage, WindowProps} from '#shared/plugin/api'
import {vertexInvoke} from '~/utils/vertexInvoke'

/** Rust's `PLUGIN_WINDOW_MESSAGE` and `PLUGIN_WINDOW_CLOSED` (`windows.rs`). */
const MESSAGE = 'vertex://plugin-window-message'
const CLOSED = 'vertex://plugin-window-closed'

type Listener = (message: WindowMessage) => void
const key = (plugin: string, id: string) => `${plugin}\u0000${id}`

// A session window's side: what each of its plugins' windows sends it (the kernel names the sender), and their closing.
const heard = new Map<string, Set<Listener>>()
const closing = new Map<string, Set<() => void>>()
let listening: Promise<unknown> | undefined
function listenOnce() {
    listening ??= Promise.all([
        listen<{ plugin: string, id: string, message: WindowMessage }>(MESSAGE, ({payload}) => {
            for (const fn of [...heard.get(key(payload.plugin, payload.id)) ?? []]) fn(payload.message)
        }),
        listen<{ plugin: string, id: string }>(CLOSED, ({payload}) => {
            const k = key(payload.plugin, payload.id)
            for (const fn of [...closing.get(k) ?? []]) fn()
            closing.delete(k)
        }),
    ])
    return listening
}

/**
 * `ctx.windows.open` and `isOpen` for `plugin`, in a session window: the kernel opens the window its manifest declares
 * (or brings it forward), and the handle is its channel. `own` ties a handle's listeners to the caller's scope.
 */
export function pluginWindows(plugin: string, own: (dispose: () => void) => void) {
    const session = () => {
        const uuid = sessionUuidFromLabel(getCurrentWebviewWindow().label)
        if (!uuid) throw new Error(`${plugin}: its windows open from a session window`)
        return uuid
    }
    const handle = async (id: string): Promise<PluginWindowHandle> => {
        const label = pluginWindowLabel(plugin, id, session())
        const k = key(plugin, id)
        await listenOnce()
        const closed = new Promise<void>((resolve) => {
            closing.set(k, (closing.get(k) ?? new Set()).add(resolve))
        })
        return {
            post: message => vertexInvoke('window_message', {to: {plugin, id}, message}),
            on(fn) {
                heard.set(k, (heard.get(k) ?? new Set()).add(fn))
                const stop = () => void heard.get(k)?.delete(fn)
                own(stop)
                return stop
            },
            focus: async () => {
                const window = await WebviewWindow.getByLabel(label)
                await window?.unminimize()
                await window?.setFocus()
            },
            close: async () => {
                await (await WebviewWindow.getByLabel(label))?.close()
            },
            closed,
        }
    }
    return {
        async open(id: string, options?: { params?: Record<string, WindowMessage> }) {
            session()
            await vertexInvoke('window_open', {request: {kind: 'plugin', plugin, id, params: options?.params ?? {}}})
            return handle(id)
        },
        isOpen: async (id: string) => !!(await WebviewWindow.getByLabel(pluginWindowLabel(plugin, id, session()))),
    }
}

/**
 * The props a plugin's window draws with, in that window: its params, its channel to its session window, itself.
 * `onTitle` hears each title the plugin sets (the page draws it: the system's title is hidden).
 */
export async function windowProps(params: Record<string, WindowMessage>, onTitle: (title: string) => void): Promise<WindowProps> {
    const window = getCurrentWebviewWindow()
    if (!pluginWindowFromLabel(window.label)) throw new Error('not a plugin window')
    const listeners = new Set<Listener>()
    await listen<{ message: WindowMessage }>(MESSAGE, ({payload}) => {
        for (const fn of [...listeners]) fn(payload.message)
    })
    const channel: WindowChannel = {
        post: message => vertexInvoke('window_message', {message}),
        on(fn) {
            listeners.add(fn)
            return () => void listeners.delete(fn)
        },
    }
    return {
        params,
        channel,
        window: {
            setTitle: async (title) => {
                await window.setTitle(title)
                onTitle(title)
            },
            setSize: (width, height) => window.setSize(new LogicalSize(width, height)),
            setAlwaysOnTop: on => window.setAlwaysOnTop(on),
            position: async () => {
                const {x, y} = (await window.outerPosition()).toLogical(await window.scaleFactor())
                return {x, y}
            },
            setPosition: (x, y) => window.setPosition(new LogicalPosition(x, y)),
            workArea: async () => {
                const monitor = await currentMonitor()
                if (!monitor) throw new Error('the window is on no screen')
                const {x, y} = monitor.workArea.position.toLogical(monitor.scaleFactor)
                const {width, height} = monitor.workArea.size.toLogical(monitor.scaleFactor)
                return {x, y, width, height}
            },
            close: () => window.close(),
        },
    }
}
