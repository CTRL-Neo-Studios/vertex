<script setup lang="ts">
import {parseExpression, renameFormula, setFormula, setOrder} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";

/**
 * The Properties menu's "Add formula" page ("‹ Edit property"). Like Obsidian, nothing is written until a valid
 * formula is committed; then the formula is created, shown in the view, and later edits here change or rename it.
 */
const emit = defineEmits<{ back: [], close: [] }>()
const {t} = useI18n()
const ctx = useBaseContext()

const name = ref('')
const formula = ref('')
/** The formula's key once created. */
const created = ref<string | null>(null)

const formulas = () => ctx.base.value.formulas ?? {}
/** `name`, or `name 2`, `name 3`… if taken, as Obsidian numbers new names. */
function unique(base: string) {
    let candidate = base
    for (let n = 2; candidate in formulas(); n++) candidate = `${base} ${n}`
    return candidate
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

function commitFormula() {
    if (!valid(formula.value)) return
    if (created.value !== null) {
        if (formulas()[created.value] !== formula.value) ctx.commit(setFormula(ctx.base.value, created.value, formula.value))
        return
    }
    const key = unique(name.value.trim() || t('app.editor.ui.bases.formulaName'))
    const view = ctx.view.value
    const next = setFormula(ctx.base.value, key, formula.value)
    ctx.commit(setOrder(next, view.name, [...(view.order ?? ['file.name']), `formula.${key}`]))
    created.value = key
    name.value = key
}

function commitName() {
    if (created.value === null) return commitFormula()
    const next = name.value.trim()
    if (next && next !== created.value && !(next in formulas())) {
        ctx.commit(renameFormula(ctx.base.value, created.value, next))
        created.value = next
    }
    name.value = created.value
}
</script>

<template>
    <div>
        <ViewerEditorBasesMenuHeader :title="t('app.editor.ui.bases.editProperty')" @back="emit('back')" @close="emit('close')"/>
        <div class="flex flex-col gap-2 p-1">
            <UInput v-model="name" :placeholder="t('app.editor.ui.bases.formulaName')" size="sm" variant="subtle" class="w-full" autofocus @change="commitName"/>
            <UFormField :label="t('app.editor.ui.bases.formula')" size="sm">
                <ViewerEditorBasesFormulaInput v-model="formula" :placeholder="t('app.editor.ui.bases.formulaPlaceholder')" @commit="commitFormula"/>
            </UFormField>
        </div>
    </div>
</template>
