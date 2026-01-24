import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveTab} from "#shared/types/active/tabs";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types"
import type {EditorDispatcherEvents, ToTocEntryProps} from "#shared/types/active/events";

export function useActiveEditorContent(session?: ActiveSession, tab?: ActiveTab) {
    if (!session || !tab) {
        console.error('No session or tab.')
    }

    const content = useState<string>(`active.tabs.currentTab.${unref(session?.uuid)}.${unref(tab?.fileUuid)}.content`, () => '')

    // const scrollToNodeInView = useState<TocEntry | undefined>(`active.tabs.currentTab.${unref(session?.uuid)}.${unref(tab?.fileUuid)}.scroll-to-node`)

    return {
        content,
        // scrollToNodeInView
    }
}