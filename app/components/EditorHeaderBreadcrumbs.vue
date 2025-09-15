<script setup lang="ts">
import type { BreadcrumbItem } from '@nuxt/ui'

const modelValue = defineModel<string>()
const props = defineProps<{relativeFilePath: string, renaming?: boolean}>()
const emit = defineEmits<{
    (e: 'on-rename', oldValue: string): void
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
            <div class="inline-flex w-fit items-center justify-center font-medium">
                <UIcon size="sm" name="i-lucide-loader-circle" class="animate-spin" v-if="props?.renaming"/>
                <TextPreviewEditField class="w-fit" :disabled="props?.renaming" v-model="modelValue" @on-rename="(oldValue) => emit('on-rename', oldValue)"/>
            </div>
        </template>
    </UBreadcrumb>
</template>

<style scoped>

</style>