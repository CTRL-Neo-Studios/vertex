<script setup lang="ts">
import type {NavigationMenuItem} from "#ui/components/NavigationMenu.vue";
import {useAppSettings} from "~/composables/app/useAppSettings";

const $route = useRoute()
const $settings = useAppSettings()

const open = ref(false)

const links = [[{
    label: 'About',
    icon: 'i-lucide-info',
    to: '/settings',
    onSelect: () => {
        open.value = false
    }
}, {
    label: 'Theme',
    icon: 'i-lucide-palette',
    to: '/settings/theme',
    onSelect: () => {
        open.value = false
    }
},]] satisfies NavigationMenuItem[][]

const groups = computed(() => [])
</script>

<template>
    <UDashboardGroup>
        <UDashboardSidebar
            id="default"
            v-model:open="open"
            collapsible
            resizable
            class="bg-elevated/25"
            :ui="{ footer: 'lg:border-t lg:border-default' }"
        >
            <template #header>
                <SpaceOnOs detectOs="macos" :showOnOs="true"/>
            </template>

            <template #default="{ collapsed }">
                <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

                <UNavigationMenu
                    :collapsed="collapsed"
                    :items="links[0]"
                    orientation="vertical"
                    tooltip
                    popover
                />
            </template>

            <template #footer="{ collapsed }">
            </template>
        </UDashboardSidebar>
    </UDashboardGroup>
</template>

<style scoped>

</style>