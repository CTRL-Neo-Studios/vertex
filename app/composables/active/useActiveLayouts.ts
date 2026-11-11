import type {ActiveSession} from "#shared/types/active/sessions";
import type {PanelViewId} from "#shared/types/app/settings";
import {sessionScope, StateKey} from "#shared/constants/app";

/** The panels' state in this window; saved with the session. Which views each area has is `usePanels`'. */
export function useActiveLayouts(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveLayouts')
    const leftPanelCollapsed = useState<boolean>(StateKey.leftPanel(scope), () => false)
    const rightPanelCollapsed = useState<boolean>(StateKey.rightPanel(scope), () => true)
    /** Collapsed, the bottom area takes no room; the toggle in the editor's corner or the left strip brings it back. */
    const bottomPanelCollapsed = useState<boolean>(StateKey.bottomPanel(scope), () => false)
    /** The view each pane shows: the first of its views listed here, else its first one. */
    const shownPanelViews = useState<PanelViewId[]>(StateKey.shownPanelViews(scope), () => [])

    return {
        leftPanelCollapsed,
        rightPanelCollapsed,
        bottomPanelCollapsed,
        shownPanelViews,
    }
}