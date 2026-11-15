<script setup lang="ts">
import {StateKey} from "#shared/constants/app";
import type {TreeItem, TreeProps, ContextMenuItem} from '@nuxt/ui';
import type {UITreeNode} from '#shared/types/active/workspace';
import {isPropertiesFile, parentPathOf, PROPERTIES_FILE_NAMES} from "#shared/utils/index/parse";
import {fileNameFromPath, getFileExtensionFromPath, isBasesFile, isCanvasFile, isWorkflowFile} from "#shared/utils/fs/filenames";
import {writeText} from "@tauri-apps/plugin-clipboard-manager"
import {invoke, isTauri} from "@tauri-apps/api/core"
import {platform} from "@tauri-apps/plugin-os"
import NewFileModal from "~/components/Modals/NewFileModal.vue";
import DeleteFilesModal from "~/components/Modals/DeleteFilesModal.vue";
import RenameFileModal from "~/components/Modals/RenameFileModal.vue";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
import {useWorkflowRunner} from "~/composables/workflows/useWorkflowRunner";
import {useScrollFade} from "~/composables/utility/useScrollFade";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {FILES_DRAG, dragOut, outsideItems, outsideItemsAt, type OutsideItem} from "~/utils/outsideItems";

const {t} = useI18n()

/** `emptyMenu`: the right-click menu outside any row (the tree fills its panel, so it's the panel's too). */
const props = defineProps<{ nodes: UITreeNode[], sessionId: string, emptyMenu?: ContextMenuItem[][] }>()
const emit = defineEmits<{ (e: 'file-click', value: UITreeNode): void }>()

const $ovl = useOverlay()
const $navi = useAppNavigator()
const $opener = useAppOpener()
const session = useActiveSessions().getSession(props.sessionId)
const {openTab, openTabs, activeTabUuid} = useActiveTabs(session)
const {getFileByUuid, getFileByPath, getPropertiesFile, getFilteredFiles} = useActiveWorkspaceIndex(session)
const {createFile, moveFiles, importItems, deleteFiles, deletedFiles, undo, redo, undoLabel, redoLabel} = useActiveWorkspaceTools(session)
/** Delete: straight into a trash (the toast offers Undo), or after the dialog when it's for good (`fileConfig.deletedFiles`). */
function requestDelete(ids: string[]) {
    if (deletedFiles() === 'permanent') deleteFilesModal.open({fileIndexIds: ids})
    else void deleteFiles(ids)
}
const $qt = useQuickToasts()
// The workspace's own view settings, when it overrides them.
const config = useSettingsScope().effective
// Workflows run on a workspace folder; a session without one gets no run items.
const runner = session?.rootPath ? useWorkflowRunner(session) : undefined

const newFileModal = $ovl.create(NewFileModal)
const deleteFilesModal = $ovl.create(DeleteFilesModal)
const renameFileModal = $ovl.create(RenameFileModal)
const expandedFolders = useState<string[]>(StateKey.expandedFolders(props.sessionId), () => [])
// Once per index change, not per note row each time the tree renders.
const workflows = computed(() => getFilteredFiles(f => !f.isFolder && isWorkflowFile(getFileExtensionFromPath(f.fileName))))

