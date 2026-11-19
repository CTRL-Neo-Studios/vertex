import type {ContextMenuItem, DropdownMenuItem} from "@nuxt/ui";
import type {SessionContext} from "#shared/plugin/api";
import type {ChatSummary} from "../../shared/types";
import {useChats} from "./chats";
import {useNotify} from "./notify";
import {chatClient} from "./client";
import ChatNameModal from "../components/NameModal.vue";
import ChatDeleteModal from "../components/DeleteModal.vue";
import ChatPasswordModal from "../components/PasswordModal.vue";
import ChatContextModal from "../components/ContextModal.vue";

const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const join = (parent: string, name: string) => parent ? `${parent}/${name}` : name

/** A message a chat's thread should scroll to, once it shows that chat (it may mount after this is set). */
export const scrollRequest = shallowRef<{ chatId: string, messageId: string }>()

/** The chat and folder menus (with their rename/delete modals), shared by the Chats view and a chat's header. */
export function useChatActions(session: SessionContext) {
    // Not `useI18n`: the plugin's New Chat command uses it outside a component's setup.
    const {t} = useNuxtApp().$i18n
    const $qt = useNotify()
    const $ovl = useOverlay()
    const {root, index, vault, lock, createChat, renameChat, moveChat, deleteChat, createFolder, renameFolder, deleteFolder, showInSidePanel, openInTab, liveChat, sidePanelChatId} = useChats(session)
    const nameModal = $ovl.create(ChatNameModal)
    const deleteModal = $ovl.create(ChatDeleteModal)
    const passwordModal = $ovl.create(ChatPasswordModal)
    const contextModal = $ovl.create(ChatContextModal)

    const chatTitle = (chat: ChatSummary) => chat.title || t('plugins.chat.untitled')

    /** Runs a chat operation, showing its failure as a toast. */
    async function run(action: () => Promise<unknown>) {
        try {
            await action()
        } catch (e) {
            $qt.error(t('plugins.chat.actionFailed'), e instanceof Error ? e.message : String(e))
        }
    }

    const newChat = (folder = '') => run(async () => openInTab((await createChat(folder)).id))

    /**
     * The chat's context view, opened at `focus` (a message id) if given. Its Show in chat closes it with a message id:
     * the chat is shown (where it is, else in a tab) and scrolled to that message.
     */
    const showContext = (chat: ChatSummary, focus?: string) => run(async () => {
        const messageId = await contextModal.open({messages: (await liveChat(chat.id)).messages, title: chatTitle(chat), focus}).result
        if (!messageId) return
        scrollRequest.value = {chatId: chat.id, messageId}
        if (sidePanelChatId.value === chat.id) showInSidePanel(chat.id)
        else await openInTab(chat.id)
    })

    async function newFolder(parent = '') {
        const name = await nameModal.open({modalTitle: t('plugins.chat.newFolder'), label: t('plugins.chat.folderName'), folder: true}).result
        if (name) await run(() => createFolder(join(parent, name)))
    }

    async function rename(chat: ChatSummary) {
        const title = await nameModal.open({modalTitle: t('plugins.chat.rename'), label: t('plugins.chat.title'), value: chat.title}).result
        if (title && title !== chat.title) await run(() => renameChat(chat.id, title))
    }

    async function renameFolderAt(path: string) {
        const name = await nameModal.open({modalTitle: t('plugins.chat.rename'), label: t('plugins.chat.folderName'), value: baseName(path), folder: true}).result
        if (name && name !== baseName(path)) await run(() => renameFolder(path, join(parentOf(path), name)))
    }

    async function remove(chat: ChatSummary) {
        const ok = await deleteModal.open({modalTitle: t('plugins.chat.deleteChat'), description: t('plugins.chat.deleteChatConfirm', {title: chatTitle(chat)})}).result
        if (ok) await run(() => deleteChat(chat.id))
    }

    async function removeFolder(path: string) {
        const ok = await deleteModal.open({modalTitle: t('plugins.chat.deleteFolder'), description: t('plugins.chat.deleteFolderConfirm', {folder: path})}).result
        if (ok) await run(() => deleteFolder(path))
    }

    /** Moves a folder (with its subfolders and chats) into `dest` ('' = top level). */
    const moveFolderTo = (path: string, dest: string) => run(() => renameFolder(path, join(dest, baseName(path))))

    const createItems = (folder: string): ContextMenuItem[] => [
        {label: t('plugins.chat.newChat'), icon: 'i-lucide-circle-plus', onSelect: () => newChat(folder)},
        {label: t('plugins.chat.newFolder'), icon: 'i-lucide-folder-plus', onSelect: () => newFolder(folder)},
    ]

    async function changePassword() {
        const r = root.value
        if (!r) return
        const changed = await passwordModal.open({change: (current: string, next: string) => chatClient.vaultChange(r, current, next)}).result
        if (changed) $qt.success(t('plugins.chat.vault.changed'))
    }

    /** The empty-space menu: create, plus Change password and Lock while the encrypted store is unlocked. */
    const panelMenu = computed<ContextMenuItem[][]>(() => vault.value === 'unlocked'
        ? [createItems(''), [
            {label: t('plugins.chat.changePassword'), icon: 'i-lucide-key-round', onSelect: changePassword},
            {label: t('plugins.chat.lock'), icon: 'i-lucide-lock', onSelect: () => run(lock)},
        ]]
        : [createItems('')])

    const sortedFolders = computed(() => [...(index.value?.folders ?? [])].sort())

    /** `here`: where the chat is shown, so its own "open there" entry is left out. */
    function chatActions(chat: ChatSummary, here?: 'tab' | 'side'): DropdownMenuItem[][] {
        const folders = sortedFolders.value
        const open: DropdownMenuItem[] = [
            ...(here === 'tab' ? [] : [{label: t('plugins.chat.openInTab'), icon: 'i-lucide-square-plus', onSelect: () => run(() => openInTab(chat.id))}]),
            ...(here === 'side' ? [] : [{label: t('plugins.chat.showInSidePanel'), icon: 'i-lucide-panel-right', onSelect: () => showInSidePanel(chat.id)}]),
        ]
        return [
            open,
            [
                {label: t('plugins.chat.rename'), icon: 'i-lucide-pencil', onSelect: () => rename(chat)},
                {
                    label: t('plugins.chat.moveTo'),
                    icon: 'i-lucide-folder-tree',
                    children: [
                        {label: t('plugins.chat.topLevel'), icon: 'i-lucide-folder-root', disabled: chat.folder === '', onSelect: () => run(() => moveChat(chat.id, ''))},
                        ...folders.map(f => ({label: f, icon: 'i-lucide-folder', disabled: f === chat.folder, onSelect: () => run(() => moveChat(chat.id, f))})),
                    ],
                },
            ],
            [{label: t('plugins.chat.context.open'), icon: 'i-lucide-info', onSelect: () => showContext(chat)}],
            [{label: t('app.generic.delete'), icon: 'i-lucide-trash', color: 'error', onSelect: () => remove(chat)}],
        ]
    }

    function folderActions(path: string): DropdownMenuItem[][] {
        const parent = parentOf(path)
        const moveTo = (dest: string) => moveFolderTo(path, dest)
        // Not into itself or its own subfolders.
        const targets = sortedFolders.value.filter(f => f !== path && !f.startsWith(`${path}/`))
        return [
            [
                {label: t('plugins.chat.newChatHere'), icon: 'i-lucide-circle-plus', onSelect: () => newChat(path)},
                {label: t('plugins.chat.newFolderInside'), icon: 'i-lucide-folder-plus', onSelect: () => newFolder(path)},
            ],
            [
                {label: t('plugins.chat.rename'), icon: 'i-lucide-pencil', onSelect: () => renameFolderAt(path)},
                {
                    label: t('plugins.chat.moveTo'),
                    icon: 'i-lucide-folder-tree',
                    children: [
                        {label: t('plugins.chat.topLevel'), icon: 'i-lucide-folder-root', disabled: parent === '', onSelect: () => moveTo('')},
                        ...targets.map(f => ({label: f, icon: 'i-lucide-folder', disabled: f === parent, onSelect: () => moveTo(f)})),
                    ],
                },
            ],
            [{label: t('app.generic.delete'), icon: 'i-lucide-trash', color: 'error', onSelect: () => removeFolder(path)}],
        ]
    }

    return {run, chatTitle, newChat, newFolder, moveFolderTo, panelMenu, chatActions, folderActions, showContext}
}
