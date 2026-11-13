<script setup lang="ts">
import type {DropdownMenuItem} from "@nuxt/ui";
import {deleteFormula, parseExpression, setDisplayName, setFormula} from "@type32/obsidian-bases-parser";
import {fullId, useBaseContext} from "~/composables/bases/useBaseContext";

/** A property's page in the Properties menu ("‹ Edit status"): display name, a formula's expression, ⋯ actions. */
const props = defineProps<{ id: string, shown: boolean }>()
const emit = defineEmits<{ toggle: [id: string], back: [], close: [] }>()
const {t} = useI18n()
const ctx = useBaseContext()

const property = computed(() => ctx.property(props.id))
const formulaName = computed(() => (property.value.source === 'formula' ? props.id.slice(8) : null))
const ownName = computed(() => {
    const {source, id} = property.value
    if (source === 'file') return t(`app.editor.ui.bases.fileProperties.${id.slice(5)}`)
    return formulaName.value ?? id
})

const storedName = () => {
    const name = ctx.base.value.properties?.[fullId(props.id)]?.displayName
    return typeof name === 'string' ? name : ''
}
const displayName = ref(storedName())
function commitDisplayName() {
    if (displayName.value !== storedName()) ctx.commit(setDisplayName(ctx.base.value, fullId(props.id), displayName.value || null))
}

/** Undefined once the formula is gone, so a late blur can't bring a deleted formula back. */
const storedFormula = () => (formulaName.value === null ? undefined : ctx.base.value.formulas?.[formulaName.value])
const formula = ref(storedFormula() ?? '')
function commitFormula() {
    const stored = storedFormula()
    if (formulaName.value === null || stored === undefined || formula.value === stored || !formula.value.trim()) return
    try {
        parseExpression(formula.value)
    } catch {
        return
    }
    ctx.commit(setFormula(ctx.base.value, formulaName.value, formula.value))
}

function remove() {
    if (formulaName.value === null) return
    ctx.commit(deleteFormula(ctx.base.value, formulaName.value))
    emit('back')
}

const actions = computed<DropdownMenuItem[][]>(() => [
    [{label: t('app.editor.ui.bases.showProperty'), type: 'checkbox', checked: props.shown, onUpdateChecked: () => emit('toggle', props.id)}],
    ...(formulaName.value === null ? [] : [[{label: t('app.editor.ui.bases.deleteFormula'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: remove}]]),
])
</script>

<template>
    <div>
        <ViewerEditorBasesMenuHeader :title="t('app.editor.ui.bases.editNamed', {name: property.label})" @back="emit('back')" @close="emit('close')">
            <template #actions>
                <UDropdownMenu :items="actions" size="sm" :content="{align: 'end'}">
                    <UButton variant="ghost" color="neutral" size="xs" icon="i-lucide-more-vertical"/>
                </UDropdownMenu>
            </template>
        </ViewerEditorBasesMenuHeader>
        <div class="flex flex-col gap-2 p-1">
            <UFormField :label="t('app.editor.ui.bases.displayName')" size="sm">
                <UInput v-model="displayName" :placeholder="ownName" size="sm" variant="subtle" class="w-full" @change="commitDisplayName"/>
            </UFormField>
            <UFormField v-if="formulaName !== null" :label="t('app.editor.ui.bases.formula')" size="sm">
                <ViewerEditorBasesFormulaInput v-model="formula" :placeholder="t('app.editor.ui.bases.formulaPlaceholder')" @commit="commitFormula"/>
            </UFormField>
        </div>
    </div>
</template>
