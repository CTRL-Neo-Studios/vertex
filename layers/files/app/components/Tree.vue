<script setup lang="ts">
import type {TreeItem, TreeProps} from '@nuxt/ui';
import {platform} from "@tauri-apps/plugin-os"
import type {SessionContext, UITreeNode} from "#shared/plugin/api";
import {useScrollFade} from "~/plugin/ui";
import {filesContext} from "../plugin";

/** The workspace's files as a tree: selection, drag select, moves and drops; the menu and file operations are the kernel's. */
const props = defineProps<{ session: SessionContext }>()

const {t} = useI18n()
const toast = useToast()
const files = props.session.files
const byUuid = (id: string | undefined) => (id === undefined ? undefined : props.session.index.byUuid(id))
const config = computed(() => filesContext().config.value)
const activeTabUuid = computed(() => props.session.tabs.active())
// Open folders are the session's: saved with it and restored after a relaunch.
const expandedFolders = files.openFolders

const extOf = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot + 1).toLowerCase() : 'unknown'
}
const withoutExt = (name: string) => {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(0, dot) : name
}
const parentOf = (path: string) => path.slice(0, Math.max(path.lastIndexOf('/'), 0))
/** Where something dropped on or pasted at a row goes: into a folder, or next to a file. */
const folderOf = (node: { isFolder: boolean, relativePath: string } | undefined) =>
    !node ? '' : node.isFolder ? node.relativePath : parentOf(node.relativePath)

const formattedTreeData = computed<TreeItem[]>(() => {
    const build = (nodes: UITreeNode[]): TreeItem[] => nodes.map(node => {
        const item: TreeItem = {
            id: node.uuid,
            label: node.fileName,
            icon: files.iconFor(node.fileName) ?? node.icon,
            children: build(node.children),
            onSelect(e) {
                e.preventDefault()
                if (select(node.uuid, e.detail.originalEvent) && !node.isFolder) void props.session.tabs.open(node.uuid)
            },
            // A click with a modifier only selects: the folder stays open or closed.
            onToggle(e) {
                const ev = e.detail.originalEvent
                if (ev.shiftKey || toggleKey(ev)) e.preventDefault()
            },
            slot: node.isFolder ? 'folder' as const : 'file' as const,
            // A folder's row is its slot's element edge to edge, so all of it can be dragged and highlighted.
            ui: node.isFolder ? {link: 'py-0 pe-0'} : undefined,
        }
        return item
    })
    return build(props.session.index.tree())
})

// Selection, as in a file manager: a plain click selects one row (and opens a file or toggles a folder),
// Cmd (macOS) or Ctrl toggles a row, Shift selects the range from the anchor over the rows as shown. Reka's tree
// gets the selection only to mark rows (`data-selected`, `aria-selected`); its own select is prevented.
const mac = platform() === 'macos'
const toggleKey = (e: MouseEvent | KeyboardEvent) => mac ? e.metaKey : e.ctrlKey
const selected = shallowRef(new Set<string>())
const selectedItems = computed(() => [...selected.value].map(id => ({id})))
let anchor: string | undefined

/** The rows as shown: inside expanded folders only. */
function shownIds() {
    const open = new Set(expandedFolders.value), ids: string[] = []
    const walk = (items: TreeItem[]) => {
        for (const item of items) {
            ids.push(item.id)
            if (item.children && open.has(item.id)) walk(item.children)
        }
    }
    walk(formattedTreeData.value)
    return ids
}

/** Applies a click to the selection; true for a plain one, which also opens or toggles the row. */
function select(id: string, e: MouseEvent | KeyboardEvent) {
    const adding = toggleKey(e)
    if (e.shiftKey) {
        const ids = shownIds(), from = anchor ? ids.indexOf(anchor) : -1, to = ids.indexOf(id)
        const range = from === -1 ? [id] : ids.slice(Math.min(from, to), Math.max(from, to) + 1)
        selected.value = new Set(adding ? [...selected.value, ...range] : range)
        return false
    }
    anchor = id
    if (adding) {
        const next = new Set(selected.value)
        if (!next.delete(id)) next.add(id)
        selected.value = next
        return false
    }
    selected.value = new Set([id])
    return true
}

