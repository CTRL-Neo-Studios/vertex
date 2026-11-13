<script setup lang="ts">
import {readText, writeText} from "@tauri-apps/plugin-clipboard-manager";
import {setColumnSize, toDisplay, toText, type QueryGroup} from "@type32/obsidian-bases-parser";
import {bareId, fullId, useBaseContext} from "~/composables/bases/useBaseContext";
import {useNoteProperties} from "~/composables/bases/useNoteProperties";
import {cellEditable, cellText, cellValue} from "~/utils/basesCells";
import {layoutItems, LINE_HEIGHT, parseTsv, ROW_HEIGHTS, selectionRect, visibleRange, type Cell, type RowHeight} from "~/utils/basesGrid";

/**
 * Obsidian's table layout: a sticky header, rows in `order`'s columns with `columnSize` widths, group headings with
 * their summary rows, totals in a sticky footer. Rows are windowed (fixed heights). Cells are selected and edited with
 * Obsidian's table keys; group folds belong to the tab.
 * ponytail: rows are windowed, columns aren't (Obsidian windows both); window columns too if wide views get slow.
 */
const {t} = useI18n()
const ctx = useBaseContext()
const notes = useNoteProperties(ctx.session)

const view = computed(() => ctx.view.value)
const columns = computed(() => view.value.order ?? ['file.name'])
const rowHeightKey = computed<RowHeight>(() => (String(view.value.rowHeight ?? '') in ROW_HEIGHTS ? view.value.rowHeight as RowHeight : 'short'))
const rowHeight = computed(() => ROW_HEIGHTS[rowHeightKey.value])
const grouped = computed(() => !!view.value.groupBy)
const hasSummaries = computed(() => Object.keys(view.value.summaries ?? {}).length > 0)

// Folded groups, by their value's text.
const folded = ref(new Set<string>())
const groupKey = (group: QueryGroup) => (group.key === null ? '' : toText(group.key))
function toggleFold(group: QueryGroup) {
    const key = groupKey(group), next = new Set(folded.value)
    if (!next.delete(key)) next.add(key)
    folded.value = next
}

const layout = computed(() => layoutItems(ctx.result.value.groups, {
    grouped: grouped.value,
    summaries: hasSummaries.value,
    folded: i => folded.value.has(groupKey(ctx.result.value.groups[i]!)),
    rowHeight: rowHeight.value,
}))

// Column widths: `columnSize` (keys as written, `note.x`), the one being resized, or the content's width, as Obsidian
// fits an unsized column (40–300px): its values', and for file and note properties also its header's (icon and label);
// a formula's header doesn't count (observed: `num` stays 40px).
const scroller = useTemplateRef<HTMLDivElement>('scroller')
const live = ref<{ id: string, width: number } | null>(null)
let canvas: CanvasRenderingContext2D | null = null
function measure(texts: string[]) {
    if (!scroller.value) return 300
    canvas ??= document.createElement('canvas').getContext('2d')
    if (!canvas) return 300
    canvas.font = getComputedStyle(scroller.value).font
    return Math.max(0, ...texts.map(text => canvas!.measureText(text).width))
}
const HEADER_CHROME = 22 // the header's icon and gap
const fitted = computed(() => {
    void scroller.value
    // ponytail: measures up to 1000 rows; a huge base's later rows may be wider.
    const rows = ctx.result.value.rows.slice(0, 1000)
    return new Map(columns.value.map((id) => {
        const texts = rows.map((row) => {
            const value = row.property(id)
            return value.type === 'Null' ? '' : toDisplay(value)
        })
        const property = ctx.property(id)
        const header = property.source === 'formula' ? 0 : measure([property.label]) + HEADER_CHROME
        return [id, Math.round(Math.min(300, Math.max(40, measure(texts) + 24, header + 24)))]
    }))
})
const width = (id: string) => {
    if (live.value?.id === id) return live.value.width
    const sizes = (view.value.columnSize ?? {}) as Record<string, number>
    return sizes[fullId(id)] ?? sizes[id] ?? fitted.value.get(id) ?? 300
}
const totalWidth = computed(() => columns.value.reduce((sum, id) => sum + width(id), 0))
function resizeEnd(id: string, px: number) {
    live.value = null
    ctx.commit(setColumnSize(ctx.base.value, view.value.name, id, Math.round(px)))
}

