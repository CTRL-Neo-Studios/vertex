import type {ActiveTab} from "#shared/types/active/tabs";
import type {ActiveSession} from "#shared/types/active/sessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useChats} from "~/composables/ai/useChats";
import {parentPathOf} from "#shared/utils/index/parse";
import {diffSpecOf, diffTitle} from "~/utils/gitDiff";
import {chatChangeOf} from "~/utils/chatChanges";
import {panelViews} from "~/utils/panelViews";

/**
 * How a tab is named and drawn, the same in the tab bar and the tab switcher: a note's name (and its folder,
 * `folder`), a chat's title, a diff's or an AI change's title, a view's name. Undefined for a tab whose content is gone.
 */
export function useTabLabel(session: ActiveSession | undefined) {
    const {t} = useI18n()
    const {getFileByUuid} = useActiveWorkspaceIndex(session)
    const {summary: chatSummary} = useChats(session)

    return (tab: ActiveTab): { label: string, icon: string, folder?: string } | undefined => {
        if (tab.kind === 'chat') return {label: chatSummary(tab.fileUuid).value?.title || t('app.chat.untitled'), icon: 'i-lucide-message-square'}
        if (tab.kind === 'diff') {
            const diff = diffSpecOf(tab.fileUuid)
            if (diff) return {label: diffTitle(diff, t), icon: 'i-lucide-git-compare'}
            const change = chatChangeOf(tab.fileUuid)
            return change && {label: t('app.chat.changes.tabTitle', {name: change.path.slice(change.path.lastIndexOf('/') + 1)}), icon: 'i-lucide-sparkles'}
        }
        if (tab.kind === 'view') {
            const view = panelViews.get(tab.fileUuid)
            return view && {label: t(view.label), icon: view.icon}
        }
        const node = getFileByUuid(tab.fileUuid)
        return node ? {label: node.fileName, icon: tab.changesSaved ? 'i-lucide-file-check' : 'i-lucide-file-diff', folder: parentPathOf(node.relativePath)} : undefined
    }
}
