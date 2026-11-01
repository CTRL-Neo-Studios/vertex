<script setup lang="ts">
import type {NavigationMenuItem} from "#ui/components/NavigationMenu.vue";
import {Routes} from "#shared/constants/app";

const {t} = useI18n()

const links = computed(() => [
    {label: t('app.settings.nav.about'), icon: 'i-lucide-info', to: Routes.settings},
    {label: t('app.settings.nav.general'), icon: 'i-lucide-settings', to: `${Routes.settings}/general`},
    {label: t('app.settings.nav.theme'), icon: 'i-lucide-palette', to: `${Routes.settings}/theme`},
    {label: t('app.settings.nav.view'), icon: 'i-lucide-layout-grid', to: `${Routes.settings}/view`},
    {label: t('app.settings.nav.workflows'), icon: 'i-lucide-workflow', to: `${Routes.settings}/workflows`},
] satisfies NavigationMenuItem[])
</script>

<template>
    <div class="w-full h-screen max-h-screen overflow-hidden">
        <div class="w-full h-full grid grid-cols-4">
            <!-- Sidebar -->
            <div class="col-span-1 bg-submuted border-r border-r-default h-full overflow-hidden flex flex-col" data-tauri-drag-region>
                <SpaceOnOs detectOs="macos" showOnOs class="h-(--ui-header-height)"/>
                
                <UContainer class="w-full flex-1 overflow-y-auto">
                    <UNavigationMenu
                        :items="links"
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