import type {ActiveSession} from "#shared/types/active/sessions";
import {sessionScope, StateKey} from "#shared/constants/app";

export function useActiveLayouts(session?: ActiveSession) {
    const scope = sessionScope(session, 'useActiveLayouts')
    const leftPanelCollapsed = useState<boolean>(StateKey.leftPanel(scope), () => false)
    const rightPanelCollapsed = useState<boolean>(StateKey.rightPanel(scope), () => true)

    return {
        leftPanelCollapsed,
        rightPanelCollapsed
    }
}