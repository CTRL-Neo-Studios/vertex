import {definePlugin} from '#shared/plugin/api'
import {aiEditorExtension, type AssistantConfig} from './lib/extension'

export default definePlugin<AssistantConfig>({
    setup(ctx) {
        // It requires AI, so AI's API is there.
        const ai = ctx.use('ai')!
        ai.registerFeature({id: 'editorAssistant', label: 'plugins.ai-assistant.feature.label', description: 'plugins.ai-assistant.feature.description'})
        // The editor's AI assistant, in the note's own editor only (not callouts, table cells or canvas cards).
        const assistant = aiEditorExtension(ai, () => ctx.config.value, () => !!ctx.use('chat'))
        ctx.editor.extension(() => assistant.value)
    },
})
