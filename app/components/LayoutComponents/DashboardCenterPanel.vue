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
</script>

<template>
    <UDashboardPanel id="content" :ui="{
            body: `relative sm:p-0 bg-default rounded-xl border-default overflow-visible mb-2.5 mx-2.5 shadow-lg shadow-neutral ${leftPanelCollapsed && rightPanelCollapsed ? 'border-0' : 'border'}`,
            root: `lg:not-last:border-r-0`
        }">
        <template #header>
            <UDashboardNavbar :ui="{ root: 'border-b-0 h-(--ui-header-height) sm:px-0 p-2 w-full', center: 'w-full', left: 'pl-2.5', right: 'pr-2.5' }" data-tauri-drag-region>
                <template #default>
                    <TabsHeaderComponent class="w-full"/>
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