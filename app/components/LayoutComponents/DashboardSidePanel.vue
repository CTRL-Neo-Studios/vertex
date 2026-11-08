<script setup lang="ts">
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";
import type {PanelSide} from "#shared/types/app/settings";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import WorkspaceSwitcher from "~/components/WorkspaceSwitcher.vue";
import SidebarCollapserButton from "~/components/SidebarCollapserButton.vue";
import PanelButtons from "~/components/LayoutComponents/PanelButtons.vue";
import PanelFilesView from "~/components/LayoutComponents/PanelFilesView.vue";
import ChatsPanel from "~/components/Chat/ChatsPanel.vue";
import ChatView from "~/components/Chat/ChatView.vue";
import ReferenceForelinksListComponent from "~/components/ReferenceForelinksListComponent.vue";
import ReferenceBacklinksListComponent from "~/components/ReferenceBacklinksListComponent.vue";
import WritersInfoPanelComponent from "~/components/WritersInfoPanelComponent.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {usePanels} from "~/composables/active/usePanels";
import {PANEL_DRAG, usePanelDrag} from "~/composables/utility/usePanelDrag";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {PANEL_VIEW_INFO} from "~/utils/panelViews";

/**
 * One side panel (left or right): the view its side shows (see `usePanels`). With the `buttons` style it holds that
 * side's view buttons (a list on the left, icons in the header on the right); with `strip`, the strip at the window's
 * edge does, and the header shows the view's name. The left one's header holds the workspace switcher.
 */
const props = defineProps<{ side: PanelSide }>()
const emit = defineEmits<{ 'to-toc': [value: Heading] }>()

const {t} = useI18n()
const $qt = useQuickToasts()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const panels = usePanels(session)
const {sidePanelChatId, createChat, showInSidePanel} = useChats(session)
// One drag state for the window, so a slot can go from one list to another.
const drag = inject(PANEL_DRAG, () => usePanelDrag(panels.move), true)

const state = computed(() => panels.sides.value[props.side])
const strip = computed(() => panels.style.value === 'strip')
const searchKbds = computed(() => state.value.active === 'chats' ? undefined : {search: ['meta', 'p']})

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)

async function newSidePanelChat() {
    try {
        showInSidePanel((await createChat()).id)
    } catch (e) {
        $qt.error(t('app.chat.actionFailed'), e instanceof Error ? e.message : String(e))
    }
}
</script>

<template>
    <!-- UDashboardSidebar, not UDashboardPanel: a panel goes full-width below `lg`. `root: flex` undoes the sidebar's
    own `hidden lg:flex`; without a toggle its mobile menu never opens. Not `collapsible`: the collapsed state is ours.
    `id` keeps its resized width (Nuxt UI's cookie) the same in every window. -->
    <UDashboardSidebar
        v-if="state.open"
        :id="side"
        :side
        data-tauri-drag-region
        :min-size="12"
        :max-size="30"
        :default-size="18"
        :toggle="false"
        resizable
        :ui="{ root: 'flex bg-submuted', header: 'contents', body: 'px-2 py-0 gap-0' }"
    >
        <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
            <UDashboardResizeHandle
                :class="['block after:absolute after:inset-y-0 after:w-px hover:after:cursor-ew-resize after:cursor-ew-resize cursor-ew-resize hover:after:bg-primary transition-all duration-300 after:transition-all after:duration-300', side === 'left' ? 'after:right-0' : 'after:left-0']"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <UDashboardNavbar :toggle="false" :ui="{ root: 'border-none h-(--ui-header-height) px-2 sm:px-2 gap-0 w-full', center: 'flex flex-1 min-w-0 items-center gap-1', left: 'hidden', right: 'hidden' }" data-tauri-drag-region>
                <template v-if="side === 'left'">
                    <!-- The traffic lights; a strip already covers part of them. -->
                    <SpaceOnOs detect-os="macos" :show-on-os="true" :class="strip ? 'w-6' : ''" data-tauri-drag-region/>
                    <WorkspaceSwitcher />
                    <div class="grow" data-tauri-drag-region/>
                    <SidebarCollapserButton v-if="!strip" side="left"/>
                </template>
                <template v-else>
                    <SidebarCollapserButton v-if="!strip" side="right"/>
                    <span v-else class="ps-1 text-sm font-medium text-muted truncate" data-tauri-drag-region>{{ t(PANEL_VIEW_INFO[state.active!].label) }}</span>
                    <div class="grow" data-tauri-drag-region/>
                    <PanelButtons
                        v-if="!strip"
                        list="right"
                        variant="pills"
                        :slots="state.slots"
                        :end="panels.layout.value.right.length"
                        :active="state.active"
                        open
                        :drag
                        :menu="index => panels.slotMenu('right', index)"
                        :kbds="searchKbds"
                        @select="id => panels.select('right', id)"
                    />
                </template>
            </UDashboardNavbar>
            <PanelButtons
                v-if="side === 'left' && !strip"
                class="px-2 pb-2"
                list="left"
                variant="list"
                :slots="state.slots"
                :end="panels.layout.value.left.length"
                :active="state.active"
                open
                :drag
                :menu="index => panels.slotMenu('left', index)"
                :kbds="searchKbds"
                @select="id => panels.select('left', id)"
            />
            <div v-else-if="side === 'left'" class="px-3 pb-1 text-xs font-medium text-muted truncate select-none" data-tauri-drag-region>{{ t(PANEL_VIEW_INFO[state.active!].label) }}</div>
        </template>
        <template #default>
            <PanelFilesView v-if="state.active === 'files'"/>
            <ChatsPanel v-else-if="state.active === 'chats'"/>
            <template v-else-if="state.active === 'chat'">
                <!-- `min-h-0` with the chat's `h-full`, so the messages scroll inside the panel and the prompt stays at the bottom. -->
                <div v-if="sidePanelChatId" class="relative flex-1 min-h-0">
                    <ChatView :key="sidePanelChatId" :chat-id="sidePanelChatId" in-side-panel/>
                </div>
                <UEmpty
                    v-else
                    class="my-auto"
                    variant="naked"
                    size="sm"
                    icon="i-lucide-message-square"
                    :title="$t('app.chat.noSidePanelChat')"
                    :actions="[{ label: $t('app.chat.newChat'), icon: 'i-lucide-message-square-plus', size: 'sm', onClick: newSidePanelChat }]"
                />
            </template>
            <UScrollArea
                v-else
                ref="scrollAreaRef"
                orientation="vertical"
                :class="['no-scrollbar h-full relative scroll-fade', isScrolled && 'is-scrolled']"
                data-tauri-drag-region
            >
                <div class="w-full">
                    <ReferenceForelinksListComponent v-if="state.active === 'forelinks'" class="w-full h-full mt-2"/>
                    <ReferenceBacklinksListComponent v-else-if="state.active === 'backlinks'" class="w-full h-full mt-2"/>
                    <WritersInfoPanelComponent v-else-if="state.active === 'writersTools'" class="w-full h-full mt-2"/>
                    <TableOfContentsPanelComponent v-else-if="state.active === 'toc'" class="w-full h-full mt-2" @to-toc="(entry: Heading) => emit('to-toc', entry)"/>
                </div>
            </UScrollArea>
        </template>
    </UDashboardSidebar>
</template>
