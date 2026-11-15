import type {InjectionKey, MaybeRefOrGetter, ShallowRef} from "vue";
import type {ContextMenuItem} from "@nuxt/ui";
import type {PanelArea, PanelLayout, PanelViewId} from "#shared/types/app/settings";
import type {PanelViewAction, PanelViewDef} from "#shared/plugin/api";
import {PANEL_AREAS, addPanelSeparator, addPanelSplit, movePanelSlot, placeMissingViews, type PanelList} from "#shared/utils/panelLayout";
import {createRegistry} from "~/utils/registry";

const registry = createRegistry<PanelViewDef>('panel view', d => d.id)

/** Every registered view, in registration order. */
export const panelViews: ReadonlyMap<PanelViewId, PanelViewDef> = registry.items

/** Registers a view; returns its removal. A second view with the same id is an error. */
export const registerPanelView = (def: PanelViewDef) => registry.register(def)

/** `layout` with every registered view it doesn't hold yet, at its `defaultArea`. */
export const withRegisteredViews = (layout: PanelLayout) => placeMissingViews(layout, registry.items.values())

/** A pane's slot for its shown view's actions; each pane (`PanelPane`) provides one. */
export const PANEL_ACTIONS: InjectionKey<ShallowRef<MaybeRefOrGetter<PanelViewAction[]> | undefined>> = Symbol('panel-actions')

/**
 * Declares the calling view's header actions while it's mounted; the pane draws them the same way in every panel
 * style. Called inside a view's component, so the actions can use its state. Outside a pane it does nothing.
 */
export function usePanelActions(actions: MaybeRefOrGetter<PanelViewAction[]>) {
    const slot = inject(PANEL_ACTIONS, null)
    if (!slot) return
    slot.value = actions
    // Views can swap in either order; only clear what this one put there.
    onBeforeUnmount(() => {
        if (slot.value === actions) slot.value = undefined
    })
}

/**
 * The right-click menu of a slot (`index` in `list`), or of a list's empty space: move it (up, down, to the other side),
 * hide it, split before it, add or remove a separator or split, show a hidden view here, reset. `shown`: the indices of
 * the list's slots on screen, for up and down. `splitBefore`: the split starting the pane the list belongs to, to
 * merge the pane with the one above.
 */
export function panelSlotMenu(o: {
    layout: PanelLayout
    list: PanelList
    index?: number
    shown: number[]
    splitBefore?: number
    save: (next: PanelLayout) => unknown
    reset: () => unknown
    t: (key: string) => string
}): ContextMenuItem[][] {
    const {layout: l, list, index, shown, splitBefore, save, t} = o
    const slot = index === undefined ? undefined : l[list][index]
    const at = index === undefined ? -1 : shown.indexOf(index)
    const move = (to: PanelList, at: number) => save(movePanelSlot(l, {list, index: index!}, {list: to, index: at}))
    const toArea = (area: PanelArea) => ({label: t(`app.panels.moveTo.${area}`), icon: `i-lucide-panel-${area}`, onSelect: () => move(area, l[area].length)})
    const items: ContextMenuItem[][] = []
    if (slot !== undefined && list === 'hidden') items.push(PANEL_AREAS.map(toArea))
    else if (slot !== undefined) {
        const area = list as PanelArea
        items.push([
            {label: t('app.panels.moveUp'), icon: 'i-lucide-arrow-up', disabled: at <= 0, onSelect: () => move(area, shown[at - 1]!)},
            {label: t('app.panels.moveDown'), icon: 'i-lucide-arrow-down', disabled: at >= shown.length - 1, onSelect: () => move(area, shown[at + 1]! + 1)},
            ...slot === 'separator'
                ? [{label: t('app.panels.removeSeparator'), icon: 'i-lucide-x', onSelect: () => move('hidden', 0)}]
                : slot === 'split'
                    ? [{label: t('app.panels.removeSplit'), icon: 'i-lucide-x', onSelect: () => move('hidden', 0)}]
                    : [
                        ...PANEL_AREAS.filter(other => other !== area).map(toArea),
                        {label: t('app.panels.hide'), icon: 'i-lucide-eye-off', onSelect: () => move('hidden', l.hidden.length)},
                        {label: t('app.panels.addSeparator'), icon: 'i-lucide-separator-horizontal', onSelect: () => save(addPanelSeparator(l, area, index! + 1))},
                        // Not before a pane's first view: it already starts one.
                        {label: t('app.panels.splitHere'), icon: area === 'bottom' ? 'i-lucide-columns-2' : 'i-lucide-rows-2', disabled: index === 0 || l[area][index! - 1] === 'split', onSelect: () => save(addPanelSplit(l, area, index!))},
                    ],
        ])
    }
    if (splitBefore !== undefined && list !== 'hidden') {
        const merge = list === 'bottom' ? {label: t('app.panels.mergeLeft'), icon: 'i-lucide-fold-horizontal'} : {label: t('app.panels.mergeUp'), icon: 'i-lucide-fold-vertical'}
        items.push([{...merge, onSelect: () => save(movePanelSlot(l, {list, index: splitBefore}, {list: 'hidden', index: 0}))}])
    }
    const items2: ContextMenuItem[] = [{label: t('app.panels.reset'), icon: 'i-lucide-rotate-ccw', onSelect: () => void o.reset()}]
    // Hidden views that aren't registered (a plugin that's off, later) keep their place but aren't offered.
    const hidden = l.hidden.flatMap((id, i) => {
        const view = registry.get(id)
        return view ? [{view, i}] : []
    })
    if (list !== 'hidden') {
        items2.unshift({
            label: t('app.panels.hidden'),
            icon: 'i-lucide-eye',
            disabled: !hidden.length,
            children: hidden.map(({view, i}) => ({
                label: t(view.label),
                icon: view.icon,
                onSelect: () => save(movePanelSlot(l, {list: 'hidden', index: i}, {list, index: index === undefined ? l[list].length : index + 1})),
            })),
        })
    }
    items.push(items2)
    return items
}