import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'yaml', loadsText: true, match: ext => ext === 'yml' || ext === 'yaml', component: () => import('./components/Viewer.vue')})
    },
})
