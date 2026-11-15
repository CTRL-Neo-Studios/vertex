<script setup lang="ts">
import {useBaseContext, type BaseProperty} from "~/composables/bases/useBaseContext";

/**
 * Picks a property (Obsidian's property combobox): file properties, formulas, then the workspace's note properties.
 * `withFile` offers the file itself first, as the Filter menu does (links to, in folder, has tag…).
 */
const model = defineModel<string | undefined>()
const props = defineProps<{ placeholder?: string, filter?: (property: BaseProperty) => boolean, withFile?: boolean }>()
const {t} = useI18n()
const ctx = useBaseContext()

const items = computed(() => {
    const list = [...(props.withFile ? [ctx.property('file')] : []), ...ctx.properties.value.filter(p => !props.filter || props.filter(p))]
    // A property the file names but nothing offers (a note property no note has yet) stays selectable.
    const current = model.value === undefined ? undefined : ctx.property(model.value)
    return current && !list.some(p => p.id === current.id) ? [current, ...list] : list
})
</script>

<template>
    <USelectMenu
        :model-value="model === undefined ? undefined : ctx.property(model).id"
        :items="items"
        value-key="id"
        label-key="label"
        :filter-fields="['label', 'id']"
        :placeholder="props.placeholder ?? t('app.editor.ui.bases.property')"
        :icon="model === undefined ? undefined : ctx.property(model).icon"
        size="sm"
        color="neutral"
        variant="subtle"
        class="min-w-36"
        @update:model-value="(id: string) => model = id"
    >
        <template #item-trailing="{ item }">
            <span v-if="item.source === 'file'" class="text-xs text-dimmed">{{ item.id }}</span>
        </template>
    </USelectMenu>
</template>
