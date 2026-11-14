import type {PropertiesOptions} from "#codemirror-rich-obsidian-editor/editor-types";
import type {ActiveSession} from "#shared/types/active/sessions";
import {isPlainTextFile} from "#shared/utils/fs/filenames";
import {propertySuggestions} from "#shared/utils/index/propertySuggestions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";

/**
 * `<Editor :properties>` for a workspace's notes: names and values offered as Obsidian offers them (all of the
 * workspace's, computed only when a menu asks and again after the index changes). The object never changes: its
 * fields read the index when the panel asks, so an index change doesn't reconfigure the editor (which would rebuild
 * the panel mid-edit). Without a workspace (singlespace), nothing is offered.
 */
export function usePropertiesOptions(session: ActiveSession | undefined): PropertiesOptions {
    if (!session?.workspaceSession) return {}
    const $index = useActiveWorkspaceIndex(session)
    const suggestions = computed(() => propertySuggestions(
        $index.getFilteredFiles(f => !f.isFolder && isPlainTextFile(f.fileExt))
            .map(f => ({properties: f.properties as Record<string, unknown>, tags: f.meta.tags})),
    ))
    return {
        get keySuggestions() {
            return suggestions.value.keys
        },
        valueSuggestions: key => (key === 'tags' || key === 'tag' ? suggestions.value.tags : suggestions.value.values.get(key) ?? []),
    }
}
