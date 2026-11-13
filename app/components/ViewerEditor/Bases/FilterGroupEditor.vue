<script setup lang="ts">
import type {FilterGroup, FilterRule} from "@type32/obsidian-bases-parser";
import {moved, useListDrag} from "~/composables/bases/useListDrag";

/** A filter group of Obsidian's Filter menu: its conjunction, then rules, advanced rows and nested groups. */
const props = defineProps<{ group: FilterGroup, nested?: boolean }>()
const emit = defineEmits<{ update: [group: FilterGroup], remove: [] }>()
const {t} = useI18n()

type Item = FilterGroup['items'][number]
const set = (items: Item[]) => emit('update', {...props.group, items})
const replace = (index: number, item: Item) => set(props.group.items.with(index, item))
const remove = (index: number) => set(props.group.items.toSpliced(index, 1))
const newRule = (): FilterRule => ({property: '', operator: 'equals', values: []})
const {bind, dragging, over} = useListDrag((from, to) => set(moved(props.group.items, from, to)))
// Rows drag from their grip only: a draggable row would steal text selection from its inputs (WebKit).
const armed = ref<number | null>(null)

const conjunctions = computed(() => (['and', 'or', 'not'] as const).map(value => ({value, label: t(`app.editor.ui.bases.conjunctions.${value}`)})))
const word = (index: number) => t(`app.editor.ui.bases.${index === 0 ? 'where' : props.group.conjunction === 'and' ? 'and' : 'or'}`)
</script>

<template>
    <div class="flex flex-col gap-1" :class="props.nested && 'rounded-md border border-default p-1.5'">
        <div class="flex items-center gap-1">
            <USelect
                :model-value="props.group.conjunction"
                :items="conjunctions"
                size="sm"
                color="neutral"
                variant="ghost"
                @update:model-value="conjunction => emit('update', {...props.group, conjunction})"
            />
            <div class="grow"/>
            <UTooltip v-if="props.nested" :text="t('app.editor.ui.bases.removeFilterGroup')">
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" :aria-label="t('app.editor.ui.bases.removeFilterGroup')" @click="emit('remove')"/>
            </UTooltip>
        </div>
        <!-- `.stop`: a drag that starts in a nested group's row belongs to that group, not this one. -->
        <div
            v-for="(item, i) in props.group.items"
            :key="i"
            v-bind="bind(i)"
            :draggable="armed === i"
            class="flex items-start gap-1 rounded-sm"
            :class="[dragging === i && 'opacity-50', over === i && dragging !== i && 'ring-1 ring-primary']"
            @dragstart.stop
            @dragend="armed = null"
        >
            <UIcon name="i-lucide-grip-vertical" class="mt-2 size-4 shrink-0 cursor-grab text-dimmed" @pointerdown="armed = i" @pointerup="armed = null"/>
            <span class="mt-1.5 w-12 shrink-0 text-sm text-muted">{{ word(i) }}</span>
            <ViewerEditorBasesFilterGroupEditor
                v-if="'conjunction' in item"
                :group="item"
                nested
                class="grow min-w-0"
                @update="group => replace(i, group)"
                @remove="remove(i)"
            />
            <ViewerEditorBasesFilterRuleRow v-else :item="item" class="grow min-w-0" @update="next => replace(i, next)" @remove="remove(i)"/>
        </div>
        <div class="flex gap-1">
            <UButton icon="i-lucide-plus" :label="t('app.editor.ui.bases.addFilter')" variant="ghost" color="neutral" size="xs" @click="set([...props.group.items, newRule()])"/>
            <UButton
                icon="i-lucide-plus"
                :label="t('app.editor.ui.bases.addFilterGroup')"
                variant="ghost"
                color="neutral"
                size="xs"
                @click="set([...props.group.items, {conjunction: 'and', items: [newRule()]}])"
            />
        </div>
    </div>
</template>
