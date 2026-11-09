import type {ActiveSession} from "#shared/types/active/sessions";
import type {PanelViewId} from "#shared/types/app/settings";
import {sessionScope, StateKey} from "#shared/constants/app";

/** The side panels' state in this window; saved with the session. Which views each side has is `usePanels`'. */
export function useActiveLayouts(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveLayouts')
    const leftPanelCollapsed = useState<boolean>(StateKey.leftPanel(scope), () => false)
    const rightPanelCollapsed = useState<boolean>(StateKey.rightPanel(scope), () => true)
    /** The view each side shows; unset or not on that side (any more): its first one. */
    const leftPanelView = useState<PanelViewId | undefined>(StateKey.leftPanelView(scope), () => undefined)
    const rightPanelView = useState<PanelViewId | undefined>(StateKey.rightPanelView(scope), () => undefined)

    return {
        leftPanelCollapsed,
        rightPanelCollapsed,
        leftPanelView,
        rightPanelView,
    }
}