// No action reaches rows you can't see: collapsing a folder deselects what's inside it, and removed files drop out.
// Only a collapse prunes by what's shown. An index change prunes only what's gone: a move re-indexes in steps (the
// row exists before its new folder lists it), and a moved row mustn't drop out halfway.
const keepSelected = (keep: (id: string) => boolean) => {
    if ([...selected.value].some(id => !keep(id))) selected.value = new Set([...selected.value].filter(keep))
}
watch(expandedFolders, () => {
    if (!selected.value.size) return
    const shown = new Set(shownIds())
    keepSelected(id => shown.has(id))
})
watch(formattedTreeData, () => {
    if (selected.value.size) keepSelected(id => !!byUuid(id))
})

function onBlankClick(event: MouseEvent) {
    if (!(event.target as Element | null)?.closest('li')) selected.value = new Set()
}

function onKeydown(event: KeyboardEvent) {
    const key = event.key.toLowerCase()
    if (event.key === 'Escape' && selected.value.size) {
        selected.value = new Set()
    } else if (toggleKey(event) && key === 'a') {
        event.preventDefault()
        selected.value = new Set(shownIds())
    } else if (toggleKey(event) && key === 'c' && selected.value.size) {
        event.preventDefault()
        clipboardOnce(() => files.copy([...selected.value]))
    } else if (toggleKey(event) && key === 'v') {
        event.preventDefault()
        clipboardOnce(pasteHere)
    } else if (selected.value.size && (event.key === 'Delete' || (mac && event.metaKey && event.key === 'Backspace'))) {
        event.preventDefault()
        void files.remove([...selected.value])
    } else if (toggleKey(event) && key === 'z') {
        // Files' own history; the editor's Cmd/Ctrl+Z never reaches the tree.
        event.preventDefault()
        void (event.shiftKey ? files.redo() : files.undo())
    } else if (!mac && event.ctrlKey && key === 'y') {
        event.preventDefault()
        void files.redo()
    }
}

// Copy and paste go through the system clipboard's file list (the kernel's `files.copy` and `files.paste`), into the
// selected folder, a selected file's folder, or the top level. On macOS the Edit menu's Copy/Paste can turn Cmd+C/V
// into a `copy`/`paste` event instead of a keydown: whichever arrives first acts.
let clipboardAt = 0
function clipboardOnce(run: () => unknown) {
    if (Date.now() - clipboardAt < 300) return
    clipboardAt = Date.now()
    void run()
}
function onClipboard(event: ClipboardEvent, run: () => unknown) {
    event.preventDefault()
    clipboardOnce(run)
}

/** Where Paste goes: the selected folder, a selected file's folder, or the top level. */
function pasteTarget() {
    return folderOf(byUuid(anchor && selected.value.has(anchor) ? anchor : selected.value.values().next().value))
}
async function pasteHere() {
    reveal(await files.paste(pasteTarget()))
}

/** The rows minus those inside another of them (they go with their folder). */
function topOf(ids: Iterable<string>) {
    const nodes = [...ids].map(byUuid).filter(n => !!n)
    return nodes.filter(n => !nodes.some(o => o.isFolder && n.relativePath.startsWith(`${o.relativePath}/`)))
}

/** Opens the folders `ids` are in and selects just them: what a paste, duplicate or drop made. */
function reveal(ids: string[]) {
    if (!ids.length) return
    const folders = ids.map(id => byUuid(id)?.relativePath).filter(p => p !== undefined).map(parentOf)
    folders.forEach(openDest)
    selected.value = new Set(ids)
    anchor = ids[0]
}

// One menu for the whole tree (a menu per row gave every row a menu root, and a virtual list remounts rows as it
// scrolls): the right-clicked row (`data-id`) picks its items before the menu opens.
const menuRow = shallowRef<string>()
function onContextMenu(event: MouseEvent) {
    const id = rowId(event)
    const item = id && byUuid(id) ? id : undefined
    // Right-clicking outside the selection selects just that row (or, on empty space, nothing).
    if (!item || !selected.value.has(item)) {
        selected.value = new Set(item ? [item] : [])
        anchor = item
    }
    menuRow.value = item
}
const fileIcon = (item: TreeItem) => {
    const custom = config.value.allowCustomFileIcons && item.icon
    return custom || (config.value.showDefaultFileIcons ? 'i-lucide-file' : '')
}
const menuItems = computed(() => files.menuFor(
    !menuRow.value ? [] : selected.value.size > 1 ? [...selected.value] : [menuRow.value],
    {added: reveal},
))

