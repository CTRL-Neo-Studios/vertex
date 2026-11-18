import {globSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {addTemplate, defineNuxtModule, updateTemplates} from 'nuxt/kit'
import {indexFile, ROUTE_COMMENT, type SettingsIndexEntry} from './lib/settingsIndex'

const TEMPLATE = 'settings-index.mjs'

/**
 * Settings search's index (Settings Plan, U7), generated from the templates, not listed by hand: Vertex's pages
 * (`app/pages/settings/*.vue`, their file routes) and the core plugins' settings components (each with its route in
 * a `<!-- settings-index: /settings/… -->` comment, or `off` for an item's page). A row or section it can't read, and a
 * plugin component with rows and no route, stop the build. The plugins' schemas, pages and names are added at run
 * time (`app/utils/settingsSearch.ts`).
 */
function buildIndex(root: string): SettingsIndexEntry[] {
    const errors: string[] = []
    const entries: SettingsIndexEntry[] = []
    const pages = globSync('app/pages/settings/**/*.vue', {cwd: root}).filter(file => !file.includes('['))
    for (const file of pages) {
        const route = `/settings/${file.slice('app/pages/settings/'.length, -'.vue'.length)}`.replace(/\/index$/, '')
        const found = indexFile(readFileSync(join(root, file), 'utf8'), file, route, true)
        entries.push(...found.entries)
        errors.push(...found.unreadable)
    }
    for (const file of globSync('layers/*/app/**/*.vue', {cwd: root})) {
        const source = readFileSync(join(root, file), 'utf8')
        if (!/<Settings(Row|Section)\b/.test(source)) continue
        const route = ROUTE_COMMENT.exec(source)?.[1]
        if (!route) {
            errors.push(`${file}: rows without a route (add <!-- settings-index: /settings/… --> or <!-- settings-index: off -->)`)
            continue
        }
        if (route === 'off') continue
        const found = indexFile(source, file, route, false)
        entries.push(...found.entries)
        errors.push(...found.unreadable)
    }
    if (errors.length) {
        throw new Error(`[settings-index] Settings search can't read these (give the text as t('key'), or mark the row data-no-index):\n  - ${errors.join('\n  - ')}`)
    }
    return entries
}

export default defineNuxtModule({
    meta: {name: 'vertex-settings-index'},
    setup(_, nuxt) {
        const root = nuxt.options.rootDir
        // Fail at startup, not at the first page load.
        buildIndex(root)
        addTemplate({
            filename: TEMPLATE,
            getContents: () => `export const settingsIndex = ${JSON.stringify(buildIndex(root))}\n`,
        })
        // A page's rows changed: the index follows (Nuxt regenerates templates only when files come or go).
        nuxt.hook('builder:watch', async (_event, path) => {
            if (/(^|\/)(pages\/settings|layers\/[^/]+\/app)\/.*\.vue$/.test(path)) await updateTemplates({filter: t => t.filename === TEMPLATE})
        })
    },
})
