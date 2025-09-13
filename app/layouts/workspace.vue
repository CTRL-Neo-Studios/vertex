<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import FileTreeComponent from "~/components/FileTreeComponent.vue";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const activeTreeItem = ref<string | null>()

await until($sessionId).toMatch(v => v != undefined)

const {
    buildIndex,
    fileIndex,
    fileTree,
    getFileByUuid,
    startWatcher,
    stopWatcher,
    clearIndex
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
    leftPanelCollapsed,
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))

watch(activeTabUuid, (newValue) => {
    activeTreeItem.value = newValue
}, {deep: false})

onMounted(async () => {
    if (!unref($sessionId))
        await until($sessionId).toMatch(v => v != undefined)
    const rootPath = $sesh.getSession($sessionId)?.rootPath
    if(!rootPath) await $navi.toHome()

    await buildIndex(rootPath || '')
    await startWatcher(rootPath || '')
})

async function onClickFile(item: UITreeNode) {
    const tab = openTab(item.uuid)
    await $navi.toWorkspaceTab($sesh.getSession($sessionId)?.uuid || '', tab)
}

onBeforeUnmount(async () => {
    clearTabs()
    await stopWatcher()
    clearIndex()
    $sesh.removeSession($sessionId)
})
</script>

<template>
    <UDashboardGroup
        :class="['w-full h-full', leftPanelCollapsed && rightPanelCollapsed ? 'bg-default': 'bg-muted/50']"
        unit="rem"
    >
        <UDashboardSidebar
            v-if="!leftPanelCollapsed"
            side="left"
            v-model:collapsed="leftPanelCollapsed"
            data-tauri-drag-region
            :min-size="10"
            :max-size="30"
            :default-size="15"
            :collapsed-size="0"
            collapsible
            resizable
            :ui="{
                root: 'border-r-0',
                body: 'px-2',
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
                <div class="flex-grow">

                </div>
                <SidebarCollapserButton side="left"/>
            </template>
            <FileTreeComponent v-model="activeTreeItem" :nodes="fileTree" @file-click="onClickFile"/>
        </UDashboardSidebar>
        <UDashboardPanel id="content" :ui="{
            body: `relative sm:p-0 bg-default rounded-lg border-default overflow-visible mb-2.5 mx-2.5 ${leftPanelCollapsed && rightPanelCollapsed ? 'border-0' : 'border'}`,
            root: `lg:not-last:border-r-0`
        }">
            <template #header>
                <UDashboardNavbar :ui="{ root: 'border-b-0 h-(--ui-header-height) sm:px-0 p-2 w-full', center: 'w-full', left: 'pl-2.5', right: 'pr-2.5' }" data-tauri-drag-region>
                    <template #left>
                        <SidebarCollapserButton side="left" v-if="leftPanelCollapsed"/>
                    </template>
                    <template #default>
                        <TabsHeaderComponent class="w-full"/>
                    </template>
                    <template #right>
                        <SidebarCollapserButton side="right" v-if="rightPanelCollapsed"/>
                    </template>
                </UDashboardNavbar>
            </template>
            <template #body>
                <slot/>
            </template>
        </UDashboardPanel>
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
                body: 'px-2',
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
            </template>
        </UDashboardSidebar>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>