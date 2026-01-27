<script setup lang="ts">

/**
 * Settings page scroll layout
 * Provides scrollable content area with sticky header
 */

const props = withDefaults(defineProps<{
    title?: string,
}>(), {
    title: 'Settings'
})
</script>

<template>
    <div class="w-full h-screen flex flex-col overflow-hidden">
        <!-- Fixed Header -->
        <div class="shrink-0 border-b border-default bg-default/75 backdrop-blur-lg z-10 w-full">
            <div class="px-6 py-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h1 class="font-semibold">{{ title }}</h1>
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
