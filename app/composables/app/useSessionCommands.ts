import type {ActiveSession} from "#shared/types/active/sessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveFileTools} from "~/composables/active/useActiveFileTools";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import {useCommands} from "~/composables/app/useAppWindowMenu";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import useQuickToasts from "~/composables/utility/useQuickToasts";

/**
 * Commands that act on the open session (tabs, save, new folder). Registered by the session layout,
 * so they are enabled exactly while a session window shows a session.
 */
export function useSessionCommands(session?: ActiveSession) {
    const route = useRoute()
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const $navi = useAppNavigator()
    const $tools = useActiveFileTools(session)
    const {tabs, activeTabUuid, closeTab, clearTabs, getActiveTab, setTabSavedState} = useActiveTabs(session)
    const newFileModal = useOverlay().create(NewFileModal)
    const isWorkspace = !!session?.workspaceSession
    const tabId = () => route.params.tabId as string | undefined
    const hasTab = () => !!tabId() && !!getActiveTab(tabId())

    async function showTab(uuid?: string | null) {
        const tab = uuid ? getActiveTab(uuid) : undefined
        if (isWorkspace) await $navi.toWorkspaceTab(session?.uuid, tab)
        else if (tab) await $navi.toSinglespaceTab(session?.uuid, tab)
    }

    /** Explicit save: writes the current buffer now instead of waiting for autosave. */
    async function save(forceDialog: boolean) {
        const id = tabId()
        if (!id) return
        const {content} = useActiveEditorContent(session, getActiveTab(id))
        try {
            if ($tools.isTemporary(id) || forceDialog) {
                if (!$tools.isTemporary(id)) return $qt.warning(t('app.commands.saveAsUnsupported'))
                await $tools.saveTemporaryFileAs(id, content.value)
            } else await $tools.saveContent(id, content.value)
            setTabSavedState(id, true)
        } catch (error) {
            $qt.error(t('app.editor.ui.saveFailed'), String(error))
        }
    }

    useCommands({
        'file.save': {run: () => save(false), enabled: hasTab},
        // Save As currently exists for unsaved "Untitled" buffers only; for files on disk use rename/move.
        'file.saveAs': {run: () => save(true), enabled: () => hasTab() && $tools.isTemporary(tabId()!)},
        ...(isWorkspace ? {
            'file.newFolder': {run: () => newFileModal.open({isFolder: true, asFolder: true, asLevel: 'same', modalTitle: t('app.editor.ui.filetree.newFolder')})},
            'view.closeTab': {
                run: async () => {
                    const id = tabId()
                    if (!id) return
                    closeTab(id)
                    await showTab(activeTabUuid.value)
                },
                enabled: hasTab,
            },
            'view.closeAllTabs': {
                run: async () => {
                    clearTabs()
                    await showTab()
                },
                enabled: () => tabs.value.length > 0,
            },
        } : {}),
    })
}
