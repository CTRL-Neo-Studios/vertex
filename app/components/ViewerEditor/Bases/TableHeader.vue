<script setup lang="ts">
import type {ContextMenuItem} from "@nuxt/ui";
import {setGroupBy, setOrder, setSort, toggleSort, type Base, type PropertyOrder, type RowScope} from "@type32/obsidian-bases-parser";
import {useBaseContext} from "~/composables/bases/useBaseContext";
import {afterOverlaysClose} from "~/utils/overlays";

/**
 * A Bases table header cell, as Obsidian's: icon, label, sort chevron, resize handle. Click toggles the sort,
 * dragging onto another header moves the column, right-click opens Obsidian's column menu.
 */
const props = defineProps<{ id: string, width: number, rows: RowScope[] }>()
const emit = defineEmits<{ resize: [width: number], resizeEnd: [width: number] }>()

const {t} = useI18n()
const ctx = useBaseContext()

const DRAG_TYPE = 'application/x-bases-column'
const MIN_WIDTH = 40

const property = computed(() => ctx.property(props.id))
const same = (id: string) => ctx.property(id).id === property.value.id
const order = computed(() => ctx.view.value.order ?? ['file.name'])
const sort = computed(() => ctx.view.value.sort ?? [])
const direction = computed(() => sort.value.find(s => same(s.property))?.direction)

const write = (edit: (base: Base, view: string) => Base) => ctx.commit(edit(ctx.base.value, ctx.view.value.name))

const sortBy = (dir: PropertyOrder['direction']) =>
    write((b, v) => setSort(b, v, [{property: props.id, direction: dir}, ...sort.value.filter(s => !same(s.property))]))

const summarizing = ref(false)
const header = useTemplateRef<HTMLElement>('header')

const items = computed<ContextMenuItem[][]>(() => [
    [
        {label: t('app.editor.ui.bases.hideColumn'), icon: 'i-lucide-eye-off', onSelect: () => write((b, v) => setOrder(b, v, order.value.filter(o => !same(o))))},
        // Deferred so the closing menu's focus return doesn't dismiss the popover as it opens.
        {label: t('app.editor.ui.bases.summarize'), icon: 'i-lucide-calculator', onSelect: () => void afterOverlaysClose(() => summarizing.value = true)},
        ...(property.value.source === 'file' ? [] : [{
            label: t('app.editor.ui.bases.groupByThis'),
            icon: 'i-lucide-group',
            onSelect: () => write((b, v) => setGroupBy(b, v, {property: props.id, direction: 'ASC'})),
        }]),
    ],
    [
        {label: t('app.editor.ui.bases.sortAsc'), icon: 'i-lucide-arrow-down-wide-narrow', onSelect: () => sortBy('ASC')},
        {label: t('app.editor.ui.bases.sortDesc'), icon: 'i-lucide-arrow-up-narrow-wide', onSelect: () => sortBy('DESC')},
        ...(direction.value ? [{
            label: t('app.editor.ui.bases.clearSort'),
            onSelect: () => write((b, v) => setSort(b, v, sort.value.filter(s => !same(s.property)))),
        }] : []),
    ],
    [{
        label: t(property.value.source === 'formula' ? 'app.editor.ui.bases.editFormulaMenu' : 'app.editor.ui.bases.editPropertyMenu'),
        icon: 'i-lucide-edit-3',
        onSelect: () => {
            ctx.propertyPage.value = property.value.id
            ctx.open.value = 'properties'
        },
    }],
])

// Column drag: drop on the header's left half to land before it, right half after.
const dropSide = ref<'before' | 'after' | null>(null)
const resizing = ref(false)

function onDragStart(e: DragEvent) {
    if (resizing.value) return e.preventDefault()
    e.dataTransfer?.setData(DRAG_TYPE, props.id)
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    dropSide.value = e.clientX - rect.left < rect.width / 2 ? 'before' : 'after'
}

function onDragLeave(e: DragEvent) {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dropSide.value = null
}

function onDrop(e: DragEvent) {
    const side = dropSide.value
    dropSide.value = null
    const source = e.dataTransfer?.getData(DRAG_TYPE)
    if (!source || !side || same(source)) return
    e.preventDefault()
    const sourceId = ctx.property(source).id
    const rest = order.value.filter(o => ctx.property(o).id !== sourceId)
    const moving = order.value.find(o => ctx.property(o).id === sourceId) ?? source
    const at = rest.findIndex(o => same(o)) + (side === 'after' ? 1 : 0)
    write((b, v) => setOrder(b, v, rest.toSpliced(at, 0, moving)))
}

// Resize: the handle captures the pointer; the grid owns the width and writes it on release.
let startX = 0
let startWidth = 0
let lastWidth = 0

function onResizeStart(e: PointerEvent) {
    resizing.value = true
    startX = e.clientX
    startWidth = lastWidth = props.width
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onResizeMove(e: PointerEvent) {
    if (!resizing.value) return
    lastWidth = Math.max(MIN_WIDTH, startWidth + e.clientX - startX)
    emit('resize', lastWidth)
}

function onResizeEnd() {
    if (!resizing.value) return
    resizing.value = false
    emit('resizeEnd', lastWidth)
}
</script>

<template>
    <UContextMenu :items="items" size="sm">
        <div
            ref="header"
            draggable="true"
            class="relative flex items-center gap-1.5 h-[30px] px-2 text-sm text-muted select-none cursor-pointer hover:bg-elevated/50"
            :class="{'shadow-[inset_2px_0_0_var(--ui-primary)]': dropSide === 'before', 'shadow-[inset_-2px_0_0_var(--ui-primary)]': dropSide === 'after'}"
            :style="{width: `${width}px`}"
            @click="write((b, v) => toggleSort(b, v, id))"
            @dragstart="onDragStart"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <UIcon :name="property.icon" class="size-4 shrink-0"/>
            <span class="grow min-w-0 truncate">{{ property.label }}</span>
            <UIcon
                v-if="direction"
                :name="direction === 'ASC' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
                class="size-4 shrink-0"
            />
            <div
                class="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-primary/50"
                :class="{'bg-primary/50': resizing}"
                @click.stop
                @pointerdown.stop="onResizeStart"
                @pointermove="onResizeMove"
                @pointerup="onResizeEnd"
                @pointercancel="onResizeEnd"
            />
            <UPopover v-model:open="summarizing" :reference="header ?? undefined">
                <template #content>
                    <ViewerEditorBasesSummaryPicker :id="id" :rows="rows" @close="summarizing = false"/>
                </template>
            </UPopover>
        </div>
    </UContextMenu>
</template>
