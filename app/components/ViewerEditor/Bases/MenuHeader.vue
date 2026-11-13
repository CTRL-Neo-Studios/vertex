<script setup lang="ts">
/** A toolbar menu's sub-page header (Obsidian's "‹ Configure view  ⋯ ✕"): back, the page's ⋯ actions, close. */
const props = defineProps<{ title: string }>()
const emit = defineEmits<{ back: [], close: [] }>()
</script>

<template>
    <div class="flex items-center gap-1 pb-1 mb-1 border-b border-default">
        <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-chevron-left" :label="props.title" class="font-medium" @click="emit('back')"/>
        <div class="grow"/>
        <slot name="actions"/>
        <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-x" @click="emit('close')"/>
    </div>
</template>
