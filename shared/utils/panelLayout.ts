import type {PanelArea, PanelLayout, PanelSlot, PanelViewId} from "#shared/types/app/settings";

/**
 * The built-in views' stock arrangement: the settings' default, and where a built-in view goes back to when it's
 * missing from a saved layout. Views that aren't in it (new ones, plugins later) are placed by their registry
 * entry's `defaultArea` (`placeMissingViews`).
 */
export const DEFAULT_PANEL_LAYOUT: Readonly<PanelLayout> = {
    left: ['files', 'chats', 'search'],
    right: ['forelinks', 'backlinks', 'writersTools', 'toc', 'chat'],
    bottom: [],
    hidden: [],
}

/** The areas views can show in, in layout order. */
export const PANEL_AREAS = ['left', 'right', 'bottom'] as const satisfies readonly PanelArea[]

/** A list in a layout: an area, or the hidden views. */
export type PanelList = PanelArea | 'hidden'
/** A slot by list and index; as a destination, the index it's inserted before (the list's length = at the end). */
export interface PanelSlotRef {
    list: PanelList
    index: number
}

/** A slot that isn't a view: a separator or a split. */
export const isPanelMarker = (slot: unknown): slot is 'separator' | 'split' => slot === 'separator' || slot === 'split'

/** A view id worth keeping in a stored layout: a word, optionally namespaced (`plugin:view`); never a slot keyword. */
export const isPanelViewId = (v: unknown): v is PanelViewId =>
    typeof v === 'string' && !isPanelMarker(v) && /^[A-Za-z][\w.:-]{0,63}$/.test(v)

/**
 * Markers only where they mean something: no split at either end or next to another, no separator at either end of a
 * pane (beside a split) or next to another. `slotOf` reads the slot from a wrapped item.
 */
export function tidySlots<T>(items: T[], slotOf: (item: T) => PanelSlot = item => item as PanelSlot): T[] {
    const out: T[] = []
    const last = () => (out.length ? slotOf(out.at(-1)!) : undefined)
    for (const item of items) {
        const slot = slotOf(item)
        if (slot === 'separator' && (last() === undefined || isPanelMarker(last()))) continue
        if (slot === 'split') {
            if (last() === 'separator') out.pop()
            if (last() === undefined || last() === 'split') continue
        }
        out.push(item)
    }
    while (out.length && isPanelMarker(last())) out.pop()
    return out
}

/** One pane of an area: its slots (no splits), and the splits that start and end it, if any. */
export interface PanelPaneSlots<T> {
    slots: T[]
    splitBefore?: T
    splitAfter?: T
}

/**
 * An area's slots cut into panes at its splits. A run with no view (only actions, say Search) can't be a pane of its
 * own, so it joins the pane before it (or after it, at the start), keeping its buttons. No views at all: one pane.
 */
export function panesOf<T>(items: T[], slotOf: (item: T) => PanelSlot, hasView: (item: T) => boolean): PanelPaneSlots<T>[] {
    const runs: { slots: T[], split?: T }[] = [{slots: []}]
    for (const item of items) {
        if (slotOf(item) === 'split') runs.push({slots: [], split: item})
        else runs.at(-1)!.slots.push(item)
    }
    const panes: PanelPaneSlots<T>[] = []
    let carried: T[] = []
    for (const run of runs) {
        if (!run.slots.some(hasView)) {
            if (panes.length) panes.at(-1)!.slots.push(...run.slots)
            else carried.push(...run.slots)
            continue
        }
        const previous = panes.at(-1)
        if (previous) previous.splitAfter = run.split
        panes.push({slots: [...carried, ...run.slots], ...previous && {splitBefore: run.split}})
        carried = []
    }
    if (!panes.length && carried.length) panes.push({slots: carried})
    return panes
}

/**
 * A stored layout as a valid one: malformed entries go; each view is kept where it first appears (hidden first, then
 * left, right and bottom), whether or not it's registered, so a view missing for a while keeps its place; separators
 * and splits are tidied; built-in views missing from it go to the end of their stock side. No `bottom` (layouts from
 * before it): an empty one.
 */
export function normalizePanelLayout(data?: Partial<Record<keyof PanelLayout, unknown>>): PanelLayout {
    const seen = new Set<PanelViewId>()
    const take = (v: unknown): v is PanelViewId => isPanelViewId(v) && !seen.has(v) && !!seen.add(v)
    const list = (value: unknown) => Array.isArray(value) ? value : []
    const hidden = list(data?.hidden).filter(take)
    const area = (value: unknown) => tidySlots(list(value).filter((v): v is PanelSlot => isPanelMarker(v) || take(v)))
    const layout: PanelLayout = {left: area(data?.left), right: area(data?.right), bottom: area(data?.bottom), hidden}
    for (const list of PANEL_AREAS) {
        for (const id of DEFAULT_PANEL_LAYOUT[list]) if (!isPanelMarker(id) && !seen.has(id)) layout[list].push(id)
    }
    return {left: tidySlots(layout.left), right: tidySlots(layout.right), bottom: tidySlots(layout.bottom), hidden}
}

/** `layout` with each of `views` it doesn't hold, at the end of the view's default list; unchanged when it holds them all. */
export function placeMissingViews(layout: PanelLayout, views: Iterable<{ id: PanelViewId, defaultArea: PanelList }>): PanelLayout {
    const has = new Set([...layout.left, ...layout.right, ...layout.bottom, ...layout.hidden])
    const missing = [...views].filter(v => !has.has(v.id))
    if (!missing.length) return layout
    const next: PanelLayout = {left: [...layout.left], right: [...layout.right], bottom: [...layout.bottom], hidden: [...layout.hidden]}
    for (const view of missing) next[view.defaultArea].push(view.id)
    return next
}

/** Moves a slot (a view or a marker) to another place, in its list or another; a marker dropped on `hidden` goes. */
export function movePanelSlot(layout: PanelLayout, from: PanelSlotRef, to: PanelSlotRef): PanelLayout {
    const lists: Record<PanelList, PanelSlot[]> = {left: [...layout.left], right: [...layout.right], bottom: [...layout.bottom], hidden: [...layout.hidden]}
    const [slot] = lists[from.list].splice(from.index, 1)
    if (slot === undefined) return layout
    const at = from.list === to.list && to.index > from.index ? to.index - 1 : to.index
    if (!(to.list === 'hidden' && isPanelMarker(slot))) lists[to.list].splice(Math.max(0, Math.min(at, lists[to.list].length)), 0, slot)
    return normalizePanelLayout(lists)
}

/** A separator inserted at `index` in `area`. */
export const addPanelSeparator = (layout: PanelLayout, area: PanelArea, index: number) => addPanelMarker(layout, area, index, 'separator')

/** A split inserted at `index` in `area`: the slots from there on form a new pane. */
export const addPanelSplit = (layout: PanelLayout, area: PanelArea, index: number) => addPanelMarker(layout, area, index, 'split')

function addPanelMarker(layout: PanelLayout, area: PanelArea, index: number, marker: 'separator' | 'split'): PanelLayout {
    const slots = [...layout[area]]
    slots.splice(index, 0, marker)
    return normalizePanelLayout({...layout, [area]: slots})
}

/** The area holding view `id`, if it isn't hidden. */
export const panelAreaOf = (layout: PanelLayout, id: PanelViewId): PanelArea | undefined => PANEL_AREAS.find(area => layout[area].includes(id))
