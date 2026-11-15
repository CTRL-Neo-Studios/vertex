<script setup lang="ts">
import {MANY_VALUES, NO_VALUE, OPERATORS, propertyKind, ruleExpression, toFilterGroup, type FilterExpression, type FilterOperator, type FilterRule, type FilterValue, type PropertyKind} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";

/**
 * A row of Obsidian's Filter menu: a rule (property, operator, values) or, as an "Advanced filter", an expression.
 * Any edit to a rule drops the text it was read from, so it's written anew.
 */
const props = defineProps<{ item: FilterRule | FilterExpression }>()
const emit = defineEmits<{ update: [item: FilterRule | FilterExpression], remove: [] }>()
const {t, te} = useI18n()
const ctx = useBaseContext()
const kindOf = (id: string) => propertyKind(id, p => ctx.property(p).kind)

const rule = computed(() => ('operator' in props.item ? props.item : null))
const kind = computed<PropertyKind>(() => (rule.value?.property ? kindOf(rule.value.property) : 'text'))

function change(patch: Partial<FilterRule>) {
    const {property, operator, values} = rule.value!
    emit('update', {property, operator, values, ...patch})
}

// Some kinds name operators their own way ("=" for numbers, "before" for dates, "is exactly" for lists).
const LABELS: Partial<Record<PropertyKind, string>> = {number: 'operatorsNumber', date: 'operatorsDate', list: 'operatorsList'}
const operators = computed(() => OPERATORS[kind.value].map((value) => {
    const own = `app.editor.ui.bases.${LABELS[kind.value]}.${value}`
    return {value, label: LABELS[kind.value] && te(own) ? t(own) : t(`app.editor.ui.bases.operators.${value}`)}
}))

function setProperty(property: string) {
    const next = kindOf(property)
    if (next === kind.value) return change({property})
    change({property, operator: OPERATORS[next][0]!, values: next === 'checkbox' ? [false] : []})
}

function setOperator(operator: FilterOperator) {
    const values = rule.value!.values
    change({operator, values: NO_VALUE.has(operator) ? [] : MANY_VALUES.has(operator) ? values : values.slice(0, 1)})
}

const display = (value: FilterValue) => (typeof value === 'object' ? `[[${value.link}]]` : String(value))
const parse = (text: string): FilterValue => {
    const link = /^\[\[([^\]|]*)(?:\|[^\]]*)?\]\]$/.exec(text)
    return link ? {link: link[1]!} : text
}

/** Which value input the rule takes; a list's "is exactly" compares the whole list, so it takes several values too. */
const input = computed(() => {
    const operator = rule.value?.operator
    if (!operator || NO_VALUE.has(operator)) return null
    if (MANY_VALUES.has(operator) || (kind.value === 'list' && (operator === 'equals' || operator === 'notEquals'))) return 'many'
    return kind.value
})

const single = computed<string>({
    get: () => {
        const value = rule.value?.values[0]
        return value === undefined ? '' : display(value)
    },
    set: value => change({values: value === '' ? [] : [kind.value === 'number' ? Number(value) : kind.value === 'date' ? value : parse(value)]}),
})

// The expression is written when it's committed (Enter or blur), not on every keystroke.
const draft = ref('')
watch(() => props.item, (item) => {
    if ('expression' in item) draft.value = item.expression
}, {immediate: true})

function commitExpression() {
    if ('expression' in props.item && draft.value !== props.item.expression) emit('update', {expression: draft.value})
}

/** "Advanced filter" shows the rule's expression; "Simple filter" goes back only when the expression reads as a rule. */
function toggle() {
    if (rule.value) return emit('update', {expression: rule.value.property ? rule.value.text ?? ruleExpression(rule.value) : ''})
    if (!draft.value.trim()) return emit('update', {property: '', operator: 'equals', values: []})
    const item = toFilterGroup(draft.value, kindOf).items[0]
    if (item && 'operator' in item) emit('update', item)
}
</script>

<template>
    <div class="flex flex-wrap items-start gap-1">
        <template v-if="rule">
            <ViewerEditorBasesPropertySelect :model-value="rule.property || undefined" with-file @update:model-value="id => id && setProperty(id)"/>
            <USelect
                :model-value="rule.operator"
                :items="operators"
                size="sm"
                color="neutral"
                variant="subtle"
                class="min-w-24"
                @update:model-value="setOperator"
            />
            <UInputTags
                v-if="input === 'many'"
                :model-value="rule.values.map(display)"
                :placeholder="t('app.editor.ui.bases.empty')"
                add-on-blur
                size="sm"
                class="grow min-w-32"
                @update:model-value="tags => change({values: (tags ?? []).map(parse)})"
            />
            <UCheckbox
                v-else-if="input === 'checkbox'"
                :model-value="rule.values[0] === true"
                class="mt-1.5"
                @update:model-value="value => change({values: [value === true]})"
            />
            <UInput v-else-if="input === 'number'" v-model.lazy="single" type="number" :placeholder="t('app.editor.ui.bases.empty')" size="sm" class="grow min-w-24"/>
            <UInput v-else-if="input === 'date'" v-model.lazy="single" type="date" size="sm" class="grow min-w-32"/>
            <UInput v-else-if="input" v-model.lazy="single" :placeholder="t('app.editor.ui.bases.empty')" size="sm" class="grow min-w-24"/>
        </template>
        <ViewerEditorBasesFormulaInput v-else v-model="draft" class="grow min-w-0" @commit="commitExpression"/>
        <div class="ms-auto flex">
            <UTooltip :text="t(rule ? 'app.editor.ui.bases.advancedFilter' : 'app.editor.ui.bases.simpleFilter')">
                <UButton
                    icon="i-lucide-code-xml"
                    variant="ghost"
                    :color="rule ? 'neutral' : 'primary'"
                    size="xs"
                    :aria-label="t(rule ? 'app.editor.ui.bases.advancedFilter' : 'app.editor.ui.bases.simpleFilter')"
                    @click="toggle"
                />
            </UTooltip>
            <UTooltip :text="t('app.editor.ui.bases.removeFilter')">
                <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" :aria-label="t('app.editor.ui.bases.removeFilter')" @click="emit('remove')"/>
            </UTooltip>
        </div>
    </div>
</template>
