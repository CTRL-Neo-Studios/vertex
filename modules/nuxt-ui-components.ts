import {existsSync, readFileSync, statSync} from 'node:fs'
import {dirname, join, resolve} from 'node:path'
import {addTemplate, defineNuxtModule} from 'nuxt/kit'
import type {Component} from 'nuxt/schema'

const PACKAGE = '/node_modules/@nuxt/ui/'

/** Whether `name` is installed where Node would find it from `dir`. */
function installed(dir: string, name: string): boolean {
    for (let at = dir; ; at = dirname(at)) {
        if (existsSync(join(at, 'node_modules', name))) return true
        if (dirname(at) === at) return false
    }
}

/**
 * The files of Nuxt UI that import, themselves or through their relative imports, one of its optional peers this app
 * doesn't install (`@tanstack/charts` for `UChart`): built, they'd fail.
 */
function brokenFiles(root: string): (file: string) => boolean {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { peerDependenciesMeta?: Record<string, { optional?: boolean }> }
    const missing = Object.entries(pkg.peerDependenciesMeta ?? {}).filter(([name, meta]) => meta.optional && !installed(root, name)).map(([name]) => name)
    const known = new Map<string, boolean>()
    const broken = (file: string): boolean => {
        if (known.has(file)) return known.get(file)!
        known.set(file, false)
        let result = false
        for (const [, spec] of readFileSync(file, 'utf8').matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)) {
            // A relative import names a file, or a folder with its `index.js`.
            const target = spec!.startsWith('.') ? [resolve(dirname(file), spec!), resolve(dirname(file), spec!, 'index.js')].find(f => existsSync(f) && statSync(f).isFile()) : undefined
            if (target ? broken(target) : !spec!.startsWith('.') && missing.some(m => spec === m || spec!.startsWith(`${m}/`))) {
                result = true
                break
            }
        }
        known.set(file, result)
        return result
    }
    return broken
}

/**
 * Nuxt UI's components as the app registers them (names, files), for community plugins, which use the app's Nuxt UI:
 * `#build/nuxt-ui-components.mjs` lazy-loads each by name (`app/utils/plugins/community.ts` registers them globally);
 * `.nuxt/nuxt-ui-components.json` (name → file) is what the SDK builds their types from. A component needing an
 * optional peer the app doesn't install is left out.
 */
export default defineNuxtModule({
    meta: {name: 'vertex-nuxt-ui-components'},
    setup(_, nuxt) {
        let components: Component[] = []
        nuxt.hook('components:extend', all => {
            const ui = all.filter(c => c.filePath.includes(PACKAGE) && !c.island && c.mode !== 'server')
            if (!ui.length) return
            const broken = brokenFiles(ui[0]!.filePath.slice(0, ui[0]!.filePath.indexOf(PACKAGE) + PACKAGE.length))
            components = ui.filter(c => !broken(c.filePath))
        })
        addTemplate({
            filename: 'nuxt-ui-components.mjs',
            getContents: () => `export const nuxtUiComponents = {\n${components.map(c =>
                `  ${JSON.stringify(c.pascalName)}: () => import(${JSON.stringify(c.filePath)}).then(m => m[${JSON.stringify(c.export)}]),`).join('\n')}\n}\n`,
        })
        addTemplate({
            filename: 'nuxt-ui-components.json',
            write: true,
            getContents: () => `${JSON.stringify(Object.fromEntries(components.map(c => [c.pascalName, c.filePath])), null, 2)}\n`,
        })
    },
})
