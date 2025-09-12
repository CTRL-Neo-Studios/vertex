import type {ActiveSession} from "#shared/types/active/sessions";

export function useActiveLayouts(session?: ActiveSession) {
    if (!session) {
        console.error('Invalid session.')
    }

    const leftPanelCollapsed = useState<boolean>(`active.layouts.left-panel.${session?.uuid}`, () => false)
    const rightPanelCollapsed = useState<boolean>(`active.layouts.right-panel.${session?.uuid}`, () => true)

    return {
        leftPanelCollapsed,
        rightPanelCollapsed
    }
}