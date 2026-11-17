import {definePlugin} from '#shared/plugin/api'
import {useAiEditorExtension} from '~/composables/ai/useAiEditorExtension'

export default definePlugin({
    setup(ctx) {
        // It requires AI, so AI's API is there.
        const ai = ctx.use('ai')!
        ai.registerFeature({id: 'editorAssistant', label: 'app.aiFeatures.editorAssistant', description: 'app.aiFeatures.editorAssistantDescription'})
        // The editor's AI assistant, in the note's own editor only (not callouts, table cells or canvas cards).
        const assistant = useAiEditorExtension(ai)
        ctx.editor.extension(() => assistant.value)
    },
})
