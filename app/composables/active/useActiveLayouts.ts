import type {ActiveSession} from "#shared/types/active/sessions";
import {sessionScope, StateKey} from "#shared/constants/app";

export function useActiveLayouts(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveLayouts')
    const leftPanelCollapsed = useState<boolean>(StateKey.leftPanel(scope), () => false)
    const rightPanelCollapsed = useState<boolean>(StateKey.rightPanel(scope), () => true)
    /** The left sidebar's view; saved with the session. */
    const leftPanelView = useState<'files' | 'chats'>(StateKey.leftPanelView(scope), () => 'files')
    /** The right sidebar's selected item, `'0'`–`'4'` (`'4'` = Chat). */
    const rightPanelView = useState<string>(StateKey.rightPanelView(scope), () => '0')

    return {
        leftPanelCollapsed,
        rightPanelCollapsed,
        leftPanelView,
        rightPanelView,
    }
}