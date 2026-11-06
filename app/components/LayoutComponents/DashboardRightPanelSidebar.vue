<script setup lang="ts">
import ReferenceForelinksListComponent from "~/components/ReferenceForelinksListComponent.vue";
import WritersInfoPanelComponent from "~/components/WritersInfoPanelComponent.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import type {TabsItem} from "@nuxt/ui";
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";
import ReferenceBacklinksListComponent from "~/components/ReferenceBacklinksListComponent.vue";
import {computed} from "vue";
import {useScroll} from "@vueuse/core";
import {isBasesFile} from "#shared/utils/fs/filenames";
import {useChats} from "~/composables/ai/useChats";
import ChatView from "~/components/Chat/ChatView.vue";
import useQuickToasts from "~/composables/utility/useQuickToasts";

const { t } = useI18n()
const $qt = useQuickToasts()

const $route = useRoute()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const {
    getFileByUuid
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    rightPanelCollapsed,
    rightPanelView
} = useActiveLayouts($sesh.getSession($sessionId))
const {root: chatsRoot, sidePanelChatId, createChat, showInSidePanel} = useChats($sesh.getSession($sessionId))
const emit = defineEmits<{
    (e: 'to-toc', value: Heading): void
}>()
const isBases = computed(() => isBasesFile(getFileByUuid($tabId)?.fileExt || ''))

const scrollAreaRef = useTemplateRef<{ $el: HTMLElement }>('scrollAreaRef')
const {y: scrollY} = useScroll(() => scrollAreaRef.value?.$el)
const isScrolled = computed(() => scrollY.value > 2)

const chatItem = computed<TabsItem>(() => ({
    value: '4',
    label: t('app.chat.chat'),
    icon: 'i-lucide-message-square'
}))
const rightPanelItems = computed<TabsItem[]>(() => [
    {
        value: '0',
        label: t('app.editor.ui.forelinks'),
        icon: 'i-lucide-square-arrow-out-up-right'
    },
    {
        value: '1',
        label: t('app.editor.ui.backlinks'),
        icon: 'i-lucide-square-arrow-out-down-left'
    },
    {
        value: '2',
        label: t('app.editor.ui.functions.writersTools'),
        icon: 'i-lucide-pencil'
    },
    {
        value: '3',
        label: t('app.editor.ui.functions.tableOfContents'),
        icon: 'i-lucide-table-of-contents'
    },
    // Chats exist only in a workspace.
    ...(chatsRoot.value ? [chatItem.value] : [])
])
// Bases files keep only the chat.
const basesPanelItems = computed<TabsItem[]>(() => chatsRoot.value ? [chatItem.value] : [{value: ''}])
const tabItems = computed(() => unref(isBases) ? unref(basesPanelItems) : unref(rightPanelItems))

async function newSidePanelChat() {
    try {
        showInSidePanel((await createChat()).id)
    } catch (e) {
        $qt.error(t('app.chat.actionFailed'), e instanceof Error ? e.message : String(e))
    }
}

watch($tabId, () => {
    if (unref(isBases) && rightPanelView.value !== '4')
        rightPanelView.value = "0"
})

</script>

<template>
    <!-- See DashboardLeftPanelSidebar for why a sidebar. Not `collapsible`: a drag-collapse would hide the collapser
    button, which lives in this header; rightPanelCollapsed does the collapsing. -->
    <UDashboardSidebar
        v-if="!rightPanelCollapsed"
        side="right"
        data-tauri-drag-region
        :min-size="10"
        :max-size="30"
        :default-size="15"
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
                class="block after:absolute after:inset-y-0 after:left-0 after:w-px hover:after:cursor-ew-resize after:cursor-ew-resize cursor-ew-resize after:top-0 after:bottom-0 hover:after:bg-primary hover:after:h-full after:justify-self-center after:items-center transition-all duration-300 after:transition-all after:duration-300"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <UDashboardNavbar :toggle="false" :ui="{ root: 'h-(--ui-header-height) sm:px-1 w-full flex border-none', center: 'flex w-full p-0', left: 'pl-0', right: 'pr-0' }" data-tauri-drag-region>
                <div class="flex flex-col items-center justify-center">
                    <SidebarCollapserButton side="right"/>
                </div>
                <div class="grow"/>
                <UTabs label-key="title" v-model="rightPanelView" :content="false" :items="tabItems" size="xs" variant="pill"/>
            </UDashboardNavbar>
        </template>
        <template #default>
            <template v-if="rightPanelView == '4' && chatsRoot">
                <!-- Absolute, so the messages scroll inside the panel and the prompt stays at the bottom. -->
                <div v-if="sidePanelChatId" class="relative flex-1 min-h-0">
                    <ChatView :key="sidePanelChatId" class="absolute inset-0" :chat-id="sidePanelChatId" in-side-panel/>
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
                    <template v-if="!isBases">
                        <template v-if="rightPanelView == '0'">
                            <ReferenceForelinksListComponent class="w-full h-full mt-2"/>
                        </template>
                        <template v-else-if="rightPanelView == '1'">
                            <ReferenceBacklinksListComponent class="w-full h-full mt-2"/>
                        </template>
                        <template v-else-if="rightPanelView == '2'">
                            <WritersInfoPanelComponent class="w-full h-full mt-2"/>
                        </template>
                        <template v-else-if="rightPanelView == '3'">
                            <TableOfContentsPanelComponent @to-toc="(entry) => emit('to-toc', entry)" class="w-full h-full mt-2"/>
                        </template>
                    </template>
                    <template v-else>

                    </template>
                </div>
            </UScrollArea>
        </template>
    </UDashboardSidebar>
</template>