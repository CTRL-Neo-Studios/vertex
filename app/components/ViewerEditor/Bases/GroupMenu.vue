<script setup lang="ts">
import {runQuery, setGroupBy, setGroupOrder, toText} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {moved, useListDrag} from "~/composables/bases/useListDrag";

/** Obsidian's Group menu: the view's group property and direction; Manual shows a checklist of the groups. */
const {t} = useI18n()
const ctx = useBaseContext()

const open = computed({
    get: () => ctx.open.value === 'group',
    set: value => ctx.open.value = value ? 'group' : null,
})

const groupBy = computed(() => ctx.view.value.groupBy)
const order = computed(() => ctx.view.value.groupOrder)
const manual = computed(() => Array.isArray(order.value))
const name = () => ctx.view.value.name
const commit = (next: ReturnType<typeof setGroupBy>) => ctx.commit(next)

const directions = computed(() => {
    const kind = groupBy.value ? ctx.property(groupBy.value.property).kind : 'text'
    const key = kind === 'number' || kind === 'date' ? kind : 'text'
    return [
        {label: t(`app.editor.ui.bases.directions.${key}.asc`), value: 'ASC'},
        {label: t(`app.editor.ui.bases.directions.${key}.desc`), value: 'DESC'},
        {label: t('app.editor.ui.bases.manual'), value: 'manual'},
    ]
})

function pickProperty(property: string) {
    commit(setGroupBy(ctx.base.value, name(), {property, direction: groupBy.value?.direction ?? 'ASC'}))
}

function pickDirection(value: string) {
    if (!groupBy.value) return
    if (value === 'manual') return commit(setGroupOrder(ctx.base.value, name(), []))
    const next = setGroupBy(ctx.base.value, name(), {...groupBy.value, direction: value as 'ASC' | 'DESC'})
    commit(setGroupOrder(next, name(), null))
}

// Removing the grouping removes `groupOrder` too (the library does it, as Obsidian does).
const remove = () => commit(setGroupBy(ctx.base.value, name(), null))

/** `groupOrder` entries as the list compares them: text, or null for the group without a value. */
const raw = (value: unknown) => (value === null || value === undefined ? null : String(value))

// Every group the view has, hidden ones included: the view's query without `groupOrder`.
const allGroups = computed(() => {
    if (!open.value || !manual.value) return []
    const result = runQuery(setGroupOrder(ctx.base.value, name(), null), name(), {host: ctx.host, paths: ctx.paths.value, now: Date.now(), thisPath: ctx.thisPath, search: ctx.search.value})
    return result.groups.map((group) => {
        const text = group.key === null ? '' : toText(group.key)
        return {key: text === '' ? null : text, count: group.rows.length}
    })
})

/** Checked groups in `groupOrder` order (named groups without rows too), then the unchecked ones. */
const items = computed(() => {
    const shown = (order.value ?? []).map(raw)
    const count = (key: string | null) => allGroups.value.find(g => g.key === key)?.count ?? 0
    return [
        ...shown.map(key => ({key, count: count(key), checked: true})),
        ...allGroups.value.filter(g => !shown.includes(g.key)).map(g => ({...g, checked: false})),
    ]
})

const writeOrder = (keys: (string | null)[]) => commit(setGroupOrder(ctx.base.value, name(), keys))
const writeChecked = (list: typeof items.value) => writeOrder(list.filter(g => g.checked).map(g => g.key))

const {bind, over} = useListDrag((from, to) => writeChecked(moved(items.value, from, to)))

function toggle(index: number) {
    const item = items.value[index]!
    writeChecked([...items.value.toSpliced(index, 1).filter(g => g.checked), ...(item.checked ? [] : [{...item, checked: true}])])
}

const adding = ref(false)
const newGroup = ref('')
function addGroup() {
    const text = newGroup.value.trim()
    adding.value = false
    newGroup.value = ''
    if (!text || items.value.some(g => g.key === text && g.checked)) return
    writeOrder([...items.value.filter(g => g.checked && g.key !== text).map(g => g.key), text])
}

const allShown = computed(() => items.value.every(g => g.checked))
</script>

<template>
    <UPopover v-model:open="open">
        <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-stretch-horizontal" :label="t('app.editor.ui.bases.group')"/>
        <template #content>
            <div class="w-[300px] p-2 flex flex-col gap-1">
                <div class="text-xs font-medium text-muted px-1">{{ t('app.editor.ui.bases.groupBy') }}</div>
                <div class="flex items-center gap-1">
                    <ViewerEditorBasesPropertySelect :model-value="groupBy?.property" class="grow min-w-0" @update:model-value="id => id && pickProperty(id)"/>
                    <template v-if="groupBy">
                        <USelect
                            :model-value="manual ? 'manual' : groupBy.direction"
                            :items="directions"
                            size="sm"
                            color="neutral"
                            variant="subtle"
                            class="w-28"
                            @update:model-value="pickDirection"
                        />
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-trash-2" @click="remove"/>
                    </template>
                </div>
                <template v-if="groupBy && manual">
                    <USeparator class="my-1"/>
                    <div
                        v-for="(item, i) in items"
                        :key="String(item.key)"
                        v-bind="bind(i)"
                        class="flex items-center gap-2 px-1 py-0.5 rounded text-sm"
                        :class="{'ring-1 ring-primary': over === i}"
                    >
                        <UIcon name="i-lucide-grip-vertical" class="size-4 shrink-0 text-dimmed cursor-grab"/>
                        <UCheckbox :model-value="item.checked" @update:model-value="toggle(i)"/>
                        <span class="grow truncate" :class="{'text-muted': item.key === null}">{{ item.key ?? t('app.editor.ui.bases.none') }}</span>
                        <span class="text-xs text-dimmed">{{ item.count }}</span>
                    </div>
                    <UInput
                        v-if="adding"
                        v-model="newGroup"
                        size="sm"
                        autofocus
                        :placeholder="t('app.editor.ui.bases.groupName')"
                        @keydown.enter="addGroup"
                        @keydown.esc.stop="adding = false"
                        @blur="addGroup"
                    />
                    <UButton v-else size="sm" color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('app.editor.ui.bases.addGroup')" @click="adding = true"/>
                    <UButton
                        v-if="allShown"
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-eye-off"
                        :label="t('app.editor.ui.bases.hideAll')"
                        @click="writeOrder([])"
                    />
                    <UButton
                        v-else
                        size="sm"
                        color="neutral"
                        variant="ghost"
                        icon="i-lucide-eye"
                        :label="t('app.editor.ui.bases.showAll')"
                        @click="writeOrder(items.map(g => g.key))"
                    />
                </template>
            </div>
        </template>
    </UPopover>
</template>
