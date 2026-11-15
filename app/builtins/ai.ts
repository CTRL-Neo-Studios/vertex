import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        ctx.settings.page({
            id: 'ai', label: 'app.settings.nav.ai', icon: 'i-lucide-sparkles',
            children: [
                {label: 'app.settings.nav.aiProviders', icon: 'i-lucide-server', path: 'providers'},
                {label: 'app.settings.nav.aiModels', icon: 'i-lucide-box', path: 'models'},
                {label: 'app.settings.nav.aiFeatures', icon: 'i-lucide-toggle-right', path: 'features'},
            ],
            component: () => import('~/components/Settings/Ai/AiSettings.vue'),
        })
    },
})
