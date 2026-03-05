<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type {View} from "@type32/obsidian-bases-parser";
import type {SelectItem} from "@nuxt/ui";
import {z} from 'zod'

const schema = z.custom<View>()

type Schema = z.output<typeof schema>

const props = defineProps<{
    modalTitle?: string,
    view?: View
}>()
const emit = defineEmits<{ close: [View | undefined] }>()

const state = reactive<Partial<Schema>>({
    name: props.view?.name || '',
    type: props.view?.type || 'table',
})

const availableTypes: SelectItem[] = [{
    label: 'Table',
    value: 'table',
    icon: 'i-lucide-sheet'
}, {
    label: 'Cards',
    value: 'cards',
    icon: 'i-lucide-layout-grid'
}, {
    label: 'List',
    value: 'list',
    icon: 'i-lucide-rows-3'
}, {
    label: 'Map',
    value: 'map',
    icon: 'i-lucide-map'
}]

async function onSubmit(event: FormSubmitEvent<Schema>) {
    emit('close', {
        ...props.view,
        ...event.data
    })
}
</script>

<template>
    <UModal
        :close="{ onClick: () => emit('close', undefined) }"
        :title="props?.modalTitle ?? 'New Base View'"
        size="sm"
    >
        <template #body>
            <UForm :schema="schema" :state class="p-2 w-full" @submit="onSubmit">
                <UFormField label="Name" name="name" required size="sm">
                    <UInput v-model="state.name" class="w-full" autofocus/>
                </UFormField>
                <UFormField label="Type" name="type" required size="sm">
                    <USelect v-model="state.type" :items="availableTypes" class="w-full"/>
                </UFormField>
            </UForm>
        </template>
    </UModal>
</template>

<style scoped>

</style>
