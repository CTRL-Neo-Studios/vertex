<script setup lang="ts" generic="T extends { id: string }">
import {ask} from "@tauri-apps/plugin-dialog";
import type {SettingsListAction, SettingsListProps} from "#shared/plugin/components";

/**
 * A list in a settings section (`SettingsListProps`): a search and its filters, and with actions a checkbox per row,
 * one for all the rows shown and the actions on the selection; headings by `group`; "nothing yet" and "nothing
 * matches". Every part is a `SettingsRow`, so the section's anatomy holds. Published to plugins.
 */
const props = defineProps<SettingsListProps<T>>()
const query = defineModel<string>('query', {default: ''})
const filter = defineModel<string>('filter')
defineSlots<{
    row(props: { item: T }): unknown
    actions?(props: { item: T }): unknown
}>()
const {t} = useI18n()

const shown = computed(() => {
    const test = (props.filters?.find(f => f.id === filter.value) ?? props.filters?.[0])?.test
    const words = query.value.trim().toLowerCase()
    return props.items.filter(item => (!test || test(item)) && (!words || props.text(item).toLowerCase().includes(words)))
})
/** The rows shown, each with the heading it starts, if any. */
const rows = computed(() => shown.value.map((item, i) => {
    const heading = props.group?.(item)
    return {item, heading: heading !== undefined && heading !== (i ? props.group!(shown.value[i - 1]!) : undefined) ? heading : undefined}
}))

const selecting = computed(() => !!props.actions?.length)
const canSelect = (item: T) => props.selectable?.(item) ?? true
const selected = ref(new Set<string>())
// Rows that went away (removed here, or from another window) leave the selection.
watch(() => props.items, items => {
    const ids = new Set(items.map(item => item.id))
    selected.value = new Set([...selected.value].filter(id => ids.has(id)))
})
const selectableShown = computed(() => shown.value.filter(canSelect))
const allState = computed(() => {
    const count = selectableShown.value.filter(item => selected.value.has(item.id)).length
    return count === 0 ? false : count === selectableShown.value.length ? true : 'indeterminate'
})
function toggle(ids: string[], on: boolean) {
    const next = new Set(selected.value)
    for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
    }
    selected.value = next
}

/** Each action with the selected rows it acts on; one that acts on none isn't offered. */
const offered = computed(() => (props.actions ?? []).map(action => ({
    action,
    targets: props.items.filter(item => selected.value.has(item.id) && (action.applies?.(item) ?? true)),
})).filter(entry => entry.targets.length))
async function run(action: SettingsListAction<T>, targets: T[]) {
    const label = action.label(targets.length)
    if (action.confirm && !(await ask(action.confirm(targets.length), {kind: 'warning', okLabel: label, cancelLabel: t('app.generic.cancel')}))) return
    toggle(targets.map(item => item.id), false)
    await action.run(targets)
}
</script>

<template>
    <SettingsRow v-if="!items.length" stacked data-settings-list-empty>
        <p class="text-sm text-muted">{{ empty }}</p>
    </SettingsRow>
    <template v-else>
        <SettingsRow stacked>
            <div class="flex items-center gap-3">
                <UCheckbox
                    v-if="selecting"
                    :model-value="allState"
                    :disabled="!selectableShown.length"
                    :aria-label="t('app.settings.list.selectAll')"
                    @update:model-value="on => toggle(selectableShown.map(item => item.id), on === true)"
                />
                <UInput v-model="query" class="flex-1 min-w-0" size="sm" icon="i-lucide-search" :placeholder data-settings-list-search/>
                <USelect
                    v-if="filters?.length"
                    :model-value="filter ?? filters[0]!.id"
                    class="w-32"
                    size="sm"
                    :items="filters.map(f => ({label: f.label, value: f.id}))"
                    :aria-label="t('app.settings.list.filter')"
                    data-settings-list-filter
                    @update:model-value="filter = $event"
                />
                <UButton
                    v-for="{action, targets} in offered"
                    :key="action.id"
                    size="sm"
                    :color="action.color ?? 'neutral'"
                    variant="soft"
                    :icon="action.icon"
                    :label="action.label(targets.length)"
                    :data-settings-list-action="action.id"
                    @click="run(action, targets)"
                />
            </div>
        </SettingsRow>
        <template v-for="{item, heading} in rows" :key="item.id">
            <SettingsRow v-if="heading" stacked>
                <h3 class="text-xs font-medium text-dimmed">{{ heading }}</h3>
            </SettingsRow>
            <SettingsRow stacked :data-settings-list-row="item.id">
                <div class="flex items-center gap-3 min-h-7">
                    <UCheckbox
                        v-if="selecting"
                        :model-value="selected.has(item.id)"
                        :disabled="!canSelect(item)"
                        :aria-label="t('app.settings.list.select')"
                        @update:model-value="on => toggle([item.id], on === true)"
                    />
                    <div class="flex-1 min-w-0">
                        <slot name="row" :item/>
                    </div>
                    <slot name="actions" :item/>
                </div>
            </SettingsRow>
        </template>
        <SettingsRow v-if="!shown.length" stacked>
            <p class="text-sm text-muted">{{ t('app.settings.list.noMatch') }}</p>
        </SettingsRow>
    </template>
</template>
