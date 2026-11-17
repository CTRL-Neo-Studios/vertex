/**
 * The Vite preset a community plugin builds with: `plugins: [vertex()]` in its `vite.config.ts` turns `src/main.ts`
 * and `plugin.json` into `dist/`, the folder Vertex installs (`plugin.json`, one `main.js`, `styles.css` when there's
 * CSS, the files of `public/`).
 */
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import type {Plugin, PluginOption} from 'vite'
import {validateManifest} from '../../../shared/plugin/manifest'
import {SHARED_GLOBAL} from '../../../shared/plugin/modules'

const PREFIX = '\0vertex-shared:'

/**
 * Each import of a shared module (`vue`, `@codemirror/state`…, the SDK's own) becomes a read from the host's copy on
 * `globalThis`. `names` are each one's exports as the host has them, so importing one it lacks fails the build. Any
 * other part of Nuxt UI fails too: a bundled copy would be a second Nuxt UI beside the app's.
 */
export function sharedModules(names: Record<string, string[]>): Plugin {
    return {
        name: 'vertex:shared-modules',
        enforce: 'pre',
        resolveId(id) {
            if (Object.hasOwn(names, id)) return PREFIX + id
            if (id === '@nuxt/ui' || id.startsWith('@nuxt/ui/')) {
                this.error(`${id}: Nuxt UI is the app's. Use its components by name (<UButton>, resolveComponent('UButton')) and its composables from '@nuxt/ui/composables'.`)
            }
        },
        load(id) {
            if (!id.startsWith(PREFIX)) return
            const name = id.slice(PREFIX.length)
            const shared = `globalThis[${JSON.stringify(SHARED_GLOBAL)}][${JSON.stringify(name)}]`
            // A pure call per name, so the names a plugin doesn't use leave its bundle.
            const read = (key: string) => `/* @__PURE__ */ (() => ${shared}[${JSON.stringify(key)}])()`
            return names[name]!
                .map(key => (key === 'default' ? `export default ${read(key)};` : `export const ${key} = ${read(key)};`))
                .join('\n')
        },
    }
}

export interface VertexOptions {
    /** The plugin's entry, default-exporting `definePlugin({setup(ctx) {…}})`. Default `src/main.ts`. */
    entry?: string
}

export function vertex(options: VertexOptions = {}): PluginOption[] {
    let root = process.cwd()
    const names = JSON.parse(readFileSync(new URL('./modules.json', import.meta.url), 'utf8')) as Record<string, string[]>
    return [
        sharedModules(names),
        tailwindcss(),
        {
            name: 'vertex:package',
            config: () => ({
                // Library builds leave `process.env.NODE_ENV` for the consumer; a plugin is the end of the line.
                define: {'process.env.NODE_ENV': JSON.stringify('production')},
                build: {
                    lib: {entry: options.entry ?? 'src/main.ts', formats: ['es'], fileName: () => 'main.js', cssFileName: 'styles'},
                    // The host imports `main.js` from a blob URL, where a sibling chunk can't be imported.
                    rolldownOptions: {output: {inlineDynamicImports: true}},
                },
            }),
            configResolved(config) {
                root = config.root
            },
            generateBundle() {
                const result = validateManifest(JSON.parse(readFileSync(resolve(root, 'plugin.json'), 'utf8')))
                if (!result.ok) this.error(`plugin.json:\n  - ${result.errors.join('\n  - ')}`)
                this.emitFile({type: 'asset', fileName: 'plugin.json', source: `${JSON.stringify(result.manifest, null, 2)}\n`})
            },
        },
    ]
}