const formattedTreeData = computed<TreeItem[]>(() => {
    const build = (nodes: UITreeNode[]): TreeItem[] => nodes.map(node => {
        const icon = isPropertiesFile(node.fileName) ? 'i-lucide-file-cog'
            : isWorkflowFile(getFileExtensionFromPath(node.fileName)) ? 'i-lucide-workflow'
            : isCanvasFile(getFileExtensionFromPath(node.fileName)) ? 'i-lucide-layout-dashboard'
            : isBasesFile(getFileExtensionFromPath(node.fileName)) ? 'i-lucide-table'
            : node.icon
        const item: TreeItem = {
            id: node.uuid,
            label: node.fileName,
            icon,
            children: node.children ? build(node.children) : undefined,
            onSelect(e) {
                e.preventDefault()
                if (select(node.uuid, e.detail.originalEvent) && !node.isFolder) emit('file-click', node)
            },
            // A click with a modifier only selects: the folder stays open or closed.
            onToggle(e) {
                const ev = e.detail.originalEvent
                if (ev.shiftKey || toggleKey(ev)) e.preventDefault()
            },
            slot: node.isFolder ? 'folder' as const : 'file' as const,
            // A folder's row is its slot's element edge to edge, so all of it can be dragged and highlighted.
            ui: node.isFolder ? {link: 'py-0 pe-0'} : undefined,
            originalNodeData: node,
        }
        return item
    })
    return build(props.nodes)
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
    if (selected.value.size) keepSelected(id => !!getFileByUuid(id))
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
        clipboardOnce(() => copySelection())
    } else if (toggleKey(event) && key === 'v') {
        event.preventDefault()
        clipboardOnce(() => pasteInto(pasteTarget()))
    } else if (selected.value.size && (event.key === 'Delete' || (mac && event.metaKey && event.key === 'Backspace'))) {
        event.preventDefault()
        requestDelete([...selected.value])
    } else if (toggleKey(event) && key === 'z') {
        // Files' own history; the editor's Cmd/Ctrl+Z never reaches the tree.
        event.preventDefault()
        void (event.shiftKey ? redo() : undo())
    } else if (!mac && event.ctrlKey && key === 'y') {
        event.preventDefault()
        void redo()
    }
}

// Copy and paste, as in a file manager, through the system clipboard's file list (Rust, `clipboard_files_*`): Copy
// puts the selection there as files, so Finder or Explorer can paste them too; Paste copies whatever files are there,
// copied in Vertex or in the OS, into the selected folder, a selected file's folder, or the top level. Pasting into the
// folder an item is in names the copy like Keep both, unasked ("Note 2.md"); elsewhere clashes ask.
// On macOS the Edit menu's Copy/Paste can turn Cmd+C/V into a `copy`/`paste` event instead of a keydown: whichever
// arrives first acts.
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

/** The given rows minus those inside another of them (they go with their folder). */
function topOf(ids: Iterable<string>) {
    const nodes = [...ids].map(id => getFileByUuid(id)).filter(n => !!n)
    return nodes.filter(n => !nodes.some(o => o.isFolder && n.relativePath.startsWith(`${o.relativePath}/`)))
}
const absOf = (rel: string) => rel ? `${session!.rootPath}/${rel}` : session!.rootPath!

async function copySelection(ids: Iterable<string> = selected.value) {
    const files = topOf(ids)
    if (!files.length) return
    try {
        await invoke('clipboard_files_set', {paths: files.map(f => f.fullPath)})
        $qt.success(t('app.editor.ui.filetree.copied', {count: files.length}))
    } catch (error) {
        $qt.error(t('app.editor.ui.filetree.copyFailed'), String(error))
    }
}

/** Where Paste goes (relative): the selected folder, a selected file's folder, or the top level. */
function pasteTarget() {
    const node = getFileByUuid(anchor && selected.value.has(anchor) ? anchor : selected.value.values().next().value)
    return !node ? '' : node.isFolder ? node.relativePath : parentPathOf(node.relativePath)
}

async function pasteInto(dest: string) {
    if (!session?.rootPath) return
    const paths = await invoke<string[]>('clipboard_files_get')
    if (!paths.length) return $qt.info(t('app.editor.ui.filetree.nothingToPaste'))
    await addInto(dest, await outsideItemsAt(paths), {copy: true, inPlace: true})
}

/** Copies of the rows next to them ("Note 2.md"), as pasting them into their own folders would make. */
async function duplicate(ids: Iterable<string>) {
    const byFolder = new Map<string, string[]>()
    for (const node of topOf(ids)) {
        const dir = parentPathOf(node.relativePath)
        byFolder.set(dir, [...byFolder.get(dir) ?? [], node.fullPath])
    }
    const made: string[] = []
    for (const [dir, paths] of byFolder) made.push(...await addInto(dir, await outsideItemsAt(paths), {copy: true, inPlace: true}, false))
    if (made.length) selectOnly(made)
}

function selectOnly(ids: string[]) {
    selected.value = new Set(ids)
    anchor = ids[0]
}