// Windowing: only the lines on screen (and a few around) are rendered.
const {y: scrollTop} = useScroll(scroller)
const {height: viewportHeight} = useElementSize(scroller)
const range = computed(() => visibleRange(layout.value.tops, layout.value.height, scrollTop.value - LINE_HEIGHT, scrollTop.value + viewportHeight.value))
const shown = computed(() => layout.value.items.slice(range.value.from, range.value.to).map((item, i) => ({item, top: layout.value.tops[range.value.from + i]!})))

// Selection: an anchor and a focus cell over the flat rows (folded groups left out) and the columns.
const anchor = ref<Cell | null>(null)
const focus = ref<Cell | null>(null)
const editing = ref<Cell | null>(null)
const rect = computed(() => (anchor.value && focus.value ? selectionRect(anchor.value, focus.value) : null))
const selected = (row: number, column: number) => {
    const r = rect.value
    return !!r && row >= r.top && row <= r.bottom && column >= r.left && column <= r.right
}
const isFocus = (row: number, column: number) => focus.value?.row === row && focus.value.column === column
watch([() => ctx.view.value.name, () => layout.value.rows.length], () => {
    anchor.value = focus.value = editing.value = null
})

const lastRow = () => layout.value.rows.length - 1
const lastColumn = () => columns.value.length - 1
const clampCell = (cell: Cell): Cell => ({row: Math.min(Math.max(cell.row, 0), lastRow()), column: Math.min(Math.max(cell.column, 0), lastColumn())})

function scrollToRow(row: number) {
    const index = layout.value.items.findIndex(item => item.kind === 'row' && item.index === row)
    const el = scroller.value
    if (index < 0 || !el) return
    const top = layout.value.tops[index]!, bottom = top + rowHeight.value
    const visibleTop = el.scrollTop, visibleBottom = el.scrollTop + el.clientHeight - LINE_HEIGHT * (hasSummaries.value ? 2 : 1)
    if (top < visibleTop) el.scrollTop = top
    else if (bottom > visibleBottom) el.scrollTop += bottom - visibleBottom
}

function select(cell: Cell, extend = false) {
    if (lastRow() < 0) return
    const next = clampCell(cell)
    focus.value = next
    if (!extend || !anchor.value) anchor.value = next
    scrollToRow(next.row)
}

function onCellDown(event: MouseEvent, row: number, column: number) {
    if (editing.value) return
    if (!event.shiftKey && isFocus(row, column) && cellEditable(columns.value[column]!, layout.value.rows[row]!.path)) {
        editing.value = {row, column}
        return
    }
    // The table keeps the focus (its keys), not a link or checkbox in the cell; their clicks still happen.
    event.preventDefault()
    select({row, column}, event.shiftKey)
    scroller.value?.focus({preventScroll: true})
}

function doneEditing() {
    editing.value = null
    scroller.value?.focus({preventScroll: true})
}

/** The cells in the selection: each row with its column ids. */
function selection() {
    const r = rect.value
    if (!r) return []
    return layout.value.rows.slice(r.top, r.bottom + 1).map(row => ({row, ids: columns.value.slice(r.left, r.right + 1)}))
}

async function copy() {
    const text = selection().map(({row, ids}) => ids.map(id => cellText(row.property(id))).join('\t')).join('\n')
    if (text) await writeText(text)
}

/** Pasted cells from the focused one on; only note properties of notes take them. */
async function paste() {
    if (!focus.value) return
    const grid = parseTsv(await readText())
    const edits = grid.flatMap((line, dr) => line.flatMap((text, dc) => {
        const row = layout.value.rows[focus.value!.row + dr], id = columns.value[focus.value!.column + dc]
        if (!row || !id || !cellEditable(id, row.path)) return []
        return [{path: row.path, key: bareId(id), value: cellValue(ctx.property(id).kind, text)}]
    }))
    if (edits.length) await notes.setProperties(edits)
}

