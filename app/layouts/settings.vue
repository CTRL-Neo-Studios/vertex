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
}, {
    label: 'View',
    icon: 'i-lucide-layout-grid',
    to: '/settings/view',
    onSelect: () => {
        open.value = false
    }
},]] satisfies NavigationMenuItem[][]

const groups = computed(() => [])
</script>

<template>
    <div class="w-full h-screen max-h-screen overflow-hidden">
        <div class="w-full h-full grid grid-cols-4">
            <!-- Sidebar -->
            <div class="col-span-1 bg-submuted border-r border-r-default h-full overflow-hidden flex flex-col" data-tauri-drag-region>
                <SpaceOnOs detectOs="macos" showOnOs class="h-(--ui-header-height)"/>
                
                <UContainer class="w-full flex-1 overflow-y-auto">
                    <UDashboardSearchButton class="bg-transparent ring-default w-full mb-4" />

                    <UNavigationMenu
                        :items="links[0]"
                        orientation="vertical"
                        tooltip
                        popover
                    />
                </UContainer>
            </div>
            
            <!-- Content area (non-scrollable container) -->
            <div class="col-span-3 h-screen">
                <slot/>
            </div>
        </div>
    </div>
</template>

<style scoped>

</style>