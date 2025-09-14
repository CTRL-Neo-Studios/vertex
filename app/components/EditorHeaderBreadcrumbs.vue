<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const modelValue = defineModel<string>()
const props = defineProps<{relativeFilePath: string}>()
const emit = defineEmits<{
    (e: 'on-rename'): void
}>()

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = []
    const segments = props.relativeFilePath.split('/').pop() ?? []
    for(let i = 0; i < segments.length; i++) {
        items.push({
            label: segments[i],
        })
    }

    items.push({
        slot: 'editable' as const
    })
    return items
})
</script>

<template>
    <UBreadcrumb separator-icon="i-lucide-slash" :items="breadcrumbItems" size="sm">
        <template #editable>
            <TextPreviewEditField v-model="modelValue" @on-rename="() => emit('on-rename')"/>
        </template>
    </UBreadcrumb>
</template>

<style scoped>

</style>