async function clear() {
    const edits = selection().flatMap(({row, ids}) => ids.filter(id => cellEditable(id, row.path)).map(id => ({path: row.path, key: bareId(id), value: null})))
    if (edits.length) await notes.setProperties(edits)
}

/** Enter: a checkbox toggles, a formula opens its editor, a note property is edited. */
async function enter() {
    if (!focus.value) return
    const id = columns.value[focus.value.column]!, row = layout.value.rows[focus.value.row]!
    if (id.startsWith('formula.')) {
        ctx.propertyPage.value = id
        ctx.open.value = 'properties'
        return
    }
    if (!cellEditable(id, row.path)) return
    const value = row.property(id)
    if (value.type === 'Boolean' || (value.type === 'Null' && ctx.property(id).kind === 'checkbox')) {
        await notes.setProperties([{path: row.path, key: bareId(id), value: !(value.type === 'Boolean' && value.value)}])
        return
    }
    editing.value = {...focus.value}
}

/** The rows of the focused row's group (⌘A selects them). */
function groupBounds(row: number) {
    const groupIndex = layout.value.items.find(item => item.kind === 'row' && item.index === row)?.groupIndex
    const indices = layout.value.items.flatMap(item => (item.kind === 'row' && item.groupIndex === groupIndex ? [item.index] : []))
    return {first: indices[0] ?? 0, last: indices.at(-1) ?? lastRow()}
}

function onKeydown(event: KeyboardEvent) {
    if (editing.value || event.target !== scroller.value) return
    const mod = event.metaKey || event.ctrlKey
    const f = focus.value
    const page = Math.max(1, Math.floor((scroller.value?.clientHeight ?? 0) / rowHeight.value) - 1)
    const handled = (() => {
        if (mod && event.key.toLowerCase() === 'z') return void (event.shiftKey ? notes.redo() : notes.undo())
        if (mod && event.key.toLowerCase() === 'c') return void copy()
        if (mod && event.key.toLowerCase() === 'v') return void paste()
        if (mod && event.key.toLowerCase() === 'a') {
            const {first, last} = groupBounds(f?.row ?? 0)
            anchor.value = {row: first, column: 0}
            focus.value = {row: last, column: lastColumn()}
            return
        }
        if (event.key === ' ' && event.ctrlKey && f) {
            anchor.value = {row: 0, column: f.column}
            focus.value = {row: lastRow(), column: f.column}
            return
        }
        if (event.key === ' ' && event.shiftKey && f) {
            anchor.value = {row: f.row, column: 0}
            focus.value = {row: f.row, column: lastColumn()}
            return
        }
        if (event.key === 'Escape') return void (anchor.value = focus.value = null)
        if (!f) {
            if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End', 'PageDown', 'PageUp'].includes(event.key)) return select({row: 0, column: 0})
            return false
        }
        const extend = event.shiftKey
        const edge = event.ctrlKey && event.shiftKey
        switch (event.key) {
            case 'ArrowDown': return select({row: edge ? lastRow() : f.row + 1, column: f.column}, extend)
            case 'ArrowUp': return select({row: edge ? 0 : f.row - 1, column: f.column}, extend)
            case 'ArrowRight': return select({row: f.row, column: edge ? lastColumn() : f.column + 1}, extend)
            case 'ArrowLeft': return select({row: f.row, column: edge ? 0 : f.column - 1}, extend)
            case 'Home': return select({row: f.row, column: 0}, extend)
            case 'End': return select({row: f.row, column: lastColumn()}, extend)
            case 'PageDown': return select({row: f.row + page, column: f.column}, extend)
            case 'PageUp': return select({row: f.row - page, column: f.column}, extend)
            case 'Tab': {
                const step = event.shiftKey ? -1 : 1
                const at = f.row * columns.value.length + f.column + step
                if (at < 0 || at > lastRow() * columns.value.length + lastColumn()) return
                return select({row: Math.floor(at / columns.value.length), column: at % columns.value.length})
            }
            case 'Enter': return void enter()
            case 'Backspace':
            case 'Delete': return void clear()
        }
        return false
    })()
    if (handled !== false) event.preventDefault()
}

