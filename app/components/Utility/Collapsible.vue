<script setup lang="ts">
defineProps({
    label: {
        type: String,
        required: true,
    },
    defaultOpen: {
        type: Boolean,
        default: false,
    },
})

const open = defineModel('open', {type: Boolean, default: undefined})
</script>

<template>
    <UCollapsible
        v-model:open="open"
        :default-open="defaultOpen"
        class="group/collapsible"
    >
        <div class="flex items-center justify-between gap-2 w-full">
            <div class="flex items-center gap-2">
                <div
                    class="flex items-center justify-center size-3.5 rounded bg-elevated transition-colors duration-200 group-hover/collapsible:bg-accented">
                    <UIcon
                        name="i-lucide-chevron-right"
                        class="size-2.5 text-muted transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                    />
                </div>
                <span class="text-xs font-medium text-highlighted tracking-tight">{{ label }}</span>
                <slot name="badge"/>
            </div>

            <slot name="actions"/>
        </div>

        <template #content>
            <div class="mt-1 ml-2 pl-3 border-l border-gray-200 dark:border-gray-700/50">
                <slot/>
            </div>
        </template>
    </UCollapsible>
</template>