const treeRef = useTemplateRef<{ $el: HTMLElement }>('treeRef')
const fade = useScrollFade(() => treeRef.value?.$el)
// Typeahead (a key with the tree focused) reads each row's text. Nuxt UI hands Reka `getItemLabel(item.value)`, but
// the item is already the value, so every such key (Shift and Esc too) threw `value.toLowerCase`. Its `virtualize`
// object is bound after that prop, so this one wins; its type doesn't list the Reka props it forwards.
const TREE_VIRTUALIZE = {textContent: (item: TreeItem) => item.label ?? ''} as unknown as TreeProps['virtualize']
// Deep or long rows scroll sideways instead of truncating. The virtual list positions rows absolutely, so they can't
// size each other: every row is as wide as the widest one on screen (`--row-w`, at least the panel), so highlights
// span the whole scroll width. Measured from each row's icon and name (`data-grab`) plus its right-hand tag or arrow
// (`data-tail`, sticky at the panel's edge), which a stretched row doesn't change. A row whose name runs under its
// pinned tail gets `data-clip` and `--clip` (main.css), which fade the name out just before it. Set on the DOM, so
// nothing re-renders; on scroll it runs in the same frame, before paint.
const TREE_UI = {item: 'min-w-full w-(--row-w)'}
const fitRows = useRafFn(() => {
    fitRows.pause()
    const root = treeRef.value?.$el
    if (!root) return
    let width = 0
    for (const li of root.querySelectorAll('li')) {
        const grab = li.querySelector('[data-grab]')?.getBoundingClientRect(), tail = li.querySelector('[data-tail]')?.getBoundingClientRect()
        if (!grab) continue
        // Name, spacer and tail are flex items with 6 px gaps, then the row's 10 px end padding.
        width = Math.max(width, grab.right - li.getBoundingClientRect().left + (tail ? 12 + tail.width : 0) + 10)
        const clip = !!tail && grab.right > tail.left - 4
        li.toggleAttribute('data-clip', clip)
        if (clip) li.style.setProperty('--clip', `${tail!.left - 4 - grab.left}px`)
    }
    root.style.setProperty('--row-w', `${Math.ceil(width)}px`)
}, {immediate: false})
useMutationObserver(() => treeRef.value?.$el, () => fitRows.resume(), {childList: true, subtree: true, characterData: true})
useEventListener(() => treeRef.value?.$el, 'scroll', () => fitRows.resume(), {passive: true})
// A late web font changes the names' widths, and a resized panel which names run under their tag.
useEventListener(import.meta.client ? document.fonts : undefined, 'loadingdone', () => fitRows.resume())
useResizeObserver(() => treeRef.value?.$el, () => fitRows.resume())

// Drag select, as in a file manager's details view: a press on a row's blank part (not its icon and name, which drag
// it) or below the rows, moved past 4 px, draws a box; every row it touches is selected, or added with Cmd/Ctrl.
// Rows are found by index × row height over the rows as shown, so rows the virtual list has unmounted count too.
// The box is tracked in the tree's content coordinates (it stays put on auto-scroll) and drawn on the DOM.
const boxRef = useTemplateRef<HTMLElement>('boxRef')
/** `x`, `y`: where it started, in content coordinates; `sx`, `sy` and `cx`, `cy`: where it started and is, on screen. */
type Box = {x: number, y: number, sx: number, sy: number, cx: number, cy: number, active: boolean, adding: boolean, base: Set<string>, ids: string[], top: number, h: number}
let box: Box | undefined
let boxFrame = 0

function onBoxStart(event: PointerEvent) {
    const root = treeRef.value?.$el
    if (event.button !== 0 || !root || (event.target as Element | null)?.closest('[data-grab]')) return
    const r = root.getBoundingClientRect()
    // Not on the scrollbar.
    if (event.clientX - r.left > root.clientWidth || event.clientY - r.top > root.clientHeight) return
    const li = root.querySelector<HTMLElement>('li[data-index]')
    if (!li) return
    const h = li.getBoundingClientRect().height
    box = {
        x: event.clientX - r.left + root.scrollLeft, y: event.clientY - r.top + root.scrollTop,
        sx: event.clientX, sy: event.clientY, cx: event.clientX, cy: event.clientY,
        active: false, adding: toggleKey(event), base: selected.value, ids: shownIds(), h,
        top: li.getBoundingClientRect().top - r.top + root.scrollTop - Number(li.dataset.index) * h,
    }
}

