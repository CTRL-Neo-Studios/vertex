import type {ActiveTab} from "#shared/types/active/tabs";
import type {PossiblyRef} from "#shared/types/types";
import {Routes, type SessionMode} from "#shared/constants/app";

export function useAppNavigator() {
    async function toTab(mode: SessionMode, sessionId: PossiblyRef<string | undefined>, tab: ActiveTab | undefined) {
        const id = unref(sessionId)
        if (!id) return navigateTo(Routes.error)
        return navigateTo(tab ? Routes.sessionTab(id, mode, tab.fileUuid) : Routes.sessionTabs(id, mode))
    }

    return {
        toWorkspaceTab: (sessionId: PossiblyRef<string | undefined>, tab: ActiveTab | undefined) => toTab('workspace', sessionId, tab),
        toSinglespaceTab: (sessionId: PossiblyRef<string | undefined>, tab: ActiveTab | undefined) => toTab('singlespace', sessionId, tab),
        toWorkspaceEmptyTab: (sessionId: PossiblyRef<string | undefined>) => toTab('workspace', sessionId, undefined),
        toSinglespaceEmptyTab: (sessionId: PossiblyRef<string | undefined>) => toTab('singlespace', sessionId, undefined),
        toHome: () => navigateTo(Routes.home),
    }
}
