<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {type TreeItem} from "@nuxt/ui";
import FileTreeComponent from "~/components/FileTreeComponent.vue";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import type {UITreeNode} from "#shared/types/active/workspace";
import {useAppNavigator} from "~/composables/app/useAppNavigator";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)

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

onMounted(async () => {
    if (!unref($sessionId))
        await until($sessionId).toMatch(v => v != undefined)
    await buildIndex($sesh.getSession($sessionId)?.rootPath || '')
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
    <UDashboardGroup class="bg-muted/50 w-full h-full">
        <UDashboardSidebar resizable :ui="{root: 'border-r-none'}">
            <FileTreeComponent :nodes="fileTree" @file-click="onClickFile"/>
        </UDashboardSidebar>
        <UDashboardPanel class="bg-default" resizable>
            <slot/>
        </UDashboardPanel>
    </UDashboardGroup>
</template>

<style scoped>

</style>