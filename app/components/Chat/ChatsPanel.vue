<script setup lang="ts">
import type {CommandPaletteGroup, ContextMenuItem, DropdownMenuItem, NavigationMenuChildItem, NavigationMenuItem} from "@nuxt/ui";
import type {ChatSummary} from "#shared/types/app/chats";
import {StateKey} from "#shared/constants/app";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import ChatVaultForm from "~/components/Chat/ChatVaultForm.vue";
import ChatNameModal from "~/components/Chat/ChatNameModal.vue";
import ChatDeleteModal from "~/components/Chat/ChatDeleteModal.vue";

/**
 * The left sidebar's Chats view, after the Nuxt UI chat template: a New chat item, then the list (folders first,
 * then loose chats grouped by date) with a hover menu per item, and the chat search.
 */
const {t, locale} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const $ovl = useOverlay()
const sessionId = computed(() => $route.params.sessionId as string)
const session = useActiveSessions().getSession(sessionId)
const {activeTabUuid} = useActiveTabs(session)
const {
    storage, vault, index, error, refresh, lock, createChat, renameChat, moveChat, deleteChat,
    createFolder, renameFolder, deleteFolder, showInSidePanel, openInTab,
} = useChats(session)

watch(storage, () => refresh(), {immediate: true})

const nameModal = $ovl.create(ChatNameModal)
const deleteModal = $ovl.create(ChatDeleteModal)
const expanded = useState<string[]>(StateKey.chatsExpanded(sessionId.value), () => [])

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)

const locked = computed(() => vault.value === 'none' || vault.value === 'locked')
const chatTitle = (chat: ChatSummary) => chat.title || t('app.chat.untitled')
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const join = (parent: string, name: string) => parent ? `${parent}/${name}` : name
const folderKey = (path: string) => `folder:${path}`

// ponytail: open folders are recorded from clicks on their icon or label, the accordion doesn't report nested toggles.
function toggleFolder(path: string) {
    const key = folderKey(path)
    expanded.value = expanded.value.includes(key) ? expanded.value.filter(k => k !== key) : [...expanded.value, key]
}

/** Today, Yesterday, Last 7 days, Last 30 days, then month and year, from `updated`. */
function dateLabel(updated: number) {
    const now = new Date()
    const dayStart = (daysAgo: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo).getTime()
    if (updated >= dayStart(0)) return t('app.chat.today')
    if (updated >= dayStart(1)) return t('app.chat.yesterday')
    if (updated >= dayStart(7)) return t('app.chat.lastWeek')
    if (updated >= dayStart(30)) return t('app.chat.lastMonth')
    return new Intl.DateTimeFormat(locale.value, {month: 'long', year: 'numeric'}).format(updated)
}

function onChatSelect(chat: ChatSummary, event: Event) {
    const click = (event as CustomEvent<{ originalEvent?: MouseEvent }>).detail?.originalEvent
    if (click?.metaKey || click?.ctrlKey) showInSidePanel(chat.id)
    else run(() => openInTab(chat.id))
}

// The nav's custom-slot items carry their chat or folder path (typed here; Nuxt UI types custom slots' `item` as `never`).
type ChatNavItem = NavigationMenuChildItem & { chat: ChatSummary }
type FolderNavItem = NavigationMenuChildItem & { path: string }

const chatItem = (chat: ChatSummary): ChatNavItem => ({
    label: chatTitle(chat),
    value: chat.id,
    slot: 'chat',
    chat,
    active: chat.id === activeTabUuid.value,
    class: chat.title ? '' : 'text-muted',
    onSelect: (e: Event) => onChatSelect(chat, e),
})

const newChatItems = computed<NavigationMenuItem[]>(() => [
    {label: t('app.chat.newChat'), icon: 'i-lucide-circle-plus', onSelect: () => newChat()},
])

/** Folders first (by name; each holds its subfolders, then its chats newest first), then loose chats by date. */
const items = computed<NavigationMenuItem[]>(() => {
    if (!index.value) return []
    const top: NavigationMenuItem[] = []
    const folders = new Map<string, NavigationMenuChildItem>()
    // The index lists every parent folder, so sorted paths build top-down.
    for (const path of [...index.value.folders].sort()) {
        const item: FolderNavItem = {
            label: baseName(path),
            value: folderKey(path),
            slot: 'folder',
            path,
            defaultOpen: expanded.value.includes(folderKey(path)),
            children: [],
        }
        const parent = folders.get(parentOf(path))
        if (parent) parent.children?.push(item)
        else top.push(item)
        folders.set(path, item)
    }
    let label = ''
    for (const chat of [...index.value.chats].sort((a, b) => b.updated - a.updated)) {
        const folder = chat.folder ? folders.get(chat.folder) : undefined
        if (folder) {
            folder.children?.push(chatItem(chat))
            continue
        }
        const group = dateLabel(chat.updated)
        if (group !== label) top.push({label: group, type: 'label'})
        label = group
        top.push(chatItem(chat))
    }
    return top
})

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

