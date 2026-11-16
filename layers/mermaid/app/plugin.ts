import {defineAsyncComponent} from 'vue'
import {definePlugin} from '#shared/plugin/api'
import type {MermaidApi} from './api'

export default definePlugin({
    setup(ctx) {
        // ` ```mermaid ` blocks drawn as their diagram, in notes and everything nested in them.
        ctx.editor.codeBlock({language: 'mermaid', component: () => import('./components/Graph.vue')})
        ctx.provide({Diagram: defineAsyncComponent(() => import('./components/Diagram.vue'))} satisfies MermaidApi)
    },
})
