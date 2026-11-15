import {definePlugin} from '#shared/plugin/api'
import {isCanvasFile} from '#shared/utils/fs/filenames'

export default definePlugin({
    setup(ctx) {
        ctx.files.type({
            id: 'canvas',
            extensions: ['canvas'],
            icon: 'i-lucide-layout-dashboard',
            label: 'app.editor.ui.fileTypes.canvas',
            new: {label: 'app.editor.ui.filetree.newCanvas', command: 'app.commands.newCanvas', description: 'app.editor.ui.palette.newCanvasDescription'},
        })
        // Cards show workspace files, so a canvas needs the index; in a singlespace it opens as JSON.
        ctx.views.fileViewer({id: 'canvas', loadsText: true, modes: ['workspace'], match: isCanvasFile, component: () => import('~/components/ViewerEditor/CanvasViewer.vue')})
    },
})
