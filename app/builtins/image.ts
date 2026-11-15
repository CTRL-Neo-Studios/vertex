import {definePlugin} from '#shared/plugin/api'
import {isImage} from '#shared/utils/fs/filenames'

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'image', loadsText: false, match: isImage, component: () => import('~/components/ViewerEditor/ImageViewer.vue')})
    },
})
