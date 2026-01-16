<script setup lang="ts">
import SpaceOnOs from "~/components/SpaceOnOs.vue";
import FileTreeComponent from "~/components/FileTreeComponent.vue";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import useUuid from "~/composables/utility/useUuid";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    fileTree,
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    isTabOpened,
    openTab,
    closeTab,
    tabs,
    activeTabUuid,
    setActiveTab,
    getActiveTab,
    clearTabs
} = useActiveTabs($sesh.getSession($sessionId))
const {
    leftPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))
const activeTreeItem = useState<string>(`active.workspace.active-tree-item-${unref($sessionId) ?? useUuid()}`, () => '')

watch(activeTabUuid, (newValue) => {
    activeTreeItem.value = newValue
}, {deep: false})

async function onClickFile(item: UITreeNode) {
    const tab = openTab(item.uuid)
    await $navi.toWorkspaceTab($sesh.getSession($sessionId)?.uuid || '', tab)
}
</script>

<template>
    <UDashboardPanel
        v-if="!leftPanelCollapsed"
        side="left"
        data-tauri-drag-region
        :min-size="10"
        :max-size="30"
        :default-size="15"
        :collapsed-size="0"
        resizable
        :ui="{
            root: 'border-r-0 border-none',
            body: 'px-2 sm:px-2 sm:py-0 border-r-0'
        }"
        class="border-r-0"
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
            <UDashboardNavbar :ui="{ root: 'border-b-0 h-(--ui-header-height) sm:px-0 p-2 w-full', center: 'w-full', left: 'pl-2.5', right: 'pr-2.5' }" data-tauri-drag-region>
                <template #default>
                    <SpaceOnOs detect-os="macos" :show-on-os="false"/>
                    <div class="grow"/>
                    <SidebarCollapserButton side="left"/>
                </template>
            </UDashboardNavbar>
        </template>
        <template #body>
<!--            <ScrollAreaRoot class="w-full relative h-full" style="&#45;&#45;scrollbar-size: 10px">-->
<!--                <div :class="`absolute transition-all duration-300 right-0 left-0 top-0 bg-linear-to-t from-transparent to-submuted h-4 w-full z-10 inline-flex justify-start items-center pointer-events-none`"/>-->
<!--                <ScrollAreaViewport class="h-full" data-tauri-drag-region>-->
<!--                    <div class="w-full">-->
<!--                        -->
<!--                    </div>-->
<!--                </ScrollAreaViewport>-->
<!--                <ScrollAreaScrollbar-->
<!--                    class="select-none touch-none z-20 w-2 m-2 pointer-events-none"-->
<!--                    orientation="vertical"-->
<!--                >-->
<!--                    <ScrollAreaThumb-->
<!--                        class="flex-1 bg-accented rounded-lg"-->
<!--                    />-->
<!--                </ScrollAreaScrollbar>-->
<!--                <div :class="`absolute transition-all duration-300 right-0 left-0 bottom-0 bg-linear-to-b from-transparent via-submuted to-submuted h-4 w-full z-10 inline-flex justify-end items-center gap-1 pointer-events-none`"/>-->
<!--            </ScrollAreaRoot>-->
            <UScrollArea orientation="vertical" class="no-scrollbar" data-tauri-drag-region>
                <FileTreeComponent :sessionId="$sessionId" v-model="activeTreeItem" :nodes="fileTree" @file-click="onClickFile"/>
            </UScrollArea>
        </template>
    </UDashboardPanel>
</template>

<style scoped>

</style>