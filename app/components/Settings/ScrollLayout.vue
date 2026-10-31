<script setup lang="ts">

/**
 * Settings page scroll layout
 * Provides scrollable content area with sticky header
 */

defineProps<{
    title?: string,
}>()
</script>

<template>
    <div class="w-full h-screen flex flex-col overflow-hidden">
        <!-- Fixed Header -->
        <div class="shrink-0 border-b border-default bg-default/75 backdrop-blur-lg z-10 w-full" data-tauri-drag-region>
            <div class="px-6 py-4" data-tauri-drag-region>
                <div class="flex items-center justify-between" data-tauri-drag-region>
                    <div data-tauri-drag-region>
                        <h1 class="font-semibold select-none">{{ title ?? $t('app.settings.title') }}</h1>
                    </div>
                    <div class="flex items-center gap-2">
                        <slot name="header-trailing"/>
                    </div>
                </div>
            </div>
        </div>

        <!-- Scrollable Content (takes remaining height) -->
        <div class="flex-1 overflow-hidden">
            <UScrollArea class="h-full w-full p-6" orientation="vertical">
                <slot/>
            </UScrollArea>
        </div>
    </div>
</template>