const groupLabel = computed(() => (view.value.groupBy ? ctx.property(view.value.groupBy.property).label : ''))
</script>

<template>
    <div
        ref="scroller"
        tabindex="0"
        class="bases-table relative flex-1 min-h-0 overflow-auto text-sm outline-none"
        @keydown="onKeydown"
    >
        <div :style="{width: `${totalWidth}px`, minWidth: '100%'}">
            <div class="sticky top-0 z-20 flex bg-default border-b border-default" :style="{height: `${LINE_HEIGHT}px`}">
                <ViewerEditorBasesTableHeader
                    v-for="id in columns"
                    :key="id"
                    :id="id"
                    :width="width(id)"
                    :rows="ctx.result.value.rows"
                    @resize="px => live = {id, width: px}"
                    @resize-end="px => resizeEnd(id, px)"
                />
            </div>
            <div class="relative" :style="{height: `${layout.height}px`}">
                <div
                    v-for="{item, top} in shown"
                    :key="item.kind === 'row' ? `r${item.index}:${layout.rows[item.index]!.path}` : `${item.kind}${item.groupIndex}`"
                    class="absolute left-0 flex"
                    :style="{top: `${top}px`, height: `${item.kind === 'row' ? rowHeight : LINE_HEIGHT}px`, width: `${totalWidth}px`}"
                >
                    <button
                        v-if="item.kind === 'heading'"
                        class="sticky left-0 flex items-center gap-1.5 px-2 h-full text-sm"
                        @click="toggleFold(item.group)"
                    >
                        <span class="text-muted">{{ groupLabel }}</span>
                        <span class="font-semibold">{{ item.group.key === null ? t('app.editor.ui.bases.none') : toText(item.group.key) }}</span>
                        <UIcon name="i-lucide-chevron-down" class="size-4 text-dimmed transition-transform" :class="{'-rotate-90': folded.has(groupKey(item.group))}"/>
                    </button>
                    <template v-else-if="item.kind === 'summary'">
                        <div v-for="id in columns" :key="id" class="h-full border-b border-default shrink-0" :style="{width: `${width(id)}px`}">
                            <ViewerEditorBasesSummaryCell :id="id" :summaries="item.group.summaries" :rows="item.group.rows"/>
                        </div>
                    </template>
                    <template v-else>
                        <div
                            v-for="(id, column) in columns"
                            :key="id"
                            class="h-full shrink-0 overflow-hidden border-b border-e border-default/60"
                            :class="{
                                'bg-primary/10': selected(item.index, column),
                                'ring-2 ring-inset ring-primary': isFocus(item.index, column),
                            }"
                            :style="{width: `${width(id)}px`}"
                            @mousedown="event => onCellDown(event, item.index, column)"
                        >
                            <ViewerEditorBasesTableCell
                                :row="layout.rows[item.index]!"
                                :id="id"
                                :editing="editing?.row === item.index && editing.column === column"
                                :row-height="rowHeightKey"
                                @done="doneEditing"
                            />
                        </div>
                    </template>
                </div>
            </div>
            <div v-if="hasSummaries" class="sticky bottom-0 z-20 flex bg-default border-t border-default" :style="{height: `${LINE_HEIGHT}px`}">
                <div v-for="id in columns" :key="id" class="h-full shrink-0" :style="{width: `${width(id)}px`}">
                    <ViewerEditorBasesSummaryCell :id="id" :summaries="ctx.result.value.summaries" :rows="ctx.result.value.rows"/>
                </div>
            </div>
        </div>
    </div>
</template>
