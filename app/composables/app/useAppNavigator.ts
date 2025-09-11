import type {ActiveTab} from "#shared/types/active/tabs";
import type {PossiblyRef} from "#shared/types/types";

export function useAppNavigator() {
    async function toWorkspaceTab(sessionId: PossiblyRef<string | undefined>, tab: ActiveTab) {
        if (unref(sessionId))
            await navigateTo(`/sessions/${unref(sessionId)}/workspace/tabs/${tab.fileUuid}`)
        else
            await navigateTo(`/sessions/${unref(sessionId)}/workspace/error`)
    }

    async function toSinglespaceTab(sessionId: PossiblyRef<string | undefined>, tab: ActiveTab) {
        if (unref(sessionId))
            await navigateTo(`/sessions/${unref(sessionId)}/singlespace/tabs/${tab.fileUuid}`)
        else
            await navigateTo(`/sessions/${unref(sessionId)}/singlespace/error`)
    }

    async function toWorkspaceEmptyTab(sessionId: PossiblyRef<string | undefined>) {
        if (unref(sessionId))
            await navigateTo(`/sessions/${unref(sessionId)}/workspace/tabs`)
        else
            await navigateTo(`/error`)
    }

    async function toHome() {
        await navigateTo('/')
    }

    return {
        toWorkspaceTab,
        toSinglespaceTab,
        toWorkspaceEmptyTab,
        toHome
    }
}