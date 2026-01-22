<script setup lang="ts">
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveSessions} from "~/composables/active/useActiveSessions";

const $route = useRoute()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {
    leftPanelCollapsed,
    rightPanelCollapsed
} = useActiveLayouts($sesh.getSession($sessionId))

const panelsCollapsed = computed(() => {
    return $sesh.isSessionWorkspace($sessionId) ? unref(rightPanelCollapsed) && unref(leftPanelCollapsed) : unref(rightPanelCollapsed)
})
</script>

<template>
    <UDashboardPanel
        id="content"
        :ui="{
            body: `relative sm:p-0 bg-default border-default overflow-visible ${panelsCollapsed ? 'border-0' : 'border-0 shadow-none shadow-neutral'}`,
            root: `lg:not-last:border-r`,
        }"
        resizable
    >
        <template #header>
            <UDashboardNavbar :ui="{ root: 'border-b h-(--ui-header-height) sm:p-0 p-0 w-full gap-0', center: 'w-full h-full p-0 sm:p-0 m-0 sm:m-0 gap-0', left: 'pl-0 gap-0', right: 'pr-0 gap-0' }" data-tauri-drag-region>
                <template #default>
                    <TabsHeaderComponent/>
                </template>
            </UDashboardNavbar>
        </template>
        <template #body>
            <slot/>
        </template>
    </UDashboardPanel>
</template>

<style scoped>

</style>