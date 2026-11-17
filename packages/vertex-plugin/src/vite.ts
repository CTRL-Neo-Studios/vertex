/**
 * The Vite preset a community plugin builds with: `plugins: [vertex()]` in its `vite.config.ts` turns `src/main.ts`
 * and `plugin.json` into `dist/`, the folder Vertex installs (`plugin.json`, one `main.js`, `styles.css` when there's
 * CSS, the strings of `locales/`, the files of `public/`); with `pack`, also `plugin.zip` for a release.
 */
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {join, relative, resolve, sep} from 'node:path'
import {crc32, deflateRawSync} from 'node:zlib'
import tailwindcss from '@tailwindcss/vite'
import type {Plugin, PluginOption} from 'vite'
import {validateManifest} from '../../../shared/plugin/manifest'
import {checkPluginMessages} from '../../../shared/plugin/messages'
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
    /**
     * Also writes `plugin.zip` (what's in `dist/`, at its top) beside `dist/`: the asset a release carries, so Vertex can
     * install the plugin from its repository and see its updates.
     */
    pack?: boolean
}

/** A `.zip` of `files` (deflated, names with `/`), as `plugin.zip` is read by Vertex's installer. */
function zip(files: { name: string, data: Buffer }[]): Buffer {
    const DATE_1980 = 0x21
    const parts: Buffer[] = []
    const central: Buffer[] = []
    let offset = 0
    for (const {name, data} of files) {
        const path = Buffer.from(name)
        const body = deflateRawSync(data)
        const crc = crc32(data)
        const local = Buffer.alloc(30)
        local.writeUInt32LE(0x04034b50, 0)
        local.writeUInt16LE(20, 4)
        local.writeUInt16LE(0x0800, 6)
        local.writeUInt16LE(8, 8)
        local.writeUInt16LE(DATE_1980, 12)
        local.writeUInt32LE(crc, 14)
        local.writeUInt32LE(body.length, 18)
        local.writeUInt32LE(data.length, 22)
        local.writeUInt16LE(path.length, 26)
        const entry = Buffer.alloc(46)
        entry.writeUInt32LE(0x02014b50, 0)
        entry.writeUInt16LE(20, 4)
        entry.writeUInt16LE(20, 6)
        entry.writeUInt16LE(0x0800, 8)
        entry.writeUInt16LE(8, 10)
        entry.writeUInt16LE(DATE_1980, 14)
        entry.writeUInt32LE(crc, 16)
        entry.writeUInt32LE(body.length, 20)
        entry.writeUInt32LE(data.length, 24)
        entry.writeUInt16LE(path.length, 28)
        entry.writeUInt32LE(offset, 42)
        parts.push(local, path, body)
        central.push(entry, path)
        offset += local.length + path.length + body.length
    }
    const directory = Buffer.concat(central)
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0)
    end.writeUInt16LE(files.length, 8)
    end.writeUInt16LE(files.length, 10)
    end.writeUInt32LE(directory.length, 12)
    end.writeUInt32LE(offset, 16)
    return Buffer.concat([...parts, directory, end])
}

export function vertex(options: VertexOptions = {}): PluginOption[] {
    let root = process.cwd()
    let outDir = 'dist'
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
                outDir = resolve(root, config.build.outDir)
            },
            generateBundle() {
                const result = validateManifest(JSON.parse(readFileSync(resolve(root, 'plugin.json'), 'utf8')))
                if (!result.ok) this.error(`plugin.json:\n  - ${result.errors.join('\n  - ')}`)
                this.emitFile({type: 'asset', fileName: 'plugin.json', source: `${JSON.stringify(result.manifest, null, 2)}\n`})
                // `locales/<locale>.json`, each `{"plugins": {"<id>": {…}}}`: checked as a core plugin's are (`en` has every
                // key the others have, and what the manifest names), then copied as they are.
                const dir = resolve(root, 'locales')
                const files = Object.fromEntries((existsSync(dir) ? readdirSync(dir) : []).filter(f => f.endsWith('.json'))
                    .map(f => [f.slice(0, -'.json'.length), JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown]))
                const errors = checkPluginMessages(result.manifest.id, files, result.manifest)
                if (errors.length) this.error(`locales/:\n  - ${errors.join('\n  - ')}`)
                for (const [locale, messages] of Object.entries(files)) {
                    this.emitFile({type: 'asset', fileName: `locales/${locale}.json`, source: `${JSON.stringify(messages, null, 2)}\n`})
                }
            },
            closeBundle() {
                if (!options.pack) return
                const files = readdirSync(outDir, {recursive: true, withFileTypes: true})
                    .filter(f => f.isFile())
                    .map(f => ({name: relative(outDir, join(f.parentPath, f.name)).split(sep).join('/'), data: readFileSync(join(f.parentPath, f.name))}))
                    .sort((a, b) => a.name.localeCompare(b.name))
                writeFileSync(resolve(root, 'plugin.zip'), zip(files))
            },
        },
    ]
}
