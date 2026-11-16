import {definePlugin} from '#shared/plugin/api'
import type {BasesApi} from '#layers/bases/app/api'

let bases: BasesApi | undefined
/** Bases' API, for the map's components (they draw only inside a base, so while Bases runs). */
export const basesApi = () => bases!

const option = (key: string) => `plugins.bases-map.options.${key}`

export default definePlugin({
    setup(ctx) {
        // Obsidian's Maps: a Bases layout, registered through Bases' API (`requires` starts Bases first).
        bases = ctx.use('bases')!
        bases.registerView({
            type: 'map', label: 'plugins.bases-map.layout', icon: 'i-lucide-map',
            options: [
                {key: 'mapHeight', label: option('mapHeight'), kind: 'slider', min: 200, max: 800, step: 20, default: 400},
                {key: 'center', label: option('center'), kind: 'formula'},
                {key: 'defaultZoom', label: option('defaultZoom'), kind: 'slider', min: 1, max: 18, step: 1, default: 4},
                {key: 'minZoom', label: option('minZoom'), kind: 'slider', min: 0, max: 24, step: 1, default: 0},
                {key: 'maxZoom', label: option('maxZoom'), kind: 'slider', min: 0, max: 24, step: 1, default: 18},
                {key: 'coordinates', label: option('coordinates'), kind: 'property'},
                {key: 'markerIcon', label: option('markerIcon'), kind: 'property'},
                {key: 'markerColor', label: option('markerColor'), kind: 'property'},
                {key: 'mapTiles', label: option('mapTiles'), kind: 'lines'},
                {key: 'mapTilesDark', label: option('mapTilesDark'), kind: 'lines'},
            ],
            // In a note, `mapHeight` high (Obsidian's 400 by default).
            embedStyle: view => ({height: `${typeof view.mapHeight === 'number' ? view.mapHeight : 400}px`}),
            component: () => import('./components/View.vue'),
        })
    },
})
