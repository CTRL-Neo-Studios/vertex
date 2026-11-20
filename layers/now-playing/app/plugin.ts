import type {PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'

/** The manifest's settings (`config.schema`). */
export interface NowPlayingConfig {
    /** The line moves with the system's audio (macOS asks to let Vertex read it the first time). */
    visualizer: boolean
}

let ctx: PluginContext<NowPlayingConfig> | undefined
/** The plugin's context, for its components (they draw only while it runs). */
export const nowPlayingContext = () => ctx!

export default definePlugin<NowPlayingConfig>({
    setup(context) {
        ctx = context
        // The rest of each pane's action row: the line, and the play controls behind it.
        context.views.paneRule({id: 'now-playing:line', component: () => import('./components/Line.vue')})
    },
})
