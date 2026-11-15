<script setup lang="ts">
import type {BaseView} from "@type32/obsidian-bases-parser";
import {fullId, useBaseContext} from "~/composables/bases/useBaseContext";

/**
 * A layout's options on the views menu's Configure view page (Obsidian's per-layout fields). The menu writes each
 * change with `setViewOption` (it may have to create the view first); a default value is sent as null, removing the key.
 */
const props = defineProps<{ view: string }>()
const emit = defineEmits<{ set: [key: string, value: unknown] }>()
const {t} = useI18n()
const ctx = useBaseContext()

type Field =
    | { key: string, kind: 'slider', min: number, max: number, step: number, default: number }
    | { key: string, kind: 'select', labels: string, options: string[], default: string }
    | { key: string, kind: 'switch', default: boolean }
    | { key: string, kind: 'text', default: string }
    | { key: string, kind: 'property' | 'formula' | 'tiles', default?: undefined }

const image = (ratio: number): Field[] => [
    {key: 'image', kind: 'property'},
    {key: 'imageFit', kind: 'select', labels: 'imageFits', options: ['cover', 'contain'], default: 'cover'},
    {key: 'imageAspectRatio', kind: 'slider', min: 0.25, max: 2.5, step: 0.05, default: ratio},
]

const LAYOUT_FIELDS: Record<string, Field[]> = {
    table: [{key: 'rowHeight', kind: 'select', labels: 'rowHeights', options: ['short', 'medium', 'tall', 'extra'], default: 'short'}],
    cards: [{key: 'cardSize', kind: 'slider', min: 50, max: 800, step: 10, default: 200}, ...image(1)],
    list: [
        {key: 'markers', kind: 'select', labels: 'markerTypes', options: ['bullet', 'number', 'none'], default: 'bullet'},
        {key: 'indentProperties', kind: 'switch', default: false},
        {key: 'separator', kind: 'text', default: ', '},
    ],
    kanban: [{key: 'columnWidth', kind: 'slider', min: 200, max: 500, step: 10, default: 280}, ...image(0.5)],
    map: [
        {key: 'mapHeight', kind: 'slider', min: 200, max: 800, step: 20, default: 400},
        {key: 'center', kind: 'formula'},
        {key: 'defaultZoom', kind: 'slider', min: 1, max: 18, step: 1, default: 4},
        {key: 'minZoom', kind: 'slider', min: 0, max: 24, step: 1, default: 0},
        {key: 'maxZoom', kind: 'slider', min: 0, max: 24, step: 1, default: 18},
        {key: 'coordinates', kind: 'property'},
        {key: 'markerIcon', kind: 'property'},
        {key: 'markerColor', kind: 'property'},
        {key: 'mapTiles', kind: 'tiles'},
        {key: 'mapTilesDark', kind: 'tiles'},
    ],
}

// The Add view form configures a view the file doesn't have yet: a table.
const view = computed<BaseView>(() => ctx.base.value.views?.find(v => v.name === props.view) ?? {type: 'table', name: props.view})
// The separator only joins properties on one line.
const fields = computed(() => (LAYOUT_FIELDS[view.value.type] ?? []).filter(f => f.key !== 'separator' || view.value.indentProperties !== true))

function set(field: Field, value: unknown) {
    const next = value === field.default ? null : value
    if (next !== (view.value[field.key] ?? null)) emit('set', field.key, next)
}

// A slider writes once it's let go, not at every step. Its `change` carries no value, and from the keyboard it comes
// before the step's own update: read the value a tick later.
const live = reactive(new Map<string, number>())
const sliderValue = (field: Extract<Field, { kind: 'slider' }>) => live.get(field.key) ?? (typeof view.value[field.key] === 'number' ? view.value[field.key] as number : field.default)
async function release(field: Field) {
    await nextTick()
    const value = live.get(field.key)
    live.delete(field.key)
    if (value !== undefined) set(field, value)
}

const center = ref('')
watch(() => view.value.center, (value) => {
    center.value = typeof value === 'string' ? value : ''
}, {immediate: true})

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const tiles = (value: unknown) => (Array.isArray(value) ? value.join('\n') : '')
function setTiles(field: Field, event: Event) {
    const urls = (event.target as HTMLTextAreaElement).value.split('\n').map(url => url.trim()).filter(Boolean)
    set(field, urls.length ? urls : null)
}
</script>

<template>
    <UFormField v-for="field in fields" :key="field.key" :label="t(`app.editor.ui.bases.options.${field.key}`)" size="sm">
        <USlider
            v-if="field.kind === 'slider'"
            :model-value="sliderValue(field)"
            :min="field.min"
            :max="field.max"
            :step="field.step"
            tooltip
            size="sm"
            @update:model-value="value => live.set(field.key, value as number)"
            @change="release(field)"
        />
        <USelect
            v-else-if="field.kind === 'select'"
            :model-value="text(view[field.key]) || field.default"
            :items="field.options.map(value => ({value, label: t(`app.editor.ui.bases.options.${field.labels}.${value}`)}))"
            size="sm"
            class="w-full"
            @update:model-value="value => set(field, value)"
        />
        <USwitch
            v-else-if="field.kind === 'switch'"
            :model-value="view[field.key] === true"
            size="sm"
            @update:model-value="value => set(field, value)"
        />
        <UInput
            v-else-if="field.kind === 'text'"
            :model-value="text(view[field.key]) ?? field.default"
            size="sm"
            class="w-full"
            @change="(event: Event) => set(field, (event.target as HTMLInputElement).value)"
        />
        <ViewerEditorBasesPropertySelect
            v-else-if="field.kind === 'property'"
            :model-value="text(view[field.key])"
            class="w-full"
            @update:model-value="id => set(field, id && fullId(id))"
        />
        <ViewerEditorBasesFormulaInput
            v-else-if="field.kind === 'formula'"
            v-model="center"
            @commit="set(field, center.trim() || null)"
        />
        <UTextarea
            v-else
            :model-value="tiles(view[field.key])"
            :rows="2"
            autoresize
            size="sm"
            class="w-full"
            @change="(event: Event) => setTiles(field, event)"
        />
    </UFormField>
</template>
