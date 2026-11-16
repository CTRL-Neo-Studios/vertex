import type {ActiveSession} from "#shared/types/active/sessions";
import type {EditorDispatcherEvents} from "#shared/types/active/events";

export function useActiveEditorDispatcher(session?: ActiveSession) {
    if (!session) {
        console.error('No session or tab.')
    }

    const dispatcher = useEventDispatcher<EditorDispatcherEvents>(`active.editor.dispatcher.${session?.uuid}`)

    return {dispatcher}
}