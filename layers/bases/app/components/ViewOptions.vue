<script setup lang="ts">
import type {BaseView} from "@type32/obsidian-bases-parser";
import type {BaseViewOption} from "../api";
import {fullId, useBaseContext} from "../lib/useBaseContext";
import {baseViews} from "../lib/views";

/**
 * A layout's options on the views menu's Configure view page: what its registration lists (`options`). The menu writes
 * each change with `setViewOption` (it may have to create the view first); a default value is sent as null, removing
 * the key.
 */
const props = defineProps<{ view: string }>()
const emit = defineEmits<{ set: [key: string, value: unknown] }>()
const {t} = useI18n()
const ctx = useBaseContext()

// The Add view form configures a view the file doesn't have yet: a table.
const view = computed<BaseView>(() => ctx.base.value.views?.find(v => v.name === props.view) ?? {type: 'table', name: props.view})
const fields = computed(() => (baseViews.get(view.value.type)?.options ?? []).filter(f => f.when?.(view.value) ?? true))

function set(field: BaseViewOption, value: unknown) {
    const next = value === field.default ? null : value
    if (next !== (view.value[field.key] ?? null)) emit('set', field.key, next)
}

// A slider writes once it's let go, not at every step. Its `change` carries no value, and from the keyboard it comes
// before the step's own update: read the value a tick later.
const live = reactive(new Map<string, number>())
const sliderValue = (field: Extract<BaseViewOption, { kind: 'slider' }>) => live.get(field.key) ?? (typeof view.value[field.key] === 'number' ? view.value[field.key] as number : field.default)
async function release(field: BaseViewOption) {
    await nextTick()
    const value = live.get(field.key)
    live.delete(field.key)
    if (value !== undefined) set(field, value)
}

// An expression is written when it's committed (Enter, leaving the field), not at each keystroke.
const drafts = reactive(new Map<string, string>())
const draft = (field: BaseViewOption) => drafts.get(field.key) ?? text(view.value[field.key]) ?? ''

const text = (value: unknown) => (typeof value === 'string' ? value : undefined)
const lines = (value: unknown) => (Array.isArray(value) ? value.join('\n') : '')
function setLines(field: BaseViewOption, event: Event) {
    const items = (event.target as HTMLTextAreaElement).value.split('\n').map(line => line.trim()).filter(Boolean)
    set(field, items.length ? items : null)
}
</script>

<template>
    <UFormField v-for="field in fields" :key="field.key" :label="t(field.label)" size="sm">
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
            :items="field.options.map(o => ({value: o.value, label: t(o.label)}))"
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
        <BasesPropertySelect
            v-else-if="field.kind === 'property'"
            :model-value="text(view[field.key])"
            class="w-full"
            @update:model-value="id => set(field, id && fullId(id))"
        />
        <BasesFormulaInput
            v-else-if="field.kind === 'formula'"
            :model-value="draft(field)"
            @update:model-value="value => drafts.set(field.key, value)"
            @commit="set(field, draft(field).trim() || null); drafts.delete(field.key)"
        />
        <UTextarea
            v-else
            :model-value="lines(view[field.key])"
            :rows="2"
            autoresize
            size="sm"
            class="w-full"
            @change="(event: Event) => setLines(field, event)"
        />
    </UFormField>
</template>
