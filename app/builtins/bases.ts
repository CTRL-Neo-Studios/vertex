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
        // The palette's Bases commands: the open base's, and Insert new base in a note.
        ctx.onSession(({session}) => {
            const items = useBaseCommandItems(session)
            ctx.commands.paletteGroup({id: 'bases', label: () => useNuxtApp().$i18n.t('app.editor.ui.bases.commands.group'), items: () => items.value, order: 20})
        })
    },
})
