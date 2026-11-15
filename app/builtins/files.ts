import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        ctx.views.panel({
            id: 'files', label: 'app.chat.files', icon: 'i-lucide-files', defaultArea: 'left',
            when: c => c.isWorkspace,
            component: () => import('~/components/LayoutComponents/PanelFilesView.vue'),
        })
    },
})
