import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveTab} from "#shared/types/active/tabs";
import {sessionScope, StateKey} from "#shared/constants/app";

export function useActiveEditorContent(session?: ActiveSession, tab?: ActiveTab) {
    if (!tab) console.error('[useActiveEditorContent] called without a tab')
    const content = useState<string>(StateKey.tabContent(sessionScope(session, 'useActiveEditorContent'), tab?.fileUuid ?? '__missing-tab__'), () => '')

    return {
        content,
    }
}
