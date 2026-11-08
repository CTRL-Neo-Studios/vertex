import type {PanelLayout, PanelSide, PanelSlot, PanelViewId} from "#shared/types/app/settings";

export const PANEL_VIEWS: readonly PanelViewId[] = ['files', 'chats', 'search', 'forelinks', 'backlinks', 'writersTools', 'toc', 'chat']

/** Today's arrangement, and where a view goes back to when it's missing from a saved one. */
export const DEFAULT_PANEL_LAYOUT: Readonly<PanelLayout> = {
    left: ['files', 'chats', 'search'],
    right: ['forelinks', 'backlinks', 'writersTools', 'toc', 'chat'],
    hidden: [],
}

/** A list in a layout: either side, or the hidden views. */
export type PanelList = PanelSide | 'hidden'
/** A slot by list and index; as a destination, the index it's inserted before (the list's length = at the end). */
export interface PanelSlotRef {
    list: PanelList
    index: number
}

const isView = (v: unknown): v is PanelViewId => PANEL_VIEWS.includes(v as PanelViewId)

/** No separator at either end or next to another; `slotOf` reads the slot from a wrapped item. */
export function tidySlots<T>(items: T[], slotOf: (item: T) => PanelSlot = item => item as PanelSlot): T[] {
    const out: T[] = []
    for (const item of items) if (slotOf(item) !== 'separator' || (out.length && slotOf(out.at(-1)!) !== 'separator')) out.push(item)
    if (out.length && slotOf(out.at(-1)!) === 'separator') out.pop()
    return out
}

/**
 * A stored layout as a valid one: unknown entries go; each view is kept where it first appears (hidden first, then
 * left, then right); separators are tidied; views missing from it (new ones) go to the end of their default side.
 */
export function normalizePanelLayout(data?: Partial<Record<keyof PanelLayout, unknown>>): PanelLayout {
    const seen = new Set<PanelViewId>()
    const take = (v: unknown): v is PanelViewId => isView(v) && !seen.has(v) && !!seen.add(v)
    const list = (value: unknown) => Array.isArray(value) ? value : []
    const hidden = list(data?.hidden).filter(take)
    const side = (value: unknown) => tidySlots(list(value).filter((v): v is PanelSlot => v === 'separator' || take(v)))
    const layout: PanelLayout = {left: side(data?.left), right: side(data?.right), hidden}
    for (const id of PANEL_VIEWS) {
        if (seen.has(id)) continue
        layout[DEFAULT_PANEL_LAYOUT.left.includes(id) ? 'left' : 'right'].push(id)
    }
    return {left: tidySlots(layout.left), right: tidySlots(layout.right), hidden}
}

/** Moves a slot (a view or a separator) to another place, in its list or another; a separator dropped on `hidden` goes. */
export function movePanelSlot(layout: PanelLayout, from: PanelSlotRef, to: PanelSlotRef): PanelLayout {
    const lists: Record<PanelList, PanelSlot[]> = {left: [...layout.left], right: [...layout.right], hidden: [...layout.hidden]}
    const [slot] = lists[from.list].splice(from.index, 1)
    if (slot === undefined) return layout
    const at = from.list === to.list && to.index > from.index ? to.index - 1 : to.index
    if (!(to.list === 'hidden' && slot === 'separator')) lists[to.list].splice(Math.max(0, Math.min(at, lists[to.list].length)), 0, slot)
    return normalizePanelLayout(lists)
}

/** A separator inserted at `index` on `side`. */
export function addPanelSeparator(layout: PanelLayout, side: PanelSide, index: number): PanelLayout {
    const slots = [...layout[side]]
    slots.splice(index, 0, 'separator')
    return normalizePanelLayout({...layout, [side]: slots})
}

/** The side holding view `id`, if it isn't hidden. */
export const panelSideOf = (layout: PanelLayout, id: PanelViewId): PanelSide | undefined =>
    layout.left.includes(id) ? 'left' : layout.right.includes(id) ? 'right' : undefined
