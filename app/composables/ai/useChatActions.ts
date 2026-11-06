import type {ContextMenuItem, DropdownMenuItem} from "@nuxt/ui";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ChatSummary} from "#shared/types/app/chats";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import ChatNameModal from "~/components/Chat/ChatNameModal.vue";
import ChatDeleteModal from "~/components/Chat/ChatDeleteModal.vue";

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const join = (parent: string, name: string) => parent ? `${parent}/${name}` : name

/** The chat and folder menus (with their rename/delete modals), shared by the Chats view and a chat's header. */
export function useChatActions(session?: ActiveSession) {
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const $ovl = useOverlay()
    const {index, vault, lock, createChat, renameChat, moveChat, deleteChat, createFolder, renameFolder, deleteFolder, showInSidePanel, openInTab} = useChats(session)
    const nameModal = $ovl.create(ChatNameModal)
    const deleteModal = $ovl.create(ChatDeleteModal)

    const chatTitle = (chat: ChatSummary) => chat.title || t('app.chat.untitled')

    /** Runs a chat operation, showing its failure as a toast. */
    async function run(action: () => Promise<unknown>) {
        try {
            await action()
        } catch (e) {
            $qt.error(t('app.chat.actionFailed'), e instanceof Error ? e.message : String(e))
        }
    }

    const newChat = (folder = '') => run(async () => openInTab((await createChat(folder)).id))

    async function newFolder(parent = '') {
        const name = await nameModal.open({modalTitle: t('app.chat.newFolder'), label: t('app.chat.folderName'), folder: true}).result
        if (name) await run(() => createFolder(join(parent, name)))
    }

    async function rename(chat: ChatSummary) {
        const title = await nameModal.open({modalTitle: t('app.chat.rename'), label: t('app.chat.title'), value: chat.title}).result
        if (title && title !== chat.title) await run(() => renameChat(chat.id, title))
    }

    async function renameFolderAt(path: string) {
        const name = await nameModal.open({modalTitle: t('app.chat.rename'), label: t('app.chat.folderName'), value: baseName(path), folder: true}).result
        if (name && name !== baseName(path)) await run(() => renameFolder(path, join(parentOf(path), name)))
    }

    async function remove(chat: ChatSummary) {
        const ok = await deleteModal.open({modalTitle: t('app.chat.deleteChat'), description: t('app.chat.deleteChatConfirm', {title: chatTitle(chat)})}).result
        if (ok) await run(() => deleteChat(chat.id))
    }

    async function removeFolder(path: string) {
        const ok = await deleteModal.open({modalTitle: t('app.chat.deleteFolder'), description: t('app.chat.deleteFolderConfirm', {folder: path})}).result
        if (ok) await run(() => deleteFolder(path))
    }

    const createItems = (folder: string): ContextMenuItem[] => [
        {label: t('app.chat.newChat'), icon: 'i-lucide-circle-plus', onSelect: () => newChat(folder)},
        {label: t('app.chat.newFolder'), icon: 'i-lucide-folder-plus', onSelect: () => newFolder(folder)},
    ]

    /** The empty-space menu: create, plus Lock while the encrypted store is unlocked. */
    const panelMenu = computed<ContextMenuItem[][]>(() => vault.value === 'unlocked'
        ? [createItems(''), [{label: t('app.chat.lock'), icon: 'i-lucide-lock', onSelect: () => run(lock)}]]
        : [createItems('')])

    /** `here`: where the chat is shown, so its own "open there" entry is left out. */
    function chatActions(chat: ChatSummary, here?: 'tab' | 'side'): DropdownMenuItem[][] {
        const folders = [...(index.value?.folders ?? [])].sort()
        const open: DropdownMenuItem[] = [
            ...(here === 'tab' ? [] : [{label: t('app.chat.openInTab'), icon: 'i-lucide-square-plus', onSelect: () => run(() => openInTab(chat.id))}]),
            ...(here === 'side' ? [] : [{label: t('app.chat.showInSidePanel'), icon: 'i-lucide-panel-right', onSelect: () => showInSidePanel(chat.id)}]),
        ]
        return [
            open,
            [
                {label: t('app.chat.rename'), icon: 'i-lucide-pencil', onSelect: () => rename(chat)},
                {
                    label: t('app.chat.moveTo'),
                    icon: 'i-lucide-folder-tree',
                    children: [
                        {label: t('app.chat.topLevel'), icon: 'i-lucide-folder-root', disabled: chat.folder === '', onSelect: () => run(() => moveChat(chat.id, ''))},
                        ...folders.map(f => ({label: f, icon: 'i-lucide-folder', disabled: f === chat.folder, onSelect: () => run(() => moveChat(chat.id, f))})),
                    ],
                },
            ],
            [{label: t('app.generic.delete'), icon: 'i-lucide-trash', color: 'error', onSelect: () => remove(chat)}],
        ]
    }

    function folderActions(path: string): DropdownMenuItem[][] {
        return [
            [
                {label: t('app.chat.newChatHere'), icon: 'i-lucide-circle-plus', onSelect: () => newChat(path)},
                {label: t('app.chat.newFolderInside'), icon: 'i-lucide-folder-plus', onSelect: () => newFolder(path)},
            ],
            [{label: t('app.chat.rename'), icon: 'i-lucide-pencil', onSelect: () => renameFolderAt(path)}],
            [{label: t('app.generic.delete'), icon: 'i-lucide-trash', color: 'error', onSelect: () => removeFolder(path)}],
        ]
    }

    return {run, chatTitle, newChat, newFolder, panelMenu, chatActions, folderActions}
}