function drawBox() {
    const root = treeRef.value?.$el, el = boxRef.value
    if (!box || !root || !el) return
    const r = root.getBoundingClientRect()
    const x = box.cx - r.left + root.scrollLeft, y = box.cy - r.top + root.scrollTop
    // On screen, clipped to the tree.
    const left = Math.max(Math.min(box.x, x) - root.scrollLeft + r.left, r.left), right = Math.min(Math.max(box.x, x) - root.scrollLeft + r.left, r.left + root.clientWidth)
    const top = Math.max(Math.min(box.y, y) - root.scrollTop + r.top, r.top), bottom = Math.min(Math.max(box.y, y) - root.scrollTop + r.top, r.top + root.clientHeight)
    el.style.cssText = `display: block; left: ${left}px; top: ${top}px; width: ${Math.max(0, right - left)}px; height: ${Math.max(0, bottom - top)}px`
    const first = Math.max(0, Math.floor((Math.min(box.y, y) - box.top) / box.h))
    const last = Math.min(box.ids.length - 1, Math.floor((Math.max(box.y, y) - box.top) / box.h))
    const hit = first <= last ? box.ids.slice(first, last + 1) : []
    const next = new Set(box.adding ? [...box.base, ...hit] : hit)
    // Only a change re-renders the tree.
    if (next.size !== selected.value.size || [...next].some(id => !selected.value.has(id))) selected.value = next
    anchor = hit[0] ?? anchor
}

/** Each frame while boxing: near the top or bottom edge the tree scrolls, and the box follows. */
function boxLoop() {
    const root = treeRef.value?.$el
    if (!box?.active || !root) return
    const {top, bottom} = root.getBoundingClientRect()
    if (box.cy < top + 40) root.scrollTop -= 12
    else if (box.cy > bottom - 40) root.scrollTop += 12
    drawBox()
    boxFrame = requestAnimationFrame(boxLoop)
}

useEventListener(window, 'pointermove', (event: PointerEvent) => {
    if (!box) return
    box.cx = event.clientX
    box.cy = event.clientY
    if (!box.active && Math.hypot(event.clientX - box.sx, event.clientY - box.sy) > 4) {
        box.active = true
        boxFrame = requestAnimationFrame(boxLoop)
    }
})
useEventListener(window, 'pointerup', () => {
    if (box?.active) {
        // The click that ends a box isn't a row click (or a click below the rows, which would clear it). It follows
        // pointerup in the same task, so the swallow is dropped right after.
        const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault() }
        window.addEventListener('click', swallow, {capture: true, once: true})
        setTimeout(() => window.removeEventListener('click', swallow, {capture: true}))
    }
    cancelAnimationFrame(boxFrame)
    box = undefined
    if (boxRef.value) boxRef.value.style.display = 'none'
})
// The virtual tree draws rows flat: indents and the nesting guides (at each parent's icon) come from the level, as
// Nuxt UI's flat rows do for its own link (`sm`: 2.5 + 6 per level, in spacing units).
const indent = (level: number, extra = 0) => `calc(var(--spacing) * ${(level - 1) * 6 + 2.5 + extra})`
const guide = (parentLevel: number) => `calc(var(--spacing) * ${(parentLevel - 1) * 6 + 4.5})`

// Drag and drop, as in a file manager: onto a folder, into it; onto a file, into its folder; onto empty space, the
// workspace's top level. Dragging a selected row moves the whole selection (what's inside a selected folder goes
// with the folder); an unselected row is selected alone first. Rows carry `data-id`; the listeners sit on the tree,
// since a virtual list remounts rows.
const dragged = shallowRef<string[]>([])
/** Where the dragged rows would land, relative: a folder, `''` for the top level, `null` for nowhere. */
const dropDir = shallowRef<string | null>(null)
const rowId = (event: Event) => (event.target as Element | null)?.closest('li')?.querySelector<HTMLElement>('[data-id]')?.dataset.id
const destOf = (event: DragEvent) => folderOf(byUuid(rowId(event)))
/** No folder into itself or below it, and at least one item not already there (those stay put). */
function canDrop(uuids: string[], dest: string) {
    const nodes = uuids.map(byUuid).filter(n => !!n)
    if (nodes.some(n => n.isFolder && (dest === n.relativePath || dest.startsWith(`${n.relativePath}/`)))) return false
    return nodes.some(n => parentOf(n.relativePath) !== dest)
}
/**
 * The drop target's outline, by row: one `border-primary` box around the target folder's row (its top) and the rows
 * shown inside it (its sides, and the last one its bottom), over `bg-primary/10`.
 */
