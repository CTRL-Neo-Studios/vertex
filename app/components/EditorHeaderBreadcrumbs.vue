<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const modelValue = defineModel<string>()
const props = defineProps<{relativeFilePath: string, renaming?: boolean}>()
const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
}>()

const breadcrumbItems = computed<BreadcrumbItem[]>(() => {
    const items: BreadcrumbItem[] = []
    const segments = props.relativeFilePath.split('/') ?? []
    for(let i = 0; i < segments.length - 1; i++) {
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
    <UBreadcrumb :items="breadcrumbItems" size="sm" class="text-sm select-none font-mono">
        <template #separator>
            <span class="select-none text-muted text-center align-middle">/</span>
        </template>
        <template #editable>
            <div class="inline-flex w-fit items-center justify-center font-medium">
                <UIcon size="sm" name="i-lucide-loader-circle" class="animate-spin" v-if="props?.renaming"/>
                <TextPreviewEditField size="sm" class="w-fit" :disabled="props?.renaming" v-model="modelValue" @on-rename="(oldValue, newValue) => emit('on-rename', oldValue, newValue)"/>
            </div>
        </template>
    </UBreadcrumb>
</template>

<style scoped>

</style>