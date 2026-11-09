<script setup lang="ts">
import TabsHeaderComponent from "~/components/TabsHeaderComponent.vue";
import {usePanels} from "~/composables/active/usePanels";
import {useActiveSessions} from "~/composables/active/useActiveSessions";

const $route = useRoute()
const $sesh = useActiveSessions()
const $sessionId = computed<string>(() => $route.params.sessionId as string)
const {sides} = usePanels($sesh.getSession($sessionId))


const panelsCollapsed = computed(() => !sides.value.left.open && !sides.value.right.open)
</script>

<template>
    <UDashboardPanel
        id="content"
        :ui="{
            body: `relative sm:p-0 bg-default border-default overflow-visible ${panelsCollapsed ? 'border-0' : 'border-0 shadow-none shadow-neutral'}`,
            root: `lg:not-last:${(!sides.left.open && !sides.right.open) ? 'border-none' : 'border-r'}`,
        }"
    >
        <template #header>
            <UDashboardNavbar :toggle="false" :ui="{ root: 'border-none h-(--ui-header-height) sm:p-0 p-0 w-full gap-0', center: 'flex w-full h-full p-0 sm:p-0 m-0 sm:m-0 gap-0', left: 'pl-0 gap-0', right: 'pr-0 gap-0' }" data-tauri-drag-region>
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
