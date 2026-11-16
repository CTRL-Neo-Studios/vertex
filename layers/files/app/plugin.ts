import type {PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'

/** The manifest's settings (`config.schema`): what the tree shows. */
export interface FilesConfig {
    showFileExtInName: boolean
    showFileExtAsTag: boolean
    showDefaultFileIcons: boolean
    showDefaultFolderIcons: boolean
    showFoldArrows: boolean
    /** A file's own `icon` property, and its file type's icon. */
    allowCustomFileIcons: boolean
    /** A folder's `icon`, from its properties file. */
    allowCustomFolderIcons: boolean
}

let ctx: PluginContext<FilesConfig> | undefined
/** The plugin's context, for its components (they draw only while it runs). */
export const filesContext = () => ctx!

export default definePlugin<FilesConfig>({
    setup(context) {
        ctx = context
        context.views.panel({
            id: 'files', label: 'plugins.files.name', icon: 'i-lucide-files', defaultArea: 'left',
            when: c => c.isWorkspace,
            component: () => import('./components/View.vue'),
        })
    },
})
