import {definePlugin} from '#shared/plugin/api'
import {tracker} from './lib/outline'

export default definePlugin({
    setup(ctx) {
        // Each note editor's headings and the one holding the cursor, for both views below.
        ctx.editor.extension(tracker)
        // About the open note, which a Bases file doesn't have.
        ctx.views.panel({
            id: 'toc', label: 'plugins.outline.title', icon: 'i-lucide-table-of-contents', defaultArea: 'right',
            when: c => c.activeViewer !== 'bases', scroll: true,
            component: () => import('./components/Panel.vue'),
        })
        // The headings as lines beside the note.
        ctx.views.statusItem({
            id: 'line-outline', placement: 'side', viewers: ['markdown'],
            component: () => import('./components/Lines.vue'),
        })
    },
})