const dropEdges = computed(() => {
    const dir = dropDir.value, edges = new Map<string, string>()
    if (!dir) return edges
    const ids = shownIds()
    const start = ids.findIndex(id => byUuid(id)?.relativePath === dir)
    if (start === -1) return edges
    let end = start
    while (end + 1 < ids.length && byUuid(ids[end + 1])?.relativePath.startsWith(`${dir}/`)) end++
    for (let i = start; i <= end; i++) {
        edges.set(ids[i]!, i === start && i === end ? 'border rounded-md' : i === start ? 'border-x border-t rounded-t-md' : i === end ? 'border-x border-b rounded-b-md' : 'border-x')
    }
    return edges
})

let opening: {id: string, timer: ReturnType<typeof setTimeout>} | undefined
/** A closed folder held under the pointer opens after a moment, so a drop can reach inside it. */
function openLater(id: string | undefined) {
    if (opening?.id === id) return
    clearTimeout(opening?.timer)
    opening = undefined
    if (!id || !byUuid(id)?.isFolder || expandedFolders.value.includes(id)) return
    opening = {id, timer: setTimeout(() => { expandedFolders.value = [...expandedFolders.value, id] }, 600)}
}

function onDragStart(event: DragEvent) {
    const id = rowId(event)
    if (!id || !event.dataTransfer) return
    if (!selected.value.has(id)) {
        selected.value = new Set([id])
        anchor = id
    }
    dragged.value = topOf(selected.value).map(n => n.uuid)
    files.drag.start(event, dragged.value, (event.target as Element | null)?.closest('li')?.querySelector('[data-grab]') ?? null, onDragEnd)
}

/** A drag of files from the OS (not one of the tree's own rows). */
const fromOs = (event: DragEvent) => !dragged.value.length && !!event.dataTransfer?.types.includes('Files')

function onDragOver(event: DragEvent) {
    const outside = fromOs(event)
    if (!dragged.value.length && !outside) return
    // The tree hides its scrollbar and a drag doesn't scroll it: near an edge, scroll.
    const el = treeRef.value?.$el
    if (el) {
        const {top, bottom} = el.getBoundingClientRect()
        if (event.clientY < top + 40) el.scrollTop -= 12
        else if (event.clientY > bottom - 40) el.scrollTop += 12
    }
    openLater(rowId(event))
    const dest = destOf(event)
    // What OS files are isn't known until the drop, so any folder takes them.
    dropDir.value = outside || canDrop(dragged.value, dest) ? dest : null
    if (dropDir.value === null) return
    event.preventDefault()
    // The native drag (`files.drag.start` in the app) only offers a copy, so a move under it says copy, or the drop is refused.
    if (event.dataTransfer) event.dataTransfer.dropEffect = event.dataTransfer.types.includes('Files') ? 'copy' : 'move'
}

function onDragLeave(event: DragEvent) {
    if (!treeRef.value?.$el.contains(event.relatedTarget as Node | null)) {
        dropDir.value = null
        openLater(undefined)
    }
}

function onDragEnd() {
    dragged.value = []
    dropDir.value = null
    openLater(undefined)
}
// The dragged row can scroll out of the virtual list and unmount, and then its `dragend` never reaches the tree.
useEventListener(window, 'dragend', onDragEnd)

async function onDrop(event: DragEvent) {
    const uuids = dragged.value, dest = dropDir.value, outside = fromOs(event)
    onDragEnd()
    if ((!uuids.length && !outside) || dest === null) return
    event.preventDefault()
    // OS files: copied in, or moved when they're already the workspace's (Option/Alt copies them anyway). Taken
    // while the event lasts.
    if (outside) return reveal(await files.importDrop(event.dataTransfer!, dest, {copy: event.altKey}))
    const name = uuids.length === 1 ? byUuid(uuids[0])?.fileName ?? '' : t('plugins.files.itemCount', {count: uuids.length})
    // Open the target first: the moved rows are shown there as they arrive, so they stay selected (a hidden row would
    // drop out of the selection; uuids don't change on a move).
    openDest(dest)
    try {
        await files.move(uuids, dest)
    } catch (error) {
        toast.add({title: t('plugins.files.moveFailed', {name}), description: String(error), color: 'error', icon: 'i-lucide-circle-x'})
    }
}

/** Opens the folder at `dest` (relative; `''` is the top level) so what lands there shows, and stays selected. */
function openDest(dest: string) {
    const folder = dest && props.session.index.byPath(`${props.session.session.rootPath}/${dest}`)?.uuid
    if (folder && !expandedFolders.value.includes(folder)) expandedFolders.value = [...expandedFolders.value, folder]
}
</script>

