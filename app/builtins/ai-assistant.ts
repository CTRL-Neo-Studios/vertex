import {definePlugin} from '#shared/plugin/api'
import {useAiEditorExtension} from '~/composables/ai/useAiEditorExtension'

export default definePlugin({
    setup(ctx) {
        // The editor's AI assistant, in the note's own editor only (not callouts, table cells or canvas cards).
        const assistant = useAiEditorExtension()
        ctx.editor.extension(() => assistant.value)
    },
})
