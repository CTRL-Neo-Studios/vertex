import type {Extension} from "@codemirror/state";
import {aiAssistant, type AiEndpoint} from "@type32/codemirror-rich-obsidian-editor/ext/ai";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {resolveAiFeature} from "~/composables/ai/useAiConfig";
import {createAiFetch} from "~/utils/aiFetch";

/**
 * The editor's AI assistant for this window's effective settings (feature `editorAssistant`), or `[]` when
 * it's off or has no model. The same extension comes back while the endpoint is unchanged: a new one remounts.
 */
export function useAiEditorExtension(): ComputedRef<Extension> {
    const {effective} = useSettingsScope()
    let key = ''
    let extension: Extension = []
    return computed(() => {
        const resolved = effective.value ? resolveAiFeature(effective.value.aiConfig, 'editorAssistant') : null
        const next = resolved ? JSON.stringify([resolved.provider.id, resolved.provider.baseURL, resolved.profile.modelId, resolved.profile.systemPrompt]) : ''
        if (next === key) return extension
        key = next
        // `fetch` and `system` are AiEndpoint fields from editor 0.3.3; the cast covers 0.3.2's types.
        extension = resolved ? aiAssistant({
            endpoint: {
                baseURL: resolved.provider.baseURL,
                model: resolved.profile.modelId,
                system: resolved.profile.systemPrompt || undefined,
                fetch: createAiFetch(resolved.provider.id),
            } as AiEndpoint,
        }) : []
        return extension
    })
}