function chatActions(chat: ChatSummary): DropdownMenuItem[][] {
    const folders = [...(index.value?.folders ?? [])].sort()
    return [
        [
            {label: t('app.chat.openInTab'), icon: 'i-lucide-square-plus', onSelect: () => run(() => openInTab(chat.id))},
            {label: t('app.chat.showInSidePanel'), icon: 'i-lucide-panel-right', onSelect: () => showInSidePanel(chat.id)},
        ],
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

const panelMenu = computed<ContextMenuItem[][]>(() => vault.value === 'unlocked' ? [createItems('')] : [
    createItems(''),
    [{label: t('app.chat.lock'), icon: 'i-lucide-lock', onSelect: () => run(lock)}],
])

const searchOpen = ref(false)
const searchGroups = computed<CommandPaletteGroup[]>(() => [{
    id: 'chats',
    items: (index.value?.chats ?? []).map(chat => ({
        label: chatTitle(chat),
        suffix: chat.folder,
        icon: 'i-lucide-message-square',
        onSelect() {
            searchOpen.value = false
            run(() => openInTab(chat.id))
        },
    })),
}])

defineExpose({openSearch: () => { searchOpen.value = true }})
</script>

<template>
    <div class="h-full min-h-0 flex flex-col">
        <div v-if="locked" class="flex-1 min-h-0 overflow-y-auto flex items-center">
            <ChatVaultForm/>
        </div>
        <template v-else>
            <UNavigationMenu :items="newChatItems" orientation="vertical" class="pb-2"/>
            <UContextMenu :items="panelMenu" size="sm">
                <UScrollArea
                    ref="scrollAreaRef"
                    orientation="vertical"
                    :class="['no-scrollbar flex-1 min-h-0 relative scroll-fade', isScrolled && 'is-scrolled']"
                    data-tauri-drag-region
                >
                    <UAlert v-if="error" class="mt-2" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="$t('app.chat.loadFailed')" :description="error"/>
                    <UEmpty
                        v-else-if="index && !items.length"
                        variant="naked"
                        size="sm"
                        icon="i-lucide-messages-square"
                        :title="$t('app.chat.noChats')"
                        :actions="[{ label: $t('app.chat.newChat'), icon: 'i-lucide-circle-plus', size: 'sm', onClick: () => newChat() }]"
                    />
                    <UNavigationMenu
                        v-else
                        :items
                        orientation="vertical"
                        class="pb-2.5"
                        :ui="{
                            link: 'overflow-hidden pr-7.5',
                            linkTrailing: 'translate-x-full group-hover:translate-x-0 group-has-data-[state=open]:translate-x-0 transition-transform ms-0 absolute inset-e-px'
                        }"
                    >
                        <template #chat-trailing="{ item }: { item: ChatNavItem }">
                            <UDropdownMenu :items="chatActions(item.chat)" :content="{ align: 'end' }" size="sm">
                                <UButton
                                    as="div"
                                    icon="i-lucide-ellipsis"
                                    color="neutral"
                                    variant="link"
                                    size="sm"
                                    class="rounded-[5px] hover:bg-accented/50 focus-visible:bg-accented/50 data-[state=open]:bg-accented/50"
                                    :aria-label="$t('app.chat.actions')"
                                    tabindex="-1"
                                    @click.stop.prevent
                                />
                            </UDropdownMenu>
                        </template>
                        <template #folder-leading="{ item }: { item: FolderNavItem }">
                            <!-- The link is the accordion trigger, so its data-state tells whether the folder is open. -->
                            <span class="inline-flex shrink-0" @click="toggleFolder(item.path)">
                                <UIcon name="i-lucide-folder" class="size-5 group-data-[state=open]:hidden"/>
                                <UIcon name="i-lucide-folder-open" class="size-5 hidden group-data-[state=open]:inline"/>
                            </span>
                        </template>
                        <template #folder-label="{ item }: { item: FolderNavItem }">
                            <span @click="toggleFolder(item.path)">{{ item.label }}</span>
                        </template>
                        <template #folder-trailing="{ item }: { item: FolderNavItem }">
                            <UDropdownMenu :items="folderActions(item.path)" :content="{ align: 'end' }" size="sm">
                                <UButton
                                    as="div"
                                    icon="i-lucide-ellipsis"
                                    color="neutral"
                                    variant="link"
                                    size="sm"
                                    class="rounded-[5px] hover:bg-accented/50 focus-visible:bg-accented/50 data-[state=open]:bg-accented/50"
                                    :aria-label="$t('app.chat.actions')"
                                    tabindex="-1"
                                    @click.stop.prevent
                                />
                            </UDropdownMenu>
                        </template>
                    </UNavigationMenu>
                </UScrollArea>
            </UContextMenu>
        </template>

        <UModal v-model:open="searchOpen">
            <template #content>
                <UCommandPalette :groups="searchGroups" :placeholder="$t('app.chat.searchChats')" close @update:open="searchOpen = $event"/>
            </template>
        </UModal>
    </div>
</template>
