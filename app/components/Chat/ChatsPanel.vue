<script setup lang="ts">
import type {CommandPaletteGroup, NavigationMenuChildItem, NavigationMenuItem} from "@nuxt/ui";
import type {ChatHit, ChatSummary} from "#shared/types/app/chats";
import {StateKey} from "#shared/constants/app";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useChats} from "~/composables/ai/useChats";
import {useChatActions} from "~/composables/ai/useChatActions";
import ChatVaultForm from "~/components/Chat/ChatVaultForm.vue";

/**
 * The left sidebar's Chats view, after the Nuxt UI chat template: a New chat item, then the list (folders first,
 * then loose chats grouped by date) with a hover menu per item, and the chat search.
 */
const {t, locale} = useI18n()
const $route = useRoute()
const sessionId = computed(() => $route.params.sessionId as string)
const session = useActiveSessions().getSession(sessionId)
const {activeTabUuid} = useActiveTabs(session)
const {storage, vault, index, error, refresh, search, showInSidePanel, openInTab} = useChats(session)
const {run, chatTitle, newChat, panelMenu, chatActions, folderActions} = useChatActions(session)

watch(storage, () => refresh(), {immediate: true})

const expanded = useState<string[]>(StateKey.chatsExpanded(sessionId.value), () => [])

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)

const locked = computed(() => vault.value === 'none' || vault.value === 'locked')
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const parentOf = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const folderKey = (path: string) => `folder:${path}`

// Nested accordions keep their open state to themselves, so it's read back from the folder's trigger after each click on
// it (Enter and Space on the trigger button are clicks too).
async function onNavClick(event: MouseEvent) {
    const link = (event.target as Element).closest('[data-slot="link"]')
    const path = link?.querySelector<HTMLElement>('[data-folder]')?.dataset.folder
    if (path === undefined) return
    await nextTick()
    const key = folderKey(path)
    const open = link!.getAttribute('data-state') === 'open'
    expanded.value = open ? [...new Set([...expanded.value, key])] : expanded.value.filter(k => k !== key)
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

const searchOpen = ref(false)
const searchTerm = ref('')
const hits = shallowRef<ChatHit[]>([])
let searchRun = 0
// Titles are filtered by the palette; message text is searched in Rust (it holds the decrypted chats).
watchDebounced(searchTerm, async term => {
    const run = ++searchRun
    const found = term.trim().length < 2 ? [] : await search(term).catch(() => [])
    if (run === searchRun) hits.value = found
}, {debounce: 250})
watch(searchOpen, open => { if (!open) searchTerm.value = '' })

function openFromSearch(id: string) {
    searchOpen.value = false
    run(() => openInTab(id))
}

const searchGroups = computed<CommandPaletteGroup[]>(() => {
    const chats = index.value?.chats ?? []
    const byId = new Map(chats.map(c => [c.id, c]))
    return [
        {
            id: 'chats',
            label: t('app.chat.searchTitles'),
            items: chats.map(chat => ({label: chatTitle(chat), suffix: chat.folder, icon: 'i-lucide-message-square', onSelect: () => openFromSearch(chat.id)})),
        },
        {
            id: 'messages',
            label: t('app.chat.searchMessages'),
            ignoreFilter: true,
            items: hits.value.flatMap(hit => {
                const chat = byId.get(hit.id)
                return chat ? [{label: chatTitle(chat), description: hit.snippet, icon: 'i-lucide-text-search', onSelect: () => openFromSearch(hit.id)}] : []
            }),
        },
    ]
})

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
                        @click="onNavClick"
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
                            <span class="inline-flex shrink-0" :data-folder="item.path">
                                <UIcon name="i-lucide-folder" class="size-5 group-data-[state=open]:hidden"/>
                                <UIcon name="i-lucide-folder-open" class="size-5 hidden group-data-[state=open]:inline"/>
                            </span>
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
                <UCommandPalette v-model:search-term="searchTerm" :groups="searchGroups" :placeholder="$t('app.chat.searchChats')" close @update:open="searchOpen = $event"/>
            </template>
        </UModal>
    </div>
</template>
