import {definePlugin} from '#shared/plugin/api'
import {open} from './lib/open'

export default definePlugin({
    setup(ctx) {
        // Quick switcher, commands, New items and plugins' groups, on ⌘P.
        ctx.views.overlay({id: 'palette', when: c => c.isWorkspace, component: () => import('./components/Palette.vue')})
        ctx.views.panel({
            id: 'search', label: 'plugins.palette.search', icon: 'i-lucide-search', defaultArea: 'left',
            when: c => c.isWorkspace,
            // The shown view's own search, else the palette.
            action: c => {
                if (c.shownSearch) c.shownSearch()
                else open.value = true
            },
            kbds: c => (c.shownSearch ? undefined : ['meta', 'p']),
        })
    },
})
