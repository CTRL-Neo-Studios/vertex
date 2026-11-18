import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import * as state from '@codemirror/state'
import {build} from 'vite'
import * as vue from 'vue'
import {afterAll, describe, expect, it} from 'vitest'
import {namedIn, NUXT_UI_COMPONENT, SHARED_GLOBAL} from '../../../shared/plugin/modules'
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
        plugins: [sharedModules({'vue': namesOf(vue), '@codemirror/state': namesOf(state)}, {'@nuxt/ui/components/Button.vue': 'UButton'})],
        // Minified, as a plugin may be: the names the host preloads by must survive it.
        build: {lib: {entry: join(dir, 'main.js'), formats: ['es'], fileName: () => 'out.js'}, outDir: join(dir, 'dist'), minify: true},
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

    it("gives an import of a Nuxt UI component's file the host's component, named where the host looks", async () => {
        const code = await bundle("import UButton from '@nuxt/ui/components/Button.vue'; export {UButton}")
        const button = {name: 'UButton'}
        ;(globalThis as Record<string, unknown>)[SHARED_GLOBAL] = {[NUXT_UI_COMPONENT]: (name: string) => (name === 'UButton' ? button : undefined)}
        const plugin = await import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`)
        expect(plugin.UButton).toBe(button)
        expect(namedIn(code, ['UButton', 'UCard'])).toEqual(['UButton'])
    })

    it("fails the build on a Nuxt UI import it doesn't share, rather than bundle a second Nuxt UI", async () => {
        await expect(bundle("import {omit} from '@nuxt/ui/utils'; export {omit}")).rejects.toThrow(/Nuxt UI is the app's/)
    })
})
