import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as state from '@codemirror/state'
import {build} from 'vite'
import * as vue from 'vue'
import {afterAll, describe, expect, it} from 'vitest'
import {SHARED_GLOBAL} from '../../../shared/plugin/modules'
import {sharedModules} from './vite'

const dir = mkdtempSync(join(tmpdir(), 'vertex-sdk-'))
afterAll(() => rmSync(dir, {recursive: true, force: true}))

// Node adds a `module.exports` key to a CommonJS package's namespace; the SDK's table holds identifiers only.
const namesOf = (module: object) => Object.keys(module).filter(k => /^[A-Za-z_$][\w$]*$/.test(k))

async function bundle(code: string): Promise<string> {
    writeFileSync(join(dir, 'main.js'), code)
    await build({
        configFile: false,
        logLevel: 'silent',
        root: dir,
        plugins: [sharedModules({'vue': namesOf(vue), '@codemirror/state': namesOf(state)})],
        build: {lib: {entry: join(dir, 'main.js'), formats: ['es'], fileName: () => 'out.js'}, outDir: join(dir, 'dist')},
    })
    return readFileSync(join(dir, 'dist/out.js'), 'utf8')
}

describe('sharedModules', () => {
    it("gives a plugin the host's copies, with no import left for a blob URL to fail on", async () => {
        const code = await bundle("import {ref} from 'vue'; import {EditorState} from '@codemirror/state'; export {ref, EditorState}")
        ;(globalThis as Record<string, unknown>)[SHARED_GLOBAL] = {'vue': vue, '@codemirror/state': state}
        // A data URL resolves no bare specifier, as a blob URL doesn't.
        const plugin = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`)
        expect(plugin.ref).toBe(vue.ref)
        expect(plugin.EditorState).toBe(state.EditorState)
    })

    it("fails the build on a name the host's copy lacks", async () => {
        await expect(bundle("import {notInVue} from 'vue'; export {notInVue}")).rejects.toThrow(/notInVue/)
    })

    it("fails the build on a Nuxt UI import it doesn't share, rather than bundle a second Nuxt UI", async () => {
        await expect(bundle("import UButton from '@nuxt/ui/components/Button.vue'; export {UButton}")).rejects.toThrow(/Nuxt UI is the app's/)
    })
})
