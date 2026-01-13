<script setup lang="ts">
import ReferenceLinksListComponent from "~/components/ReferenceLinksListComponent.vue";
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import WritersInfoPanelComponent from "~/components/WritersInfoPanelComponent.vue";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import type {TabsItem} from "@nuxt/ui";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    fileTree,
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    openTab,
} = useActiveTabs($sesh.getSession($sessionId))
const {
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))
const emit = defineEmits<{
    (e: 'to-toc', value: TocEntry): void
}>()

const activeRightPanel = ref('reflinks')
const rightPanelItems: TabsItem[] = [
    {
        value: 'reflinks',
        label: 'Referenced Links',
        icon: 'i-lucide-link'
    },
    {
        value: 'writer',
        label: 'Writer\'s Tools',
        icon: 'i-lucide-pencil'
    },
    {
        value: 'toc',
        label: 'Table of Contents',
        icon: 'i-lucide-table-of-contents'
    }
]

</script>

<template>
    <UDashboardSidebar
        v-if="!rightPanelCollapsed"
        side="right"
        v-model:collapsed="rightPanelCollapsed"
        data-tauri-drag-region
        :min-size="10"
        :max-size="30"
        :default-size="15"
        :collapsed-size="0"
        collapsible
        resizable
        :ui="{
            root: 'border-r-0',
            body: 'pl-1 pr-3',
            header: 'px-2'
        }"
    >
        <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
            <UDashboardResizeHandle
                class="after:absolute after:inset-y-0 after:right-0 after:w-1 after:top-1/2 after:bottom-1/2 after:rounded-lg hover:after:bg-(--ui-border-accented) hover:after:h-20 after:justify-self-center after:items-center transition-all duration-300 after:transition-all after:duration-300"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <SidebarCollapserButton side="right" v-if="!rightPanelCollapsed"/>
            <div class="grow"/>
            <UTabs label-key="title" v-model="activeRightPanel" :content="false" :items="rightPanelItems" size="sm" variant="pill"/>
            <SpaceOnOs detect-os="macos" show-on-os/>
        </template>
        <ScrollAreaRoot class="w-full relative h-full" style="--scrollbar-size: 10px">
            <div :class="`absolute transition-all duration-300 right-0 left-0 top-0 bg-linear-to-t from-transparent to-submuted h-4 w-full z-10 inline-flex justify-start items-center pointer-events-none`">
                <div class="text-sm text-muted text-left select-none">{{ rightPanelItems.find(i => i.value == activeRightPanel)?.label }}</div>
            </div>
            <ScrollAreaViewport class="h-full">
                <div class="w-full">
                    <template v-if="activeRightPanel == 'reflinks'">
                        <ReferenceLinksListComponent class="w-full h-full mt-5"/>
                    </template>
                    <template v-else-if="activeRightPanel == 'writer'">
                        <WritersInfoPanelComponent class="w-full h-full mt-5"/>
                    </template>
                    <template v-else-if="activeRightPanel == 'toc'">
                        <TableOfContentsPanelComponent @to-toc="(entry) => emit('to-toc', entry)" class="w-full h-full mt-5"/>
                    </template>
                </div>
            </ScrollAreaViewport>
            <ScrollAreaScrollbar
                class="select-none touch-none z-20 w-2 m-2 pointer-events-none"
                orientation="vertical"
            >
                <ScrollAreaThumb
                    class="flex-1 bg-accented rounded-lg"
                />
            </ScrollAreaScrollbar>
            <div :class="`absolute transition-all duration-300 right-0 left-0 bottom-0 bg-linear-to-b from-transparent via-submuted to-submuted h-4 w-full z-10 inline-flex justify-end items-center gap-1 pointer-events-none`"/>
        </ScrollAreaRoot>
    </UDashboardSidebar>
</template>

<style scoped>

</style>