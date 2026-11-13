<script setup lang="ts">
import {fromFilterGroup, NO_VALUE, propertyKind, setFilters, toFilterGroup, type FilterGroup, type FilterNode, type FilterRule} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";

/** Obsidian's Filter menu: the base's filters ("All views") and the active view's ("This view"), each a group editor. */
const {t} = useI18n()
const ctx = useBaseContext()
const kindOf = (id: string) => propertyKind(id, p => ctx.property(p).kind)

type Scope = 'base' | 'view'
const SECTIONS = [{scope: 'base', label: 'allViews'}, {scope: 'view', label: 'thisView'}] as const

const open = computed({
    get: () => ctx.open.value === 'filter',
    set: (value) => { ctx.open.value = value ? 'filter' : null },
})
const active = computed(() => !!(ctx.base.value.filters || ctx.view.value.filters))

const node = (scope: Scope) => (scope === 'base' ? ctx.base.value.filters : ctx.view.value.filters)
const read = (scope: Scope) => toFilterGroup(node(scope), kindOf)

const filled = (rule: FilterRule) => !!rule.property && (NO_VALUE.has(rule.operator) || (rule.values.length > 0 && rule.values.every(v => v !== '')))

/** The group without rows still being filled in (nor groups left empty by that); null when nothing is left. */
function complete(group: FilterGroup): FilterGroup | null {
    const items = group.items.flatMap((item): FilterGroup['items'] => {
        if ('conjunction' in item) {
            const inner = complete(item)
            return inner ? [inner] : []
        }
        return ('expression' in item ? item.expression.trim() : filled(item)) ? [item] : []
    })
    return items.length ? {...group, items} : null
}

function written(group: FilterGroup): FilterNode | null {
    const kept = complete(group)
    return kept ? fromFilterGroup(kept) : null
}

const same = (scope: Scope, group: FilterGroup) => JSON.stringify(node(scope) ?? null) === JSON.stringify(written(group))

// Rows still being filled in live only here (Obsidian writes nothing for them); filters changed elsewhere (another
// view, the source, undo) replace the editor's groups.
const groups = shallowRef<Record<Scope, FilterGroup>>({base: read('base'), view: read('view')})
watch([() => ctx.view.value.name, () => node('base'), () => node('view')], () => {
    const {base, view} = groups.value
    groups.value = {base: same('base', base) ? base : read('base'), view: same('view', view) ? view : read('view')}
})

function update(scope: Scope, group: FilterGroup) {
    groups.value = {...groups.value, [scope]: group}
    if (!same(scope, group)) ctx.commit(setFilters(ctx.base.value, scope === 'base' ? null : ctx.view.value.name, written(group)))
}
</script>

<template>
    <UPopover v-model:open="open" :content="{align: 'end'}">
        <UButton
            icon="i-lucide-list-filter"
            :label="t('app.editor.ui.bases.filter')"
            size="sm"
            :color="active ? 'primary' : 'neutral'"
            variant="ghost"
        />
        <template #content>
            <div class="w-[34rem] max-w-[90vw] max-h-[70vh] overflow-y-auto p-2 flex flex-col gap-1">
                <UCollapsible v-for="section in SECTIONS" :key="section.scope" :default-open="section.scope === 'view'">
                    <UButton
                        :label="t(`app.editor.ui.bases.${section.label}`)"
                        icon="i-lucide-chevron-right"
                        variant="ghost"
                        color="neutral"
                        size="sm"
                        class="group w-full font-medium"
                        :ui="{leadingIcon: 'transition-transform group-data-[state=open]:rotate-90'}"
                    />
                    <template #content>
                        <ViewerEditorBasesFilterGroupEditor :group="groups[section.scope]" class="pl-2 pb-2" @update="group => update(section.scope, group)"/>
                    </template>
                </UCollapsible>
            </div>
        </template>
    </UPopover>
</template>
