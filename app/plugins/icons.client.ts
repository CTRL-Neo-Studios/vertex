import {setCustomIconLoader, type IconifyJSON} from '@iconify/vue'
import {getIconData} from '@iconify/utils'

/**
 * Every icon set the app installs (`@iconify-json/*`), offline. The app's own icons are in Nuxt Icon's client bundle;
 * any other (a community plugin's `i-lucide-…`) would be fetched from the Iconify API, which a desktop app can't count
 * on, so it's read from its installed set instead, each set loaded the first time one of its icons is.
 */
const sets = import.meta.glob<IconifyJSON>('/node_modules/@iconify-json/*/icons.json', {import: 'default'})

export default defineNuxtPlugin(() => {
    for (const [path, load] of Object.entries(sets)) {
        const prefix = path.split('/').at(-2)!
        let set: Promise<IconifyJSON> | undefined
        setCustomIconLoader(async name => getIconData(await (set ??= load()), name), prefix)
    }
})
