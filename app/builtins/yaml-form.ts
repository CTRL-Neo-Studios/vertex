import {definePlugin} from '#shared/plugin/api'
import {isYamlFile} from '#shared/utils/fs/filenames'

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'yaml', loadsText: true, match: isYamlFile, component: () => import('~/components/ViewerEditor/YamlDataForm.vue')})
    },
})
