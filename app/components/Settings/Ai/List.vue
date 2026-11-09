<script setup lang="ts" generic="T extends { id: string }">
import {ask} from "@tauri-apps/plugin-dialog";

/**
 * A searchable list with batch removal (model profiles, providers, a provider's models): a search field, a "select all
 * shown" checkbox and Remove selected (asks first), then a row per item matching the search, each with its checkbox.
 * `selectable` keeps an item out of the selection (the default profile).
 */
const props = defineProps<{
    items: T[]
    /** What the search matches, in any case. */
    text: (item: T) => string
    selectable?: (item: T) => boolean
    placeholder: string
    /** Shown when there are no items at all. */
    empty: string
    /** The question before removing `count` items. */
    confirm: (count: number) => string
}>()
const query = defineModel<string>('query', {default: ''})
const emit = defineEmits<{ remove: [ids: string[]] }>()
defineSlots<{
    row(props: { item: T }): unknown
    actions?(props: { item: T }): unknown
}>()
const {t} = useI18n()

const shown = computed(() => {
    const words = query.value.trim().toLowerCase()
    return words ? props.items.filter(item => props.text(item).toLowerCase().includes(words)) : props.items
})
const canSelect = (item: T) => props.selectable?.(item) ?? true
const selected = ref(new Set<string>())
// Items that went away (removed here or from another window) leave the selection.
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
async function removeSelected() {
    const ids = [...selected.value]
    if (!ids.length || !(await ask(props.confirm(ids.length), {kind: 'warning', okLabel: t('app.settings.ai.list.remove'), cancelLabel: t('app.generic.cancel')}))) return
    selected.value = new Set()
    emit('remove', ids)
}
</script>

<template>
    <div class="space-y-2">
        <div class="flex items-center gap-2 ps-3">
            <UCheckbox
                :model-value="allState"
                :disabled="!selectableShown.length"
                :aria-label="t('app.settings.ai.list.selectAll')"
                @update:model-value="on => toggle(selectableShown.map(item => item.id), on === true)"
            />
            <UInput v-model="query" class="flex-1" size="sm" icon="i-lucide-search" :placeholder/>
            <UButton
                v-if="selected.size"
                size="sm"
                color="error"
                variant="soft"
                icon="i-lucide-trash-2"
                :label="t('app.settings.ai.list.removeSelected', {count: selected.size})"
                @click="removeSelected"
            />
        </div>
        <div class="rounded-lg ring ring-default bg-default divide-y divide-default">
            <div v-for="item in shown" :key="item.id" class="flex items-center gap-3 px-3 py-2 min-h-12">
                <UCheckbox
                    :model-value="selected.has(item.id)"
                    :disabled="!canSelect(item)"
                    :aria-label="t('app.settings.ai.list.select')"
                    @update:model-value="on => toggle([item.id], on === true)"
                />
                <div class="flex-1 min-w-0">
                    <slot name="row" :item/>
                </div>
                <slot name="actions" :item/>
            </div>
            <p v-if="!shown.length" class="px-3 py-4 text-sm text-muted">{{ items.length ? t('app.settings.ai.list.noMatch') : empty }}</p>
        </div>
    </div>
</template>
