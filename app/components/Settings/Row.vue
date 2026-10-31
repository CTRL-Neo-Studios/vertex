<script setup lang="ts">
/** One setting: label and description on the left, its control on the right. */
defineProps<{
    label: string
    description?: string
    /** Replaces the description, in the error color. */
    error?: string
}>()
</script>

<template>
    <div class="flex items-center gap-4 px-4 py-2.5 min-h-12">
        <div class="flex-1 min-w-0">
            <div class="text-sm text-default">{{ label }}</div>
            <div v-if="error" class="text-xs text-error">{{ error }}</div>
            <div v-else-if="description" class="text-xs text-muted">{{ description }}</div>
        </div>
        <div class="shrink-0 flex items-center gap-2">
            <slot/>
        </div>
    </div>
</template>
