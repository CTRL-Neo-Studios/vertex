import type {ActiveSession} from "#shared/types/active/sessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";
import {useCommands} from "~/composables/app/useAppWindowMenu";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {registerCommand} from "~/utils/commands";
import {fileTypes} from "~/utils/contributions";
import {usePanels} from "~/composables/active/usePanels";

/**
 * Commands that act on the open session (tabs, save, new folder, New for each file type that offers it). Registered
 * by the session layout, so they are enabled exactly while a session window shows a session.
 */
export function useSessionCommands(session?: ActiveSession) {
    const route = useRoute()
    const {t} = useI18n()
    const $navi = useAppNavigator()
    const $tools = useActiveWorkspaceTools(session)
    const $qt = useQuickToasts()
    const {tabs, activeTabUuid, closeTab, clearTabs, getActiveTab, setTabSavedState} = useActiveTabs(session)
    const newFileModal = useOverlay().create(NewFileModal)
    const isWorkspace = !!session?.workspaceSession
    const tabId = () => route.params.tabId as string | undefined
    const hasTab = () => !!tabId() && !!getActiveTab(tabId())
    const panels = usePanels(session)

    async function showTab(uuid?: string | null) {
        const tab = uuid ? getActiveTab(uuid) : undefined
        if (isWorkspace) await $navi.toWorkspaceTab(session?.uuid, tab)
        else if (tab) await $navi.toSinglespaceTab(session?.uuid, tab)
    }

    /** Explicit save: writes the current buffer now instead of waiting for autosave. */
    async function save() {
        const id = tabId()
        if (!id) return
        const {content} = useActiveEditorContent(session, getActiveTab(id))
        try {
            await $tools.saveContent(id, content.value)
            setTabSavedState(id, true)
        } catch (error) {
            $qt.error(t('app.editor.ui.saveFailed'), String(error))
        }
    }

    useCommands({
        'file.save': {run: save, enabled: hasTab},
        'view.toggleBottomPanel': {run: () => panels.toggle('bottom'), enabled: () => panels.areas.value.bottom.panes.length > 0},
        ...(isWorkspace ? {
            'file.newFolder': {run: () => newFileModal.open({asFolder: true, asLevel: 'same', modalTitle: t('app.editor.ui.filetree.newFolder')})},
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

    // File → New for each file type that offers it, after New Folder (group 0).
    if (isWorkspace) watchEffect(onCleanup => {
        for (const type of fileTypes.items.values()) {
            if (!type.new) continue
            const {label, command = label} = type.new
            const fileExt = type.extensions[0]
            onCleanup(registerCommand({
                id: `file.new.${type.id}`,
                plugin: 'kernel',
                label: command,
                menu: {section: 'file', group: 0},
                run: () => newFileModal.open({asFolder: false, asLevel: 'same', fileExt, modalTitle: t(label)}),
            }))
        }
    })
}
