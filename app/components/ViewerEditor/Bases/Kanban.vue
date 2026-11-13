<script setup lang="ts">
import type {ContextMenuItem} from "@nuxt/ui";
import {setGroupOrder, toText, type QueryGroup, type Value} from "@type32/obsidian-bases-parser";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {bareId, useBaseContext} from "~/composables/bases/useBaseContext";
import {useNoteProperties} from "~/composables/bases/useNoteProperties";
import {afterOverlaysClose} from "~/utils/overlays";

/**
 * Obsidian's kanban layout: a column per group of `groupBy` (the group without a value first, unless `groupOrder`
 * orders them), `columnWidth` wide, each with its count, its cards (`Card`, covers 0.5 of the width by default) and
 * "New". Grouped by a note property, dragging a card to another column writes that property (a list replaces the
 * whole value); grouped by `file.folder`, it moves the file there. Columns drag to reorder (`groupOrder`). Grouped by a
 * formula or another file property, nothing moves.
 */
const {t} = useI18n()
const ctx = useBaseContext()
const notes = useNoteProperties(ctx.session)
const tools = useActiveWorkspaceTools(ctx.session)
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)

const view = computed(() => ctx.view.value)
const property = computed(() => view.value.groupBy?.property ?? null)
const width = computed(() => (typeof view.value.columnWidth === 'number' ? view.value.columnWidth : 280))
const byFolder = computed(() => property.value === 'file.folder')
const movable = computed(() => !!property.value && (byFolder.value || ctx.property(property.value).source === 'note'))
const hidden = computed(() => Array.isArray(view.value.groupOrder) && view.value.groupOrder.length === 0)

const columns = computed(() => {
    const groups = ctx.result.value.groups
    if (Array.isArray(view.value.groupOrder)) return groups
    return [...groups.filter(g => g.key === null), ...groups.filter(g => g.key !== null)]
})

/** A group as `groupOrder` lists it: its text, or null for the group without a value. */
const keyOf = (group: QueryGroup) => (group.key === null ? null : toText(group.key))

