import {definePlugin} from '#shared/plugin/api'

export default definePlugin({
    setup(ctx) {
        // ` ```mermaid ` blocks drawn as their diagram, in notes and everything nested in them.
        ctx.editor.codeBlock({language: 'mermaid', component: () => import('~/components/EditorProse/CodeBlock/MermaidGraph.vue')})
    },
})
