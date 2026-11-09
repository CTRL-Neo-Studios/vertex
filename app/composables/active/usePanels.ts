import type {ActiveSession} from "#shared/types/active/sessions";
import type {PanelArea, PanelLayout, PanelSlot, PanelViewId} from "#shared/types/app/settings";
import {DEFAULT_PANEL_LAYOUT, isPanelMarker, movePanelSlot, panelAreaOf, panesOf, tidySlots, type PanelSlotRef} from "#shared/utils/panelLayout";
import {withAt, type AppSettingPath} from "#shared/utils/settings/scopes";
import {panelSlotMenu, panelViews, withRegisteredViews, type PanelActionContext, type PanelViewContext} from "~/utils/panelViews";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/** A slot that can show here, with its index in the area's layout list. */
export interface PanelSlotItem {
    slot: PanelSlot
    index: number
}

/** One pane of an area: its buttons (views and separators), its views, the one it shows. */
export interface PanelPaneState {
    slots: PanelSlotItem[]
    views: PanelViewId[]
    active: PanelViewId
    /** Where a drop past its last button goes: the split that ends it, else the end of the area's list. */
    end: number
    /** The split that starts it; none for the first pane. */
    splitBefore?: number
}

/** An area as shown: its slots that can show here (splits too), its panes (each with a view), the views shown. */
export interface PanelAreaState {
    slots: PanelSlotItem[]
    panes: PanelPaneState[]
    /** One per pane. */
    active: PanelViewId[]
    /** Shows its views: it has a pane and isn't collapsed. (A collapsed bottom area still shows its header.) */
    open: boolean
}

const LAYOUT_PATHS = ['viewConfig.panels.left', 'viewConfig.panels.right', 'viewConfig.panels.bottom', 'viewConfig.panels.hidden'] as const satisfies AppSettingPath[]

/**
 * The panels of a session window, the two sides and the bottom area: the settings' arrangement (`viewConfig.panels`,
 * plus registered views it doesn't hold yet) narrowed to what this window can show (each view's `when`) and cut into
 * panes at its splits, the view each pane shows and each area's collapsed state, and rearranging, saved where the
 * arrangement comes from: the workspace when it overrides it, else globally.
 */
