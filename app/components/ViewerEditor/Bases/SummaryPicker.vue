<script setup lang="ts">
import {parseExpression, setSummary, setSummaryFormula, summarize, type RowScope} from "@type32/obsidian-bases-parser";
import {bareId, useBaseContext} from "~/composables/bases/useBaseContext";
import {BUILT_IN_SUMMARIES, fittingSummaries, summaryText} from "~/utils/basesSummaries";

/**
 * Obsidian's summary picker ("Summarize..." on a column, or a summary cell's click): the summaries that fit the
 * column's values and the base's own, each with its value over `rows`; picking one sets the column's summary, picking
 * the current one removes it. "Add summary" creates a custom summary and uses it.
 */
const props = defineProps<{ id: string, rows: RowScope[] }>()
const emit = defineEmits<{ close: [] }>()
const {t} = useI18n()
const ctx = useBaseContext()

const query = ref('')
const adding = ref(false)
const name = ref('')
const formula = ref('')

const label = (summary: string) => BUILT_IN_SUMMARIES.includes(summary) ? t(`app.editor.ui.bases.summaryNames.${summary}`) : summary
const current = computed(() => ctx.view.value.summaries?.[bareId(props.id)])
const items = computed(() => {
    const base = ctx.base.value
    const context = {host: ctx.host, now: Date.now(), thisPath: ctx.thisPath, formulas: base.formulas ?? {}}
    const names = new Set([...fittingSummaries(props.rows.map(row => row.property(props.id))), ...Object.keys(base.summaries ?? {})])
    const q = query.value.trim().toLowerCase()
    return [...names]
        .map(summary => ({name: summary, label: label(summary), value: summaryText(summarize(base, context, props.rows, bareId(props.id), summary))}))
        .filter(item => !q || item.label.toLowerCase().includes(q) || item.name.toLowerCase().includes(q))
})

function pick(summary: string) {
    ctx.commit(setSummary(ctx.base.value, ctx.view.value.name, props.id, summary === current.value ? null : summary))
    emit('close')
}

function startAdding() {
    name.value = query.value.trim()
    adding.value = true
}

function valid(text: string) {
    if (!text.trim()) return false
    try {
        parseExpression(text)
        return true
    } catch {
        return false
    }
}
// A name already used (built-in or custom) gets ` 2`, ` 3`… so adding never overwrites another summary.
function unique(base: string) {
    const taken = (n: string) => BUILT_IN_SUMMARIES.includes(n) || n in (ctx.base.value.summaries ?? {})
    let candidate = base
    for (let n = 2; taken(candidate); n++) candidate = `${base} ${n}`
    return candidate
}
// The name field and the formula both commit on blur: write once.
let created = false
function commitSummary() {
    const key = name.value.trim()
    if (created || !key || !valid(formula.value)) return
    created = true
    const summary = unique(key)
    ctx.commit(setSummary(setSummaryFormula(ctx.base.value, summary, formula.value), ctx.view.value.name, props.id, summary))
    emit('close')
}
</script>

<template>
    <div class="w-75 p-1 text-sm">
        <div v-if="adding">
            <ViewerEditorBasesMenuHeader :title="t('app.editor.ui.bases.addSummary')" @back="adding = false" @close="emit('close')"/>
            <div class="flex flex-col gap-2 p-1">
                <UInput v-model="name" :placeholder="t('app.editor.ui.bases.formulaName')" size="sm" variant="subtle" class="w-full" autofocus @change="commitSummary"/>
                <ViewerEditorBasesFormulaInput v-model="formula" :placeholder="t('app.editor.ui.bases.summaryFormulaPlaceholder')" @commit="commitSummary"/>
            </div>
        </div>
        <template v-else>
            <UInput v-model="query" :placeholder="t('app.editor.ui.bases.findOrCreate')" icon="i-lucide-search" size="sm" variant="subtle" class="w-full mb-1" autofocus/>
            <div class="max-h-80 overflow-y-auto">
                <button
                    v-for="item in items"
                    :key="item.name"
                    type="button"
                    class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-start hover:bg-elevated"
                    :class="item.name === current ? 'bg-elevated text-highlighted' : ''"
                    @click="pick(item.name)"
                >
                    <UIcon name="i-lucide-binary" class="size-4 shrink-0 text-muted"/>
                    <span class="truncate">{{ item.label }}</span>
                    <span class="ms-auto shrink-0 text-muted">{{ item.value }}</span>
                </button>
            </div>
            <USeparator class="my-1"/>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-square-function" block class="justify-start" :label="t('app.editor.ui.bases.addSummary')" @click="startAdding"/>
        </template>
    </div>
</template>
