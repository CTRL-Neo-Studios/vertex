import type {ActiveSession} from "#shared/types/active/sessions";
import type {EditorDispatcherEvents, ToTocEntryProps} from "#shared/types/active/events";

export function useActiveEditorDispatcher(session?: ActiveSession) {
    if (!session) {
        console.error('No session or tab.')
    }

    const dispatcher = useEventDispatcher<EditorDispatcherEvents>(`active.editor.dispatcher.${session?.uuid}`)

    function emitToTocEntry(props: ToTocEntryProps) {
        dispatcher.emit('editor.tableOfContents.toEntry', props)
    }

    return {
        dispatcher,
        emitToTocEntry
    }
}