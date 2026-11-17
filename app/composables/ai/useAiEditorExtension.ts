import type {Extension} from "@codemirror/state";
import {aiAssistant, type AiEndpoint} from "@type32/codemirror-rich-obsidian-editor/ext/ai";
import type {PluginApis} from "#shared/plugin/api";

/**
 * The editor's AI assistant for this window's AI config (feature `editorAssistant`), or `[]` when it's off or has no
 * model. The same extension comes back while the endpoint is unchanged: a new one remounts. Its entry points follow
 * the config's `editorAssistant`. With only Chat on, it's still installed (on Chat's model) with its entry points off:
 * the chat's edit proposals show in its preview.
 */
export function useAiEditorExtension(ai: PluginApis['ai']): ComputedRef<Extension> {
    let key = ''
    let extension: Extension = []
    return computed(() => {
        const own = ai.resolveFeature('editorAssistant')
        const resolved = own ?? ai.resolveFeature('chat')
        const entries = own ? ai.config().editorAssistant : {toolbar: false, slash: false, shortcut: false}
        const next = resolved ? JSON.stringify([entries, resolved.provider.id, resolved.provider.baseURL, resolved.profile.modelId, resolved.profile.systemPrompt, resolved.profile.params]) : ''
        if (next === key) return extension
        key = next
        // `fetch` and `system` are AiEndpoint fields from editor 0.3.3; the cast covers 0.3.2's types.
        extension = resolved ? aiAssistant({
            endpoint: {
                baseURL: resolved.provider.baseURL,
                model: resolved.profile.modelId,
                system: resolved.profile.systemPrompt || undefined,
                fetch: resolved.fetch,
            } as AiEndpoint,
            toolbar: entries.toolbar,
            slash: entries.slash,
            ...(!entries.shortcut && {shortcut: false as const}),
        }) : []
        return extension
    })
}
