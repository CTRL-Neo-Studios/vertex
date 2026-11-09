import type {PanelLayout, PanelSide, PanelSlot, PanelViewId} from "#shared/types/app/settings";

/**
 * The built-in views' stock arrangement: the settings' default, and where a built-in view goes back to when it's
 * missing from a saved layout. Views that aren't in it (new ones, plugins later) are placed by their registry
 * entry's `defaultArea` (`placeMissingViews`).
 */
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

/** A view id worth keeping in a stored layout: a word, optionally namespaced (`plugin:view`); never a slot keyword. */
export const isPanelViewId = (v: unknown): v is PanelViewId =>
    typeof v === 'string' && v !== 'separator' && /^[A-Za-z][\w.:-]{0,63}$/.test(v)

/** No separator at either end or next to another; `slotOf` reads the slot from a wrapped item. */
export function tidySlots<T>(items: T[], slotOf: (item: T) => PanelSlot = item => item as PanelSlot): T[] {
    const out: T[] = []
    for (const item of items) if (slotOf(item) !== 'separator' || (out.length && slotOf(out.at(-1)!) !== 'separator')) out.push(item)
    if (out.length && slotOf(out.at(-1)!) === 'separator') out.pop()
    return out
}

/**
 * A stored layout as a valid one: malformed entries go; each view is kept where it first appears (hidden first, then
 * left, then right), whether or not it's registered, so a view missing for a while keeps its place; separators are
 * tidied; built-in views missing from it go to the end of their stock side.
 */
export function normalizePanelLayout(data?: Partial<Record<keyof PanelLayout, unknown>>): PanelLayout {
    const seen = new Set<PanelViewId>()
    const take = (v: unknown): v is PanelViewId => isPanelViewId(v) && !seen.has(v) && !!seen.add(v)
    const list = (value: unknown) => Array.isArray(value) ? value : []
    const hidden = list(data?.hidden).filter(take)
    const side = (value: unknown) => tidySlots(list(value).filter((v): v is PanelSlot => v === 'separator' || take(v)))
    const layout: PanelLayout = {left: side(data?.left), right: side(data?.right), hidden}
    for (const list of ['left', 'right'] as const) {
        for (const id of DEFAULT_PANEL_LAYOUT[list]) if (id !== 'separator' && !seen.has(id)) layout[list].push(id)
    }
    return {left: tidySlots(layout.left), right: tidySlots(layout.right), hidden}
}

/** `layout` with each of `views` it doesn't hold, at the end of the view's default list; unchanged when it holds them all. */
export function placeMissingViews(layout: PanelLayout, views: Iterable<{ id: PanelViewId, defaultArea: PanelList }>): PanelLayout {
    const has = new Set([...layout.left, ...layout.right, ...layout.hidden])
    const missing = [...views].filter(v => !has.has(v.id))
    if (!missing.length) return layout
    const next: PanelLayout = {left: [...layout.left], right: [...layout.right], hidden: [...layout.hidden]}
    for (const view of missing) next[view.defaultArea].push(view.id)
    return next
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
