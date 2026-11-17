import type {Extension} from "@codemirror/state";
import {aiAssistant} from "@type32/codemirror-rich-obsidian-editor/ext/ai";
import type {PluginApis} from "#shared/plugin/api";

/** `plugins.config.ai-assistant` (its manifest's schema): where the assistant can be opened from. */
export interface AssistantConfig {
    /** "Ask AI" in the selection toolbar. */
    toolbar: boolean
    /** The AI items in the `/` menu. */
    slash: boolean
    /** ⌘J. */
    shortcut: boolean
}

/**
 * The editor's AI assistant for this window's AI config (feature `editorAssistant`), or `[]` when it's off or has no
 * model. The same extension comes back while the endpoint is unchanged: a new one remounts. Its entry points follow
 * the plugin's config. With only Chat on (and running), it's still installed (on Chat's model) with its entry points
 * off: the chat's edit proposals show in its preview.
 */
export function aiEditorExtension(ai: PluginApis['ai'], config: () => AssistantConfig, chatRuns: () => boolean): ComputedRef<Extension> {
    let key = ''
    let extension: Extension = []
    return computed(() => {
        const own = ai.resolveFeature('editorAssistant')
        const resolved = own ?? (chatRuns() ? ai.resolveFeature('chat') : null)
        const entries = own ? config() : {toolbar: false, slash: false, shortcut: false}
        const next = resolved ? JSON.stringify([entries, resolved.provider.id, resolved.provider.baseURL, resolved.profile.modelId, resolved.profile.systemPrompt, resolved.profile.params]) : ''
        if (next === key) return extension
        key = next
        extension = resolved ? aiAssistant({
            endpoint: {
                baseURL: resolved.provider.baseURL,
                model: resolved.profile.modelId,
                system: resolved.profile.systemPrompt || undefined,
                fetch: resolved.fetch,
            },
            toolbar: entries.toolbar,
            slash: entries.slash,
            ...(!entries.shortcut && {shortcut: false as const}),
        }) : []
        return extension
    })
}
