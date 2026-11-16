import type {PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import {canvasLinkTargets, rewriteCanvasLinks} from '../shared/canvasLinks'

/** The manifest's settings (`config.schema`), checked and defaulted by the kernel. */
export interface CanvasConfig {
    /** What a plain mouse wheel does; the other happens with Mod or Space held. */
    wheelBehavior: 'pan' | 'zoom'
    /** What Mod+drag on empty canvas creates at the drawn size. */
    modDragBehavior: 'menu' | 'card' | 'file' | 'media' | 'webpage' | 'group'
    /** File names and URLs above file and link cards. */
    cardLabels: 'always' | 'hover' | 'never'
    snapToGrid: boolean
    snapToObjects: boolean
    /** How much further out (log2 units, −2…2) cards keep their content before showing placeholders. */
    zoomBreakpoint: number
}

let ctx: PluginContext<CanvasConfig> | undefined
/** The plugin's context, for its components (they draw only while it runs). */
export const canvasContext = () => ctx!

const isCanvas = (ext: string) => ext === 'canvas'

export default definePlugin<CanvasConfig>({
    setup(context) {
        ctx = context
        context.files.type({
            id: 'canvas',
            extensions: ['canvas'],
            icon: 'i-lucide-layout-dashboard',
            label: 'plugins.canvas.fileType',
            new: {label: 'plugins.canvas.new', command: 'plugins.canvas.newCommand', description: 'plugins.canvas.newDescription'},
        })
        // Cards show workspace files, so a canvas needs the index; in a singlespace it opens as JSON.
        context.views.fileViewer({id: 'canvas', loadsText: true, modes: ['workspace'], match: isCanvas, component: () => import('./components/Viewer.vue')})
        // File cards, backgrounds and text cards' links: backlinks and link updates on rename.
        context.index.linkExtractor({id: 'canvas', match: isCanvas, targets: canvasLinkTargets, rewrite: rewriteCanvasLinks})
    },
})
