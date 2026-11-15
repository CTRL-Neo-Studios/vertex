<script setup lang="ts">
import {setSort, type PropertyOrder} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {moved, useListDrag} from "~/composables/bases/useListDrag";

/** Obsidian's Sort menu: the view's sort rows (property, direction), draggable, with Add sort. */
const {t} = useI18n()
const ctx = useBaseContext()

const open = computed({
    get: () => ctx.open.value === 'sort',
    set: value => ctx.open.value = value ? 'sort' : null,
})

type Row = { property?: string, direction: PropertyOrder['direction'] }
// Local rows so a new row without a property can exist before anything is written.
const rows = ref<Row[]>([])
watch(() => ctx.view.value.sort, sort => rows.value = (sort ?? []).map(s => ({...s})), {immediate: true})

function write(next: Row[]) {
    rows.value = next
    if (next.some(r => r.property === undefined)) return
    ctx.commit(setSort(ctx.base.value, ctx.view.value.name, next as PropertyOrder[]))
}

const {bind, over} = useListDrag((from, to) => write(moved(rows.value, from, to)))

function directions(property?: string) {
    const kind = property === undefined ? 'text' : ctx.property(property).kind
    const key = kind === 'number' || kind === 'date' ? kind : 'text'
    return [
        {label: t(`app.editor.ui.bases.directions.${key}.asc`), value: 'ASC'},
        {label: t(`app.editor.ui.bases.directions.${key}.desc`), value: 'DESC'},
    ]
}
</script>

<template>
    <UPopover v-model:open="open">
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-up-down" :label="t('app.editor.ui.bases.sort')"/>
        <template #content>
            <div class="w-[300px] p-2 flex flex-col gap-1">
                <div class="text-xs font-medium text-muted px-1">{{ t('app.editor.ui.bases.sortBy') }}</div>
                <div
                    v-for="(row, i) in rows"
                    :key="i"
                    v-bind="bind(i)"
                    class="flex items-center gap-1 rounded"
                    :class="{'ring-1 ring-primary': over === i}"
                >
                    <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-dimmed cursor-grab"/>
                    <ViewerEditorBasesPropertySelect
                        :model-value="row.property"
                        class="grow min-w-0"
                        @update:model-value="id => write(rows.toSpliced(i, 1, {...row, property: id}))"
                    />
                    <USelect
                        :model-value="row.direction"
                        :items="directions(row.property)"
                        size="sm"
                        color="neutral"
                        variant="subtle"
                        class="w-28"
                        @update:model-value="d => write(rows.toSpliced(i, 1, {...row, direction: d as Row['direction']}))"
                    />
                    <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" @click="write(rows.toSpliced(i, 1))"/>
                </div>
                <UButton
                    size="sm"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-plus"
                    :label="t('app.editor.ui.bases.addSort')"
                    @click="rows = [...rows, {direction: 'ASC'}]"
                />
            </div>
        </template>
    </UPopover>
</template>
