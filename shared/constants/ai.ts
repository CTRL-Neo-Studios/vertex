/**
 * Features that use a model profile (Settings → Assistive AI → Features). Ids are setting-path segments
 * (`aiConfig.features.<id>`), so they can't contain dots.
 */
export const AI_FEATURES = [
    {id: 'editorAssistant', label: 'app.settings.ai.features.editorAssistant', description: 'app.settings.ai.features.editorAssistantDescription'},
] as const

export type AiFeatureId = typeof AI_FEATURES[number]['id']