// One menu for the whole tree (a menu per row gave every row a menu root, and a virtual list remounts rows as it
// scrolls): the right-clicked row (`data-id`, `data-level`) picks its items before the menu opens.
const menuRow = shallowRef<{ item: TreeItem, level: number }>()
function findItem(items: TreeItem[], id: string): TreeItem | undefined {
    for (const item of items) {
        const found = item.id === id ? item : item.children && findItem(item.children, id)
        if (found) return found
    }
}
function onContextMenu(event: MouseEvent) {
    const row = (event.target as Element | null)?.closest('li')?.querySelector<HTMLElement>('[data-id]')
    const item = row?.dataset.id ? findItem(formattedTreeData.value, row.dataset.id) : undefined
    // Right-clicking outside the selection selects just that row (or, on empty space, nothing).
    if (!item || !selected.value.has(item.id)) {
        selected.value = new Set(item ? [item.id] : [])
        anchor = item?.id
    }
    menuRow.value = item && {item, level: Number(row!.dataset.level)}
}
const fileIcon = (item: TreeItem) => {
    const tree = config.value?.viewConfig.fileTree
    const custom = tree?.allowCustomFileIcons && item.icon
    return custom || (tree?.showDefaultFileIcons ? 'i-lucide-file' : '')
}
const menuItems = computed(() => {
    const row = menuRow.value
    if (!row) return [...props.emptyMenu ?? [], [pasteItem('')], [
        {label: undoLabel.value ? t('app.editor.ui.filetree.undoStep', {step: undoLabel.value}) : t('app.editor.ui.filetree.undo'), icon: 'i-lucide-undo-2', kbds: ['meta', 'z'], disabled: !undoLabel.value, onSelect: () => undo()},
        {label: redoLabel.value ? t('app.editor.ui.filetree.redoStep', {step: redoLabel.value}) : t('app.editor.ui.filetree.redo'), icon: 'i-lucide-redo-2', kbds: ['meta', 'shift', 'z'], disabled: !redoLabel.value, onSelect: () => redo()},
    ]]
    return selected.value.size > 1 ? getSelectionMenu([...selected.value]) : getItemContextMenu(row.item, row.level, (row.item.originalNodeData as UITreeNode).isFolder)
})
const copyItem = (ids: string[]): ContextMenuItem => ({label: t('app.editor.ui.filetree.copy'), icon: 'i-lucide-copy', kbds: ['meta', 'c'], onSelect: () => copySelection(ids)})
const pasteItem = (dest: string): ContextMenuItem => ({label: t('app.editor.ui.filetree.paste'), icon: 'i-lucide-clipboard-paste', kbds: ['meta', 'v'], onSelect: () => pasteInto(dest)})
const duplicateItem = (ids: string[]): ContextMenuItem => ({label: t('app.editor.ui.duplicate'), icon: 'i-lucide-files', onSelect: () => duplicate(ids)})

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
function destOf(event: DragEvent) {
    const node = getFileByUuid(rowId(event))
    return !node ? '' : node.isFolder ? node.relativePath : parentPathOf(node.relativePath)
}
/** No folder into itself or below it, and at least one item not already there (those stay put). */
function canDrop(uuids: string[], dest: string) {
    const nodes = uuids.map(id => getFileByUuid(id)).filter(n => !!n)
    if (nodes.some(n => n.isFolder && (dest === n.relativePath || dest.startsWith(`${n.relativePath}/`)))) return false
    return nodes.some(n => parentPathOf(n.relativePath) !== dest)
}
/**
 * The drop target's outline, by row: one `border-primary` box around the target folder's row (its top) and the rows
 * shown inside it (its sides, and the last one its bottom), over `bg-primary/10`.
 */
