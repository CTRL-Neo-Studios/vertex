import {defineAsyncComponent} from 'vue'
import type {PluginContext} from '#shared/plugin/api'
import {definePlugin} from '#shared/plugin/api'
import type {BaseViewOption, BasesApi} from './api'
import {useBaseCommandItems} from './lib/useBaseCommands'
import {registerView} from './lib/views'

let ctx: PluginContext | undefined
/** The plugin's context, for its components (they draw only while it runs). */
export const basesContext = () => ctx!

const isBase = (ext: string) => ext === 'base'
const option = (key: string) => `plugins.bases.options.${key}`
const image = (ratio: number): BaseViewOption[] => [
    {key: 'image', label: option('imageProperty'), kind: 'property'},
    {key: 'imageFit', label: option('imageFit'), kind: 'select', default: 'cover', options: ['cover', 'contain'].map(value => ({value, label: option(`imageFits.${value}`)}))},
    {key: 'imageAspectRatio', label: option('imageAspectRatio'), kind: 'slider', min: 0.25, max: 2.5, step: 0.05, default: ratio},
]

export default definePlugin({
    setup(context) {
        ctx = context
        context.files.type({
            id: 'base',
            extensions: ['base'],
            icon: 'i-lucide-table',
            label: 'plugins.bases.fileType',
            new: {label: 'plugins.bases.new', command: 'plugins.bases.newCommand', description: 'plugins.bases.newDescription'},
        })
        // A base queries the workspace's index; in a singlespace it opens as YAML.
        context.views.fileViewer({id: 'bases', loadsText: true, modes: ['workspace'], match: isBase, component: () => import('./components/Viewer.vue')})
        // A base embedded in a note (` ```base `, `![[x.base]]`) or a canvas card, with the note or canvas as `this`.
        context.editor.codeBlock({language: 'base', component: () => import('./components/Embed.vue')})
        context.editor.embed({id: 'base', match: isBase, component: () => import('./components/Embed.vue')})
        // The palette's Bases commands: the open base's, and Insert new base in a note.
        context.onSession((session) => {
            const items = useBaseCommandItems(session)
            context.commands.paletteGroup({id: 'bases', label: () => useNuxtApp().$i18n.t('plugins.bases.commands.group'), items: () => items.value, order: 20})
        })

        // Its own layouts, through the API other plugins get (the map is `bases-map`'s).
        registerView({
            type: 'table', label: 'plugins.bases.layouts.table', icon: 'i-lucide-table',
            options: [{key: 'rowHeight', label: option('rowHeight'), kind: 'select', default: 'short', options: ['short', 'medium', 'tall', 'extra'].map(value => ({value, label: option(`rowHeights.${value}`)}))}],
            component: () => import('./components/Table.vue'),
        })
        registerView({
            type: 'cards', label: 'plugins.bases.layouts.cards', icon: 'i-lucide-layout-grid',
            options: [{key: 'cardSize', label: option('cardSize'), kind: 'slider', min: 50, max: 800, step: 10, default: 200}, ...image(1)],
            component: () => import('./components/Cards.vue'),
        })
        registerView({
            type: 'list', label: 'plugins.bases.layouts.list', icon: 'i-lucide-list',
            options: [
                {key: 'markers', label: option('markers'), kind: 'select', default: 'bullet', options: ['bullet', 'number', 'none'].map(value => ({value, label: option(`markerTypes.${value}`)}))},
                {key: 'indentProperties', label: option('indentProperties'), kind: 'switch', default: false},
                // The separator only joins properties on one line.
                {key: 'separator', label: option('separator'), kind: 'text', default: ', ', when: view => view.indentProperties !== true},
            ],
            component: () => import('./components/List.vue'),
        })
        registerView({
            type: 'kanban', label: 'plugins.bases.layouts.kanban', icon: 'i-lucide-kanban-square',
            options: [{key: 'columnWidth', label: option('columnWidth'), kind: 'slider', min: 200, max: 500, step: 10, default: 280}, ...image(0.5)],
            embedStyle: () => ({minHeight: '500px'}),
            component: () => import('./components/Kanban.vue'),
        })
        context.provide({registerView, Value: defineAsyncComponent(() => import('./components/Value.vue'))} satisfies BasesApi)
    },
})
