// Throwaway test harness: runs code from the `zz-cmd` data file, answers in `zz-out`. Removed after the check.
import {getCurrentWebviewWindow} from '@tauri-apps/api/webviewWindow'
import {useAppSettings} from '~/composables/app/useAppSettings'
import {useAppSessionActions} from '~/composables/app/useAppSessionActions'
import {vertexInvoke} from '~/utils/vertexInvoke'

export default defineNuxtPlugin((app) => {
    const label = getCurrentWebviewWindow().label
    const x = {invoke: vertexInvoke, get settings() { return useAppSettings() }, get actions() { return useAppSessionActions() }, label, app}
    const $ = (s: string) => document.querySelector(s)
    const $$ = (s: string) => [...document.querySelectorAll(s)]
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
    let last: number | undefined
    let busy = false
    setInterval(async () => {
        if (busy) return
        const cmd = await vertexInvoke<{ id: number, code: string, window?: string } | null>('data_get', {plugin: 'zz-cmd', root: null}).catch(() => null)
        if (!cmd || cmd.id === last) return
        const first = last === undefined
        last = cmd.id
        if (first || (cmd.window && !label.includes(cmd.window))) return
        busy = true
        let result: unknown
        try {
            result = await new AsyncFunction('x', '$', '$$', 'sleep', cmd.code)(x, $, $$, sleep)
        } catch (e) {
            result = `ERR ${e instanceof Error ? e.stack : e}`
        }
        busy = false
        await vertexInvoke('data_set', {plugin: 'zz-out', root: null, value: {id: cmd.id, result: JSON.parse(JSON.stringify(result ?? null))}})
    }, 300)
})
