import {existsSync, readFileSync} from 'node:fs'
import {basename, join} from 'node:path'
import {addTemplate, addTypeTemplate, defineNuxtModule, getLayerDirectories} from 'nuxt/kit'
import {validateManifest, type PluginManifest} from '../shared/plugin/manifest'

const TEMPLATE = 'core-plugins.mjs'

interface CorePlugin {
    manifest: PluginManifest
    root: string
}

/** Every `layers/<id>/` with a `plugin.json`, validated; a bad one stops the build with what's wrong. */
function findCorePlugins(roots: string[]): CorePlugin[] {
    const found: CorePlugin[] = []
    for (const root of roots) {
        const file = join(root, 'plugin.json')
        if (!existsSync(file)) continue
        const where = `[core-plugins] ${file}`
        let raw: unknown
        try {
            raw = JSON.parse(readFileSync(file, 'utf8'))
        } catch (error) {
            throw new Error(`${where}: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
        }
        const result = validateManifest(raw)
        if (!result.ok) throw new Error(`${where}:\n  - ${result.errors.join('\n  - ')}`)
        const folder = basename(root.replace(/\/+$/, ''))
        if (result.manifest.id !== folder) throw new Error(`${where}: "id" is "${result.manifest.id}" but the folder is "${folder}"`)
        if (!existsSync(join(root, 'app/plugin.ts'))) throw new Error(`${where}: app/plugin.ts is missing`)
        found.push({manifest: result.manifest, root})
    }
    return found.sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))
}

/**
 * Core plugins are the layers in `layers/`. `#build/core-plugins.mjs` lists each one's manifest and a lazy import of
 * its entry, so a plugin that's off is never fetched.
 */
export default defineNuxtModule({
    meta: {name: 'vertex-core-plugins'},
    setup(_, nuxt) {
        const layersDir = join(nuxt.options.rootDir, 'layers')
        const roots = () => getLayerDirectories(nuxt).map(l => l.root).filter(root => root.startsWith(layersDir))
        // Fail at startup, not at the first page load.
        findCorePlugins(roots())
        // A manifest says which windows a plugin runs in and what it requires: a change restarts Nuxt.
        nuxt.options.watch.push(join(layersDir, '*/plugin.json'))

        addTemplate({
            filename: TEMPLATE,
            getContents: () => {
                const lines = findCorePlugins(roots()).map(({manifest, root}) =>
                    `  {manifest: ${JSON.stringify(manifest)}, source: 'core', load: () => import(${JSON.stringify(join(root, 'app/plugin'))})},`)
                return `export const corePlugins = [\n${lines.join('\n')}\n]\n`
            },
        })
        addTypeTemplate({
            filename: 'types/core-plugins.d.ts',
            getContents: () => [
                `declare module '#build/${TEMPLATE}' {`,
                `  import type {PluginEntry} from '#shared/plugin/api'`,
                '  export const corePlugins: PluginEntry[]',
                '}',
                '',
            ].join('\n'),
        })
    },
})
