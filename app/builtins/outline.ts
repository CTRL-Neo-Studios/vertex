import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        // About the open note, which a Bases file doesn't have.
        ctx.views.panel({
            id: 'toc', label: 'app.editor.ui.functions.tableOfContents', icon: 'i-lucide-table-of-contents', defaultArea: 'right',
            when: c => c.activeViewer !== 'bases', scroll: true,
            component: () => import('~/components/TableOfContentsPanelComponent.vue'),
        })
        // The headings as lines beside the note.
        ctx.views.statusItem({
            id: 'line-outline', placement: 'side', viewers: ['markdown'],
            component: () => import('~/components/MinimalLineToc.vue'),
        })
    },
})
