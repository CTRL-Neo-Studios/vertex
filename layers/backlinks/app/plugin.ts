import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        // About the open note, which a Bases file doesn't have.
        ctx.views.panel({
            id: 'backlinks', label: 'plugins.backlinks.title', icon: 'i-lucide-square-arrow-out-down-left', defaultArea: 'right',
            when: c => c.activeViewer !== 'bases', scroll: true,
            component: () => import('./components/Panel.vue'),
        })
    },
})
