import type {PropertiesOptions, PropertyType} from "#codemirror-rich-obsidian-editor/editor-types";
import type {ActiveSession} from "#shared/types/active/sessions";
import {isPlainTextFile} from "#shared/utils/fs/filenames";
import {propertySuggestions} from "#shared/utils/index/propertySuggestions";
import {editorType, storedType} from "#shared/utils/index/propertyTypes";
import {usePropertyTypes} from "~/composables/active/editor/usePropertyTypes";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

/**
 * `<Editor :properties>` for a workspace's notes: the workspace's property types (`usePropertyTypes`, Obsidian's
 * `types.json`; picking a type saves it), and names and values offered as Obsidian offers them (computed only when a
 * menu asks and again after the index changes). The object never changes: its fields read the index and the types
 * when the panel asks, so neither reconfigures the editor (which would rebuild the panel mid-edit). Without a
 * workspace (singlespace), types are inferred and nothing is offered.
 */
export function usePropertiesOptions(session: ActiveSession | undefined): PropertiesOptions {
    if (!session?.workspaceSession) return {}
    const $index = useActiveWorkspaceIndex(session)
    const store = usePropertyTypes(session)
    const suggestions = computed(() => propertySuggestions(
        $index.getFilteredFiles(f => !f.isFolder && isPlainTextFile(f.fileExt))
            .map(f => ({properties: f.properties as Record<string, unknown>, tags: f.meta.tags})),
    ))
    const types = computed(() => Object.fromEntries(Object.entries(store?.types.value ?? {})
        .flatMap(([key, stored]): [string, PropertyType][] => {
            const type = editorType(stored)
            return type ? [[key, type]] : []
        })))
    return {
        get types() {
            return types.value
        },
        onTypeChange: (key, type) => void store?.set(key, storedType(type)).catch(error => console.error('[usePropertiesOptions] save type', error)),
        get keySuggestions() {
            return suggestions.value.keys
        },
        valueSuggestions: key => (key === 'tags' || key === 'tag' ? suggestions.value.tags : suggestions.value.values.get(key) ?? []),
    }
}
