import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        ctx.views.fileViewer({id: 'latex', loadsText: true, match: ext => ext === 'tex', component: () => import('./components/Viewer.vue')})
    },
})
