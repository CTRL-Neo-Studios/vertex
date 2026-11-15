import type {ActiveTab} from "#shared/types/active/tabs";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {parentPathOf} from "#shared/utils/index/parse";
import {tabKinds} from "~/utils/contributions";

/**
 * How a tab is named and drawn, the same in the tab bar and the tab switcher: a note's name (and its folder,
 * `folder`), or what its kind says (`TabKindDef.describe`). Undefined for a tab whose content is gone.
 */
export function useTabLabel(session: ActiveSession | undefined) {
    const {getFileByUuid} = useActiveWorkspaceIndex(session)

    return (tab: ActiveTab): { label: string, icon: string, folder?: string } | undefined => {
        if (tab.kind) return tabKinds.get(tab.kind)?.describe(tab.fileUuid)
        const node = getFileByUuid(tab.fileUuid)
        return node ? {label: node.fileName, icon: tab.changesSaved ? 'i-lucide-file-check' : 'i-lucide-file-diff', folder: parentPathOf(node.relativePath)} : undefined
    }
}
