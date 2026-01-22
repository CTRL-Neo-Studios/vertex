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

/*
Note to future self:
Stop messing around with the sidebar constantly going into mobile-drawer mode. Currently there isn't an option that does that for the dashboard sidebar,
and the UDashboardPanel is used as a lesser alternative that requires more effort to the styling. This, complicates things a lot.
 */

</script>

<template>
    <UDashboardPanel
        v-if="!rightPanelCollapsed"
        side="right"
        data-tauri-drag-region
        :min-size="10"
        :max-size="30"
        :default-size="15"
        :collapsed-size="0"
        collapsible
        resizable
        :ui="{
            root: 'border-l-0 border-none bg-submuted',
            body: 'px-2 sm:px-2 sm:py-0 border-l-0'
        }"
    >
        <template #resize-handle="{ onMouseDown, onTouchStart, onDoubleClick }">
            <UDashboardResizeHandle
                class="after:absolute after:inset-y-0 after:left-0 after:w-1 after:top-1/2 after:bottom-1/2 after:rounded-lg hover:after:bg-(--ui-border-accented) hover:after:h-20 after:justify-self-center after:items-center transition-all duration-300 after:transition-all after:duration-300"
                @mousedown="onMouseDown"
                @touchstart="onTouchStart"
                @dblclick="onDoubleClick"
            />
        </template>
        <template #header>
            <UDashboardNavbar :ui="{ root: 'h-(--ui-header-height) sm:px-1 w-full flex border-b border-default', center: 'w-full p-0', left: 'pl-0', right: 'pr-0' }" data-tauri-drag-region>
                <div class="flex flex-col items-center justify-center">
                    <SidebarCollapserButton side="right"/>
                </div>
                <div class="grow"/>
                <UTabs label-key="title" v-model="activeRightPanel" :content="false" :items="rightPanelItems" size="xs" variant="pill"/>
            </UDashboardNavbar>
        </template>
        <template #body>
            <UScrollArea orientation="vertical" class="no-scrollbar" data-tauri-drag-region>
                <div class="w-full">
                    <template v-if="activeRightPanel == 'reflinks'">
                        <ReferenceLinksListComponent class="w-full h-full mt-2"/>
                    </template>
                    <template v-else-if="activeRightPanel == 'writer'">
                        <WritersInfoPanelComponent class="w-full h-full mt-2"/>
                    </template>
                    <template v-else-if="activeRightPanel == 'toc'">
                        <TableOfContentsPanelComponent @to-toc="(entry) => emit('to-toc', entry)" class="w-full h-full mt-2"/>
                    </template>
                </div>
            </UScrollArea>
        </template>
    </UDashboardPanel>
</template>

<style scoped>

</style>