<template>
    <UContextMenu :items="menuItems" size="sm">
        <UTree
            ref="treeRef"
            :items="formattedTreeData"
            :virtualize="TREE_VIRTUALIZE"
            expanded-icon="i-lucide-folder-open"
            collapsed-icon="i-lucide-folder-closed"
            v-model:expanded="expandedFolders"
            multiple
            :model-value="selectedItems"
            color="neutral"
            :get-key="(i: TreeItem) => i.id as string"
            :class="['scrollbar-x h-full py-2.5 rounded-md', fade, dropDir === '' && 'ring-1 ring-inset ring-primary bg-primary/5']"
            :ui="TREE_UI"
            size="sm"
            @pointerdown="onBoxStart"
            @contextmenu.capture="onContextMenu"
            @click="onBlankClick"
            @keydown="onKeydown"
            @copy="(e: ClipboardEvent) => onClipboard(e, () => files.copy([...selected]))"
            @paste="(e: ClipboardEvent) => onClipboard(e, pasteHere)"
            @dragstart="onDragStart"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
        >
            <template #file-wrapper="{item, level}: {item: TreeItem, level: number}">
                <UButton
                    size="sm"
                    :data-id="item.id"
                    :data-level="level"
                    :variant="item.id == activeTabUuid ? 'soft' : 'ghost'"
                    :color="item.id == activeTabUuid ? 'primary' : 'neutral'"
                    :class="['select-none relative align-middle items-center justify-start text-left transition-all duration-300 after:transition-all after:duration-300 after:h-0 after:w-0 after:border-0 after:border-primary/0 after:left-0 after:absolute', item.id == activeTabUuid ? ' transition-all duration-300 after:absolute after:border-primary after:h-1/2 after:w-0 after:border-[1.5px] after:rounded-lg after:left-1.5' : 'data-selected:bg-elevated data-selected:text-highlighted']"
                    :style="{paddingInlineStart: indent(level, item.id == activeTabUuid ? 1.5 : 0)}"
                    block
                >
                    <template #leading>
                        <span v-for="k in level - 1" :key="k" class="absolute inset-y-0 border-s border-dotted border-muted pointer-events-none" :style="{insetInlineStart: guide(k)}"/>
                        <span v-if="dropEdges.has(item.id as string)" :class="['absolute inset-0 pointer-events-none bg-primary/10 border-primary', dropEdges.get(item.id as string)]"/>
                    </template>
                    <span data-grab draggable="true" class="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <UIcon v-if="fileIcon(item)" :name="fileIcon(item)" class="size-4 shrink-0"/>
                        {{ config.showFileExtInName ? item.label : withoutExt(item.label ?? '') }}
                    </span>
                    <template #trailing v-if="config.showFileExtAsTag">
                        <div class="grow"/>
                        <UBadge data-tail class="sticky right-2.5" size="xs" :color="item.id == activeTabUuid ? 'primary' : 'neutral'" :variant="item.id == activeTabUuid ? 'solid' : 'soft'" :label="`.${extOf(item.label ?? '')}`"/>
                    </template>
                </UButton>
            </template>
            <template #folder="{item, expanded, level}: {item: TreeItem, expanded: boolean, level: number}">
                <div :data-id="item.id" :data-level="level" class="inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none py-1.5 pe-2.5">
                    <span v-for="k in level - 1" :key="k" class="absolute inset-y-0 border-s border-dotted border-muted pointer-events-none" :style="{insetInlineStart: guide(k)}"/>
                    <span v-if="dropEdges.has(item.id as string)" :class="['absolute inset-0 pointer-events-none bg-primary/10 border-primary', dropEdges.get(item.id as string)]"/>
                    <span data-grab draggable="true" class="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <UIcon v-if="config.showDefaultFolderIcons" class="text-sm size-4 shrink-0" :name="(config.allowCustomFolderIcons && item.icon) ? item.icon : expanded ? 'i-lucide-folder-open' : 'i-lucide-folder-closed'" />
                        <span class="text-xs">{{ item.label }}</span>
                    </span>
                    <span class="grow"/>
                    <UIcon v-if="config.showFoldArrows" data-tail :class="['sticky right-2.5 text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up"/>
                </div>
            </template>
        </UTree>
    </UContextMenu>
    <!-- The drag-select box, on screen over the tree (`drawBox`). -->
    <Teleport to="body">
        <div ref="boxRef" class="fixed z-50 hidden pointer-events-none rounded-sm border border-primary bg-primary/10"/>
    </Teleport>
</template>