/** A group's value as written to a note: text, numbers and checkboxes as they are, a list item by item, tags without `#`. */
function raw(value: Value | null): unknown {
    if (value === null || value.type === 'Null') return null
    if (value.type === 'String') return value.tag ? value.value.replace(/^#/, '') : value.value
    if (value.type === 'Number' || value.type === 'Boolean') return value.value
    if (value.type === 'List') return value.items.map(raw)
    if (value.type === 'Link') return `[[${value.path}]]`
    return toText(value)
}

async function moveTo(path: string, group: QueryGroup) {
    if (byFolder.value) {
        const node = getFileByPath(`${ctx.session.rootPath}/${path}`)
        const folder = keyOf(group)
        if (node) await tools.moveFiles([node.uuid], !folder || folder === '/' ? ctx.session.rootPath! : `${ctx.session.rootPath}/${folder}`)
        return
    }
    if (path.endsWith('.md')) await notes.setProperties([{path, key: bareId(property.value!), value: raw(group.key)}])
}

function newItem(group: QueryGroup) {
    if (movable.value) ctx.newItemPreset.value = {key: byFolder.value ? 'file.folder' : bareId(property.value!), value: byFolder.value ? keyOf(group) : raw(group.key)}
    ctx.open.value = 'new'
}

const writeOrder = (keys: (string | null)[]) => ctx.commit(setGroupOrder(ctx.base.value, view.value.name, keys))

// Dragging: a card (its path) onto a column, or a column (its index) onto another.
const CARD = 'application/x-bases-card', COLUMN = 'application/x-bases-column'
const over = ref<number | null>(null)
function onDragOver(event: DragEvent, index: number) {
    const types = event.dataTransfer?.types ?? []
    if (!movable.value || !(types.includes(CARD) || types.includes(COLUMN))) return
    event.preventDefault()
    over.value = index
}
async function onDrop(event: DragEvent, index: number) {
    over.value = null
    const card = event.dataTransfer?.getData(CARD), column = event.dataTransfer?.getData(COLUMN)
    if (card) return moveTo(card, columns.value[index]!)
    if (column) {
        const keys = columns.value.map(keyOf), from = Number(column)
        writeOrder(keys.toSpliced(from, 1).toSpliced(index, 0, keys[from]!))
    }
}

function menu(group: QueryGroup, index: number): ContextMenuItem[][] {
    return [
        ...(movable.value ? [[{label: t('app.editor.ui.bases.addItem'), icon: 'i-lucide-plus', onSelect: () => void afterOverlaysClose(() => newItem(group))}]] : []),
        [
            {label: t('app.editor.ui.bases.hideColumn'), icon: 'i-lucide-eye-off', onSelect: () => writeOrder(columns.value.map(keyOf).toSpliced(index, 1))},
            {label: t('app.editor.ui.bases.editGroups'), icon: 'i-lucide-stretch-horizontal', onSelect: () => void afterOverlaysClose(() => ctx.open.value = 'group')},
        ],
    ]
}
</script>

<template>
    <div v-if="!property || hidden" class="flex-1 flex flex-col items-center justify-center gap-1 text-sm">
        <div class="font-medium">{{ t(hidden ? 'app.editor.ui.bases.noColumns' : 'app.editor.ui.bases.addColumns') }}</div>
        <div class="text-muted">{{ t(hidden ? 'app.editor.ui.bases.noColumnsHint' : 'app.editor.ui.bases.addColumnsHint') }}</div>
        <UButton
            class="mt-2"
            size="sm"
            color="neutral"
            variant="subtle"
            :label="t(hidden ? 'app.editor.ui.bases.editGroups' : 'app.editor.ui.bases.chooseProperty')"
            @click="ctx.open.value = 'group'"
        />
    </div>
    <div v-else class="flex-1 min-h-0 flex gap-2 overflow-x-auto p-3 text-sm">
        <div
            v-for="(group, index) in columns"
            :key="String(keyOf(group))"
            class="flex flex-col shrink-0 min-h-0 rounded-2xl bg-elevated/60"
            :class="{'ring-2 ring-primary': over === index}"
            :style="{width: `${width}px`}"
            @dragover="event => onDragOver(event, index)"
            @dragleave="over = null"
            @drop="event => onDrop(event, index)"
        >
            <UContextMenu :items="menu(group, index)" size="sm">
                <div
                    class="group flex items-center gap-2 px-3 h-11 shrink-0"
                    :draggable="movable"
                    @dragstart="event => event.dataTransfer?.setData(COLUMN, String(index))"
                >
                    <span v-if="group.key?.type === 'List'" class="flex gap-1 min-w-0 overflow-hidden">
                        <UBadge
                            v-for="(item, i) in group.key.items"
                            :key="i"
                            :label="item.type === 'String' && item.tag ? item.value.slice(1) : toText(item)"
                            color="primary"
                            variant="soft"
                            size="sm"
                            class="shrink-0"
                        />
                    </span>
                    <span v-else class="font-semibold truncate">{{ group.key === null ? t('app.editor.ui.bases.none') : toText(group.key) }}</span>
                    <span class="text-muted shrink-0">{{ group.rows.length }}</span>
                    <div class="grow"/>
                    <UButton
                        v-if="movable"
                        icon="i-lucide-plus"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        class="invisible group-hover:visible"
                        :aria-label="t('app.editor.ui.bases.createNote')"
                        @click="newItem(group)"
                    />
                </div>
            </UContextMenu>
            <div class="flex-1 min-h-0 overflow-y-auto px-2 flex flex-col gap-2">
                <!-- content-visibility lets the browser skip laying out cards far down a long column. -->
                <ViewerEditorBasesCard
                    v-for="row in group.rows"
                    :key="row.path"
                    :row="row"
                    :default-ratio="0.5"
                    class="shrink-0 pb-2 [content-visibility:auto] [contain-intrinsic-size:auto_42px]"
                    :draggable="movable"
                    @dragstart="(event: DragEvent) => event.dataTransfer?.setData(CARD, row.path)"
                />
            </div>
            <UButton
                v-if="movable"
                class="m-2 self-start"
                icon="i-lucide-plus"
                size="sm"
                color="neutral"
                variant="ghost"
                :label="t('app.editor.ui.bases.new')"
                @click="newItem(group)"
            />
        </div>
    </div>
</template>