export function usePanels(session?: ActiveSession) {
    const nuxtApp = useNuxtApp()
    const {t} = useI18n()
    const settings = useSettingsScope()
    const {config, save: saveSettings} = useAppSettings()
    const layouts = useActiveLayouts(session)
    const {activeTabUuid} = useActiveTabs(session)
    const {getFileByUuid} = useActiveWorkspaceIndex(session)

    const panels = computed(() => settings.effective.value?.viewConfig.panels ?? {style: 'buttons' as const, ...DEFAULT_PANEL_LAYOUT})
    const style = computed(() => panels.value.style)
    const layout = computed<PanelLayout>(() => withRegisteredViews({left: panels.value.left, right: panels.value.right, bottom: panels.value.bottom, hidden: panels.value.hidden}))

    const context = computed<PanelViewContext>(() => ({
        session,
        isWorkspace: !!session?.workspaceSession,
        activeFile: getFileByUuid(activeTabUuid.value ?? undefined) ?? undefined,
        settings: settings.effective.value ?? undefined,
    }))
    /** Registered, and its `when` holds in this window. */
    const available = (id: PanelViewId) => {
        const view = panelViews.get(id)
        return !!view && (view.when?.(context.value) ?? true)
    }

    const shown = layouts.shownPanelViews
    const collapsedOf = {left: layouts.leftPanelCollapsed, right: layouts.rightPanelCollapsed, bottom: layouts.bottomPanelCollapsed}

    const isView = (item: PanelSlotItem) => !isPanelMarker(item.slot) && !!panelViews.get(item.slot)?.component

    function areaState(area: PanelArea): PanelAreaState {
        const list = layout.value[area]
        const slots = tidySlots(list.map((slot, index) => ({slot, index})).filter(s => isPanelMarker(s.slot) || available(s.slot)), s => s.slot)
        const panes = panesOf(slots, s => s.slot, isView).flatMap(pane => {
            const views = pane.slots.filter(isView).map(s => s.slot)
            if (!views.length) return []
            const active = shown.value.find(v => views.includes(v)) ?? views[0]!
            return [{slots: pane.slots, views, active, end: pane.splitAfter?.index ?? list.length, splitBefore: pane.splitBefore?.index}]
        })
        return {slots, panes, active: panes.map(p => p.active), open: panes.length > 0 && !collapsedOf[area].value}
    }
    const areas = computed(() => ({left: areaState('left'), right: areaState('right'), bottom: areaState('bottom')}))

    const paneOf = (area: PanelArea, id: PanelViewId) => areas.value[area].panes.find(p => p.slots.some(s => s.slot === id))

    /** What an action sees: the view shown in the pane holding it. */
    const actionContext = (area: PanelArea, id: PanelViewId): PanelActionContext => {
        const pane = paneOf(area, id)
        return {...context.value, area, shown: areas.value[area].open ? pane?.active : undefined}
    }

    /** The keyboard hints of an area's view buttons, by view. */
    function kbdsOf(area: PanelArea): Record<PanelViewId, string[]> {
        return Object.fromEntries(areas.value[area].slots.flatMap(({slot}) => {
            const kbds = isPanelMarker(slot) ? undefined : panelViews.get(slot)?.kbds?.(actionContext(area, slot))
            return kbds ? [[slot, kbds]] : []
        }))
    }

    /** `id` becomes its pane's view (a pane's other views leave the list, so it doesn't grow). */
    function show(pane: PanelPaneState, id: PanelViewId) {
        shown.value = [id, ...shown.value.filter(v => v !== id && !pane.views.includes(v))]
    }

    /**
     * A view's button: shows it in its pane and opens the area; an action runs. In a side's strip, the shown view's
     * button collapses the side instead (the bottom area has its own collapse button).
     */
    function select(area: PanelArea, id: PanelViewId) {
        const action = panelViews.get(id)?.action
        if (action) return void nuxtApp.runWithContext(() => action(actionContext(area, id)))
        const pane = paneOf(area, id)
        if (!pane) return
        if (area !== 'bottom' && style.value === 'strip' && areas.value[area].open && pane.active === id) {
            collapsedOf[area].value = true
            return
        }
        show(pane, id)
        collapsedOf[area].value = false
    }

    const toggle = (area: PanelArea) => {
        collapsedOf[area].value = !collapsedOf[area].value
    }

    /** Shows view `id` in its pane, in whichever area holds it; false when it's hidden or can't show here. */
    function showView(id: PanelViewId) {
        const area = panelAreaOf(layout.value, id)
        const pane = area && available(id) ? paneOf(area, id) : undefined
        if (!area || !pane) return false
        show(pane, id)
        collapsedOf[area].value = false
        return true
    }

    /** The arrangement as `next`: in the workspace when it already overrides it, else in the global settings. */
    async function save(next: PanelLayout) {
        const patch = {[LAYOUT_PATHS[0]]: next.left, [LAYOUT_PATHS[1]]: next.right, [LAYOUT_PATHS[2]]: next.bottom, [LAYOUT_PATHS[3]]: next.hidden}
        if (LAYOUT_PATHS.some(path => settings.overridden(path))) return settings.set(patch)
        return saveSettings(Object.entries(patch).reduce((next, [path, value]) => withAt(next, path, value), config.value!))
    }

    /** Back to the stock arrangement (a workspace that overrides it goes back to the global one). */
    function reset() {
        if (LAYOUT_PATHS.some(path => settings.overridden(path))) return settings.set(Object.fromEntries(LAYOUT_PATHS.map(p => [p, null])))
        return save(withRegisteredViews({...DEFAULT_PANEL_LAYOUT}))
    }

    const move = (from: PanelSlotRef, to: PanelSlotRef) => save(movePanelSlot(layout.value, from, to))

    /**
     * The right-click menu of a slot in `area` (`index` in its list), or of the empty space beside the slots; `pane`, the
     * pane the buttons belong to, adds merging it with the pane before.
     */
    const slotMenu = (area: PanelArea, index?: number, pane?: PanelPaneState) =>
        panelSlotMenu({layout: layout.value, list: area, index, shown: areas.value[area].slots.map(s => s.index), splitBefore: pane?.splitBefore, save, reset, t})

    return {style, layout, areas, available, kbdsOf, select, toggle, showView, move, slotMenu}
}