const dropEdges = computed(() => {
    const dir = dropDir.value, edges = new Map<string, string>()
    if (!dir) return edges
    const ids = shownIds()
    const start = ids.findIndex(id => getFileByUuid(id)?.relativePath === dir)
    if (start === -1) return edges
    let end = start
    while (end + 1 < ids.length && getFileByUuid(ids[end + 1])?.relativePath.startsWith(`${dir}/`)) end++
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
    if (!id || !getFileByUuid(id)?.isFolder || expandedFolders.value.includes(id)) return
    opening = {id, timer: setTimeout(() => { expandedFolders.value = [...expandedFolders.value, id] }, 600)}
}

// The drag image: the first item's icon and name, with two cards stacked behind and a count for more than one. It
// stays mounted off-screen and is filled in on the DOM, since `setDragImage` takes it within `dragstart`.
const ghostRef = useTemplateRef<HTMLElement>('ghostRef')
function fillGhost(grab: Element | null | undefined, count: number) {
    const ghost = ghostRef.value
    if (!ghost || !grab) return
    ghost.querySelector('[data-ghost-name]')!.replaceChildren(grab.cloneNode(true))
    const badge = ghost.querySelector<HTMLElement>('[data-ghost-count]')!
    badge.textContent = t('app.editor.ui.filetree.itemCount', {count})
    for (const el of [badge, ...ghost.querySelectorAll<HTMLElement>('[data-ghost-stack]')]) el.hidden = count < 2
    return ghost
}

/**
 * The filled ghost as a PNG data URL, for the native drag (`dragOut`), which takes an image rather than an element. A
 * webview can't snapshot DOM, so its cards, icon and text are drawn on a canvas from their laid-out boxes and styles.
 */
// ponytail: drawn at 1x (a PNG without a DPI is read as 72 dpi), so it's soft on a Retina screen; write a pHYs chunk if it matters.
async function ghostPng(ghost: HTMLElement) {
    const origin = ghost.getBoundingClientRect(), canvas = document.createElement('canvas')
    canvas.width = Math.ceil(origin.width)
    canvas.height = Math.ceil(origin.height)
    const ctx = canvas.getContext('2d')!
    const box = (el: Element | Range) => { const r = el.getBoundingClientRect(); return [r.x - origin.x, r.y - origin.y, r.width, r.height] as const }
    const shown = (el: Element) => !el.closest('[hidden]')
    for (const el of [...ghost.querySelectorAll('[data-ghost-stack], [data-ghost-card], [data-ghost-count]')].filter(shown)) {
        const s = getComputedStyle(el), [x, y, w, h] = box(el)
        ctx.beginPath()
        ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, parseFloat(s.borderTopLeftRadius))
        ctx.fillStyle = s.backgroundColor
        ctx.fill()
        if (parseFloat(s.borderTopWidth)) {
            ctx.strokeStyle = s.borderTopColor
            ctx.stroke()
        }
    }
    // An icon is a CSS mask (`--svg`): drawn, then filled with its colour.
    for (const icon of ghost.querySelectorAll('.iconify')) {
        const s = getComputedStyle(icon), url = /url\((['"]?)(.+)\1\)/.exec(s.getPropertyValue('--svg'))?.[2]
        if (!url) continue
        const image = new Image(), [x, y, w, h] = box(icon)
        image.src = url
        await image.decode().catch(() => {})
        const mask = document.createElement('canvas')
        mask.width = w
        mask.height = h
        const m = mask.getContext('2d')!
        m.drawImage(image, 0, 0, w, h)
        m.globalCompositeOperation = 'source-in'
        m.fillStyle = s.color
        m.fillRect(0, 0, w, h)
        ctx.drawImage(mask, x, y)
    }
    const texts = document.createTreeWalker(ghost, NodeFilter.SHOW_TEXT)
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        const text = node.textContent?.trim(), parent = node.parentElement!
        if (!text || !shown(parent)) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const s = getComputedStyle(parent), [x, y, , h] = box(range)
        ctx.font = `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`
        ctx.fillStyle = s.color
        ctx.textBaseline = 'middle'
        ctx.fillText(text, x, y + h / 2)
    }
    return canvas.toDataURL('image/png')
}

function onDragStart(event: DragEvent) {
    const id = rowId(event)
    if (!id || !event.dataTransfer) return
    if (!selected.value.has(id)) {
        selected.value = new Set([id])
        anchor = id
    }
    const ids = topOf(selected.value).map(n => n.uuid)
    dragged.value = ids
    const nodes = ids.map(i => getFileByUuid(i)).filter(n => !!n)
    const refs = nodes.map(n => n.isFolder ? `${n.relativePath}/` : n.relativePath)
    const ghost = fillGhost((event.target as Element | null)?.closest('li')?.querySelector('[data-grab]'), ids.length)
    // In Vertex, a native drag instead, which Finder or Explorer takes as files; back over Vertex it's still these rows
    // (`draggedRows`). The page never sees its `dragend`, so it ends through `dragOut`.
    if (isTauri() && ghost && session?.rootPath) {
        event.preventDefault()
        const root = session.rootPath
        void ghostPng(ghost).then(icon => dragOut(root, refs, icon, onDragEnd)).catch(error => {
            onDragEnd()
            $qt.error(t('app.editor.ui.filetree.dragFailed'), String(error))
        })
        return
    }
    // A move in the tree; a copy (attach, link) where chat or a note takes the rows.
    event.dataTransfer.effectAllowed = 'copyMove'
    // WebKit starts a drag only with some data set.
    event.dataTransfer.setData('text/plain', nodes.map(n => n.relativePath).join('\n'))
    event.dataTransfer.setData(FILES_DRAG, JSON.stringify(refs))
    if (ghost) event.dataTransfer.setDragImage(ghost, 12, 12)
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
    // The native drag (`dragOut`) only offers a copy, so a move under it says copy, or the drop is refused.
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
    if ((!uuids.length && !outside) || dest === null || !session?.rootPath) return
    event.preventDefault()
    if (outside) return importDrop(event, dest)
    const name = uuids.length === 1 ? getFileByUuid(uuids[0])?.fileName ?? '' : t('app.editor.ui.filetree.itemCount', {count: uuids.length})
    // Open the target first: the moved rows are shown there as they arrive, so they stay selected (a hidden row would
    // drop out of the selection; uuids don't change on a move).
    openDest(dest)
    try {
        await moveFiles(uuids, dest ? `${session.rootPath}/${dest}` : session.rootPath)
    } catch (error) {
        $qt.error(t('app.editor.ui.filetree.moveFailed', {name}), String(error))
    }
}

/** Opens the folder at `dest` (relative; `''` is the top level) so what lands there shows, and stays selected. */
function openDest(dest: string) {
    const folder = dest && getFileByPath(absOf(dest))?.uuid
    if (folder && !expandedFolders.value.includes(folder)) expandedFolders.value = [...expandedFolders.value, folder]
}

/**
 * Brings `items` into the folder at `dest` (relative) through `importItems`, opening it first, and selects what
 * arrives (unless `select` is false: Duplicate selects across several folders itself). Returns the new uuids.
 */
async function addInto(dest: string, items: OutsideItem[], options: {copy?: boolean, inPlace?: boolean}, select = true) {
    openDest(dest)
    try {
        const ids = await importItems(items, absOf(dest), options) || []
        if (select && ids.length) selectOnly(ids)
        return ids
    } catch (error) {
        $qt.error(t('app.editor.ui.filetree.importFailed'), String(error))
        return []
    }
}

/** OS files dropped on the tree: copied in, or moved when they're already the workspace's (Option/Alt copies them anyway). */
async function importDrop(event: DragEvent, dest: string) {
    // Taken while the event lasts.
    const pending = outsideItems(event.dataTransfer!), copy = event.altKey
    await addInto(dest, await pending, {copy})
}

async function openInTab(uuid: string) {
    await $navi.toWorkspaceTab(props.sessionId, openTab(uuid))
}

function getItemContextMenu(item: TreeItem, itemLevel: number, isFolder: boolean): ContextMenuItem[][] {
    const file = () => getFileByUuid(item.id)
    /** Above / this / under level submenu for creating a file (with `ext`) or folder relative to `item`. */
    const newAt = (asFolder: boolean, title: string, ext = 'md'): ContextMenuItem[] => ([
        ['aboveLevel', 'i-lucide-folder-up', 'above', itemLevel <= 1],
        ['thisLevel', 'i-lucide-folder-dot', 'same', false],
        ['underLevel', 'i-lucide-folder-down', 'below', !isFolder],
    ] as const).map(([key, icon, asLevel, disabled]) => ({
        label: t(`app.editor.ui.filetree.${key}`),
        icon,
        disabled,
        onSelect: () => newFileModal.open({atFileIndexId: item.id, modalTitle: title, asFolder, asLevel, fileExt: asFolder ? undefined : ext}),
    }))

    const node = item.originalNodeData as UITreeNode
    const ext = getFileExtensionFromPath(node.fileName)
    /** `.workflow`: Run / Dry run. A note: run one of the vault's workflows on it. */
    const runItems = (): ContextMenuItem[] => {
        if (!runner || isFolder) return []
        if (isWorkflowFile(ext)) return [
            {label: t('app.editor.ui.workflow.run'), icon: 'i-lucide-play', onSelect: () => runner.runFile(node.relativePath, false)},
            {label: t('app.editor.ui.workflow.dryRun'), icon: 'i-lucide-flask-conical', onSelect: () => runner.runFile(node.relativePath, true)},
        ]
        if (ext.toLowerCase() !== 'md') return []
        return [{
            label: t('app.editor.ui.workflow.runOnNote'),
            icon: 'i-lucide-workflow',
            disabled: !workflows.value.length,
            children: workflows.value.map(w => ({
                label: fileNameFromPath(w.fileName, true),
                description: w.relativePath,
                icon: 'i-lucide-workflow',
                onSelect: () => runner.runFile(w.relativePath, false, {note: node.relativePath}),
            })),
        }]
    }

    const groups: ContextMenuItem[][] = [
        runItems(),
        [
            {label: t('app.editor.ui.filetree.newMarkdownFile'), icon: 'i-lucide-file-plus', children: newAt(false, t('app.editor.ui.filetree.newMarkdownFile'))},
            {label: t('app.editor.ui.filetree.newFolder'), icon: 'i-lucide-file-plus', children: newAt(true, t('app.editor.ui.filetree.newFolder'))},
            {label: t('app.editor.ui.filetree.newCanvas'), icon: 'i-lucide-layout-dashboard', children: newAt(false, t('app.editor.ui.filetree.newCanvas'), 'canvas')},
            {label: t('app.editor.ui.filetree.newBase'), icon: 'i-lucide-table', children: newAt(false, t('app.editor.ui.filetree.newBase'), 'base')},
            {label: t('app.editor.ui.filetree.newWorkflow'), icon: 'i-lucide-workflow', children: newAt(false, t('app.editor.ui.filetree.newWorkflow'), 'workflow')},
            {
                label: t('app.editor.ui.filetree.newOpenFolderProperties'),
                icon: 'i-lucide-file-plus',
                disabled: !isFolder,
                async onSelect() {
                    const uuid = getPropertiesFile(item.id) ?? (await createFile(item.id, PROPERTIES_FILE_NAMES[0], false, 'below'))?.uuid
                    if (uuid) await openInTab(uuid)
                },
            },
        ],
        [
            {label: t('app.editor.ui.openInNewTab'), icon: 'i-lucide-square-plus', disabled: isFolder, onSelect: () => openInTab(item.id as string)},
            {label: t('app.editor.ui.openInDefaultApp'), icon: 'i-lucide-square-arrow-out-up-right', onSelect: () => file() && $opener.openFileWithDefaultApp(file()!.fullPath)},
        ],
        [
            {label: t('app.editor.ui.copyFullPath'), icon: 'i-lucide-copy', onSelect: () => writeText(file()?.fullPath ?? '')},
            {label: t('app.editor.ui.copyRelativePath'), icon: 'i-lucide-copy', onSelect: () => writeText(file()?.relativePath ?? '')},
            {label: t('app.editor.ui.revealInFileExplorer'), icon: 'i-lucide-copy', onSelect: () => file() && $opener.revealFilesInFileManager([file()!.fullPath])},
        ],
        [copyItem([item.id]), pasteItem(isFolder ? node.relativePath : parentPathOf(node.relativePath))],
        [
            duplicateItem([item.id]),
            {label: t('app.editor.ui.moveFileTo'), icon: 'i-lucide-folder-tree', disabled: true}, // not implemented yet
            {label: t('app.editor.ui.rename'), icon: 'i-lucide-pen-line', onSelect: () => renameFileModal.open({fileIndexId: item.id, currentFileName: item.label ?? ''})},
            {label: t('app.editor.ui.delete'), color: 'error', icon: 'i-lucide-trash-2', onSelect: () => requestDelete([item.id])},
        ],
    ]
    return groups.filter(group => group.length)
}

/** The menu for a selection of several rows: what applies to all of them at once. */
function getSelectionMenu(ids: string[]): ContextMenuItem[][] {
    const files = ids.map(getFileByUuid).filter(f => !!f)
    const notes = files.filter(f => !f.isFolder).map(f => f.uuid)
    const copy = (key: 'fullPath' | 'relativePath') => writeText(files.map(f => f[key]).join('\n'))
    return [
        [{
            label: t('app.editor.ui.filetree.openInNewTabs'), icon: 'i-lucide-square-plus', disabled: !notes.length,
            async onSelect() {
                const tab = openTabs(notes)
                if (tab) await $navi.toWorkspaceTab(props.sessionId, tab)
            },
        }],
        [
            {label: t('app.editor.ui.filetree.copyFullPaths'), icon: 'i-lucide-copy', onSelect: () => copy('fullPath')},
            {label: t('app.editor.ui.filetree.copyRelativePaths'), icon: 'i-lucide-copy', onSelect: () => copy('relativePath')},
            {label: t('app.editor.ui.revealInFileExplorer'), icon: 'i-lucide-copy', onSelect: () => $opener.revealFilesInFileManager(files.map(f => f.fullPath))},
        ],
        [copyItem(ids), duplicateItem(ids)],
        [{label: t('app.editor.ui.delete'), color: 'error', icon: 'i-lucide-trash-2', onSelect: () => requestDelete(ids)}],
    ]
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
            @copy="(e: ClipboardEvent) => onClipboard(e, () => copySelection())"
            @paste="(e: ClipboardEvent) => onClipboard(e, () => pasteInto(pasteTarget()))"
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
                        {{ config?.viewConfig.fileTree.showFileExtInName ? item.label : fileNameFromPath(item.label ?? '', true) }}
                    </span>
                    <template #trailing v-if="config?.viewConfig.fileTree.showFileExtAsTag">
                        <div class="grow"/>
                        <UBadge data-tail class="sticky right-2.5" size="xs" :color="item.id == activeTabUuid ? 'primary' : 'neutral'" :variant="item.id == activeTabUuid ? 'solid' : 'soft'" :label="`.${getFileExtensionFromPath(item.label ?? '')}`"/>
                    </template>
                </UButton>
            </template>
            <template #folder="{item, expanded, level}: {item: TreeItem, expanded: boolean, level: number}">
                <div :data-id="item.id" :data-level="level" class="inline-flex w-full items-center justify-start font-medium rounded-md gap-1.5 select-none py-1.5 pe-2.5">
                    <span v-for="k in level - 1" :key="k" class="absolute inset-y-0 border-s border-dotted border-muted pointer-events-none" :style="{insetInlineStart: guide(k)}"/>
                    <span v-if="dropEdges.has(item.id as string)" :class="['absolute inset-0 pointer-events-none bg-primary/10 border-primary', dropEdges.get(item.id as string)]"/>
                    <span data-grab draggable="true" class="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <UIcon v-if="config?.viewConfig.fileTree.showDefaultFolderIcons" class="text-sm size-4 shrink-0" :name="expanded ? ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-open') : ((config?.viewConfig.fileTree.allowCustomFolderIcons && item.icon) ? item.icon : 'i-lucide-folder-closed')" />
                        <span class="text-xs">{{ item.label }}</span>
                    </span>
                    <span class="grow"/>
                    <UIcon v-if="config?.viewConfig.fileTree.showFoldArrows" data-tail :class="['sticky right-2.5 text-sm size-4 shrink-0 transition-all duration-200', expanded ? 'rotate-180' : '']" name="i-lucide-chevron-up"/>
                </div>
            </template>
        </UTree>
    </UContextMenu>
    <!-- The drag-select box, on screen over the tree (`drawBox`). -->
    <Teleport to="body">
        <div ref="boxRef" class="fixed z-50 hidden pointer-events-none rounded-sm border border-primary bg-primary/10"/>
        <!-- The drag image (`fillGhost`): off-screen but laid out, so `setDragImage` can draw it; the padding holds the
             stacked cards. -->
        <div ref="ghostRef" class="fixed -top-96 left-0 w-max pe-2 pb-2 pointer-events-none">
            <div class="relative">
                <div data-ghost-stack class="absolute inset-0 translate-x-2 translate-y-2 rounded-md border border-accented bg-muted"/>
                <div data-ghost-stack class="absolute inset-0 translate-x-1 translate-y-1 rounded-md border border-accented bg-elevated"/>
                <div data-ghost-card class="relative inline-flex items-center gap-2 rounded-md border border-accented bg-default px-2.5 py-1.5 text-xs font-medium text-highlighted shadow-sm">
                    <span data-ghost-name/>
                    <span data-ghost-count class="rounded-sm bg-primary px-1.5 py-0.5 text-[10px] text-inverted"/>
                </div>
            </div>
        </div>
    </Teleport>
</template>
