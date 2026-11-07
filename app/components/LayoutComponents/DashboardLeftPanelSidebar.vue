<script setup lang="ts">
import {StateKey} from "#shared/constants/app";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import FileTreeComponent from "~/components/FileTreeComponent.vue";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import type {ContextMenuItem, NavigationMenuItem} from "@nuxt/ui";
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import ChatsPanel from "~/components/Chat/ChatsPanel.vue";
import {computed} from "vue";
import {useDebounceFn, useScroll} from "@vueuse/core";
import {useChats} from "~/composables/ai/useChats";

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)

const { t } = useI18n()

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $ovl = useOverlay()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const $index = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {fileTree} = $index
const {openTab, activeTabUuid} = useActiveTabs($sesh.getSession($sessionId))
const {
    leftPanelCollapsed,
    leftPanelView
} = useActiveLayouts($sesh.getSession($sessionId))
const chatsPanel = useTemplateRef('chatsPanel')
const fileSearchOpen = useState<boolean>(StateKey.fileSearchOpen($sessionId.value), () => false)
const navItems = computed<NavigationMenuItem[]>(() => [
    {label: t('app.chat.files'), icon: 'i-lucide-files', active: leftPanelView.value === 'files', onSelect: () => { leftPanelView.value = 'files' }},
    {label: t('app.chat.chats'), icon: 'i-lucide-messages-square', active: leftPanelView.value === 'chats', onSelect: () => { leftPanelView.value = 'chats' }},
    {
        label: t('app.chat.search'),
        icon: 'i-lucide-search',
        kbds: leftPanelView.value === 'files' ? ['meta', 'p'] : [],
        onSelect() {
            if (leftPanelView.value === 'files') fileSearchOpen.value = true
            else chatsPanel.value?.openSearch()
        },
    },
])
const activeTreeItem = useState<string>(StateKey.activeTreeItem(unref($sessionId)), () => '')
const newFileModal = $ovl.create(NewFileModal)

watch(activeTabUuid, (newValue) => {
    activeTreeItem.value = newValue || ''
}, {deep: false})

async function onClickFile(item: Partial<UITreeNode>) {
    if (!item || !item.uuid) return;
    const tab = openTab(item.uuid)
    await $navi.toWorkspaceTab($sesh.getSession($sessionId)?.uuid || '', tab)
}

// Chats synced in from elsewhere: one refresh per burst of watcher events. Here because this sidebar lives as long as the session.
const {syncExternal} = useChats($sesh.getSession($sessionId))
const changedChats = new Set<string>()
const flushChats = useDebounceFn(() => {
    const paths = [...changedChats]
    changedChats.clear()
    return syncExternal(paths)
}, 500)
const offIndex = $index.on((event) => {
    if (event.type !== 'chats') return
    changedChats.add(event.path)
    void flushChats()
})
onBeforeUnmount(offIndex)

const contextMenuItems = ref<ContextMenuItem[][]>([
    [
        {
            label: t('app.editor.ui.filetree.newMarkdownFile'),
            icon: 'i-lucide-file-plus',
            onSelect() {
                newFileModal.open({
                    modalTitle: t('app.editor.ui.filetree.newMarkdownFile'),
                    asFolder: false,
                    asLevel: 'same',
                    fileExt: 'md'
                })
            }
        },
        {
            label: t('app.editor.ui.filetree.newFolder'),
            icon: 'i-lucide-folder-dot',
            onSelect() {
                newFileModal.open({
                    modalTitle: t('app.editor.ui.filetree.newFolder'),
                    asFolder: true,
                    asLevel: 'same'
                })
            },
        },
        {
            label: t('app.editor.ui.filetree.newWorkflow'),
            icon: 'i-lucide-workflow',
            onSelect() {
                newFileModal.open({
                    modalTitle: t('app.editor.ui.filetree.newWorkflow'),
                    asFolder: false,
                    asLevel: 'same',
                    fileExt: 'workflow'
                })
            }
        }
    ]
])
</script>

<template>
    <!-- UDashboardSidebar, not UDashboardPanel: a panel goes full-width below `lg`. `root: flex` undoes the sidebar's
    own `hidden lg:flex`; without a toggle its mobile menu never opens. -->
    <UDashboardSidebar
        v-if="!leftPanelCollapsed"
        side="left"
        data-tauri-drag-region
        :min-size="10"
        :max-size="30"
        :default-size="18"
        :toggle="false"
        resizable
        :ui="{
            root: 'flex bg-submuted',
            header: 'contents',
            body: 'px-2 py-0 gap-0'
        }"
    >
        <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
            <UDashboardResizeHandle
                class="block after:absolute after:inset-y-0 after:right-0 after:w-px hover:after:cursor-ew-resize after:cursor-ew-resize cursor-ew-resize after:top-0 after:bottom-0 hover:after:bg-primary hover:after:h-full after:justify-self-center after:items-center transition-all duration-300 after:transition-all after:duration-300"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <UDashboardNavbar :toggle="false" :ui="{ root: 'border-b border-none h-(--ui-header-height) sm:px-1 p-2 w-full', center: 'flex w-full', left: 'pl-0', right: 'pr-0' }" data-tauri-drag-region>
                <template #default>
                    <SpaceOnOs detect-os="macos" :show-on-os="true" data-tauri-drag-region/>
                    <div class="grow" data-tauri-drag-region/>
                    <SidebarCollapserButton side="left"/>
                </template>
            </UDashboardNavbar>
            <UNavigationMenu :items="navItems" orientation="vertical" class="px-2 pb-2">
                <template #item-trailing="{ item }">
                    <div v-if="item.kbds?.length" class="flex items-center gap-px opacity-0 group-hover:opacity-100 transition-opacity">
                        <UKbd v-for="kbd in item.kbds" :key="kbd" :value="kbd" size="sm" variant="soft" class="bg-accented/50"/>
                    </div>
                </template>
            </UNavigationMenu>
        </template>
		<template #default>
			<UContextMenu v-if="leftPanelView === 'files'" :items="contextMenuItems" size="sm">
				<UScrollArea
					ref="scrollAreaRef"
					orientation="vertical"
					:class="['no-scrollbar h-full relative scroll-fade', isScrolled && 'is-scrolled']"
					data-tauri-drag-region
				>
					<FileTreeComponent class="py-2.5" :sessionId="$sessionId" v-model="activeTreeItem" :nodes="fileTree" @file-click="onClickFile"/>
				</UScrollArea>
			</UContextMenu>
			<ChatsPanel v-else ref="chatsPanel"/>
		</template>
    </UDashboardSidebar>
</template>
