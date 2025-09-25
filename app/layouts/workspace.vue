<script setup lang="ts">
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import DashboardLeftPanelSidebar from "~/components/LayoutComponents/DashboardLeftPanelSidebar.vue";

const $route = useRoute()
const $navi = useAppNavigator()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const activeTreeItem = ref()

await until($sessionId).toMatch(v => v != undefined)

const {
    buildIndex,
    startWatcher,
    stopWatcher,
    clearIndex
} = useActiveWorkspaceIndex($sesh.getSession($sessionId))
const {
    activeTabUuid,
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

onBeforeUnmount(async () => {
    clearTabs()
    await stopWatcher()
    clearIndex()
    $sesh.removeSession($sessionId)
})
</script>

<template>
    <UDashboardGroup
        :class="['w-full h-full transition-colors duration-200', leftPanelCollapsed && rightPanelCollapsed ? 'bg-default': 'bg-submuted']"
        unit="rem"
    >
        <DashboardLeftPanelSidebar/>
        <slot/>
    </UDashboardGroup>
</template>

<style>
@reference "~/assets/css/main.css";
:root {
    --ui-header-height: 3rem;
}
</style>