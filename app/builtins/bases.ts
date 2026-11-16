import {definePlugin} from '#shared/plugin/api'
import {isBasesFile} from '#shared/utils/fs/filenames'
import {useBaseCommandItems} from '~/composables/bases/useBaseCommands'

export default definePlugin({
    setup(ctx) {
        ctx.files.type({
            id: 'base',
            extensions: ['base'],
            icon: 'i-lucide-table',
            label: 'app.editor.ui.fileTypes.base',
            new: {label: 'app.editor.ui.filetree.newBase', command: 'app.commands.newBase', description: 'app.editor.ui.palette.newBaseDescription'},
        })
        // A base queries the workspace's index; in a singlespace it opens as YAML.
        ctx.views.fileViewer({id: 'bases', loadsText: true, modes: ['workspace'], match: isBasesFile, component: () => import('~/components/ViewerEditor/BasesViewer.vue')})
        // A base embedded in a note (` ```base `, `![[x.base]]`), with the note as `this`.
        ctx.editor.codeBlock({language: 'base', component: () => import('~/components/ViewerEditor/Bases/Embed.vue')})
        ctx.editor.embed({id: 'base', match: isBasesFile, component: () => import('~/components/ViewerEditor/Bases/Embed.vue')})
        // The palette's Bases commands: the open base's, and Insert new base in a note.
        ctx.onSession(({session}) => {
            const items = useBaseCommandItems(session)
            ctx.commands.paletteGroup({id: 'bases', label: () => useNuxtApp().$i18n.t('app.editor.ui.bases.commands.group'), items: () => items.value, order: 20})
        })
    },
})
