import {definePlugin} from '#shared/plugin/api'
import {isLatexFile} from '#shared/utils/fs/filenames'

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'latex', loadsText: true, match: isLatexFile, component: () => import('~/components/ViewerEditor/LatexDoc.vue')})
    },
})
