import type {ActiveSession} from "#shared/types/active/sessions";
import type {PanelLayout, PanelSide, PanelSlot, PanelViewId} from "#shared/types/app/settings";
import {DEFAULT_PANEL_LAYOUT, movePanelSlot, panelSideOf, tidySlots, type PanelSlotRef} from "#shared/utils/panelLayout";
import {withAt, type AppSettingPath} from "#shared/utils/settings/scopes";
import {panelSlotMenu, panelViews, withRegisteredViews, type PanelActionContext, type PanelViewContext} from "~/utils/panelViews";
import {useActiveLayouts} from "~/composables/active/useActiveLayouts";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppSettings} from "~/composables/app/useAppSettings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/** A side as shown: its slots that can show here (with their index in the layout's list), its views, the one shown. */
export interface PanelSideState {
    slots: { slot: PanelSlot, index: number }[]
    /** Views that show in the panel (not actions). */
    views: PanelViewId[]
    active: PanelViewId | undefined
    /** The panel is shown: it has a view, and isn't collapsed. */
    open: boolean
}

const LAYOUT_PATHS = ['viewConfig.panels.left', 'viewConfig.panels.right', 'viewConfig.panels.hidden'] as const satisfies AppSettingPath[]

/**
 * The side panels of a session window: the settings' arrangement (`viewConfig.panels`, plus registered views it doesn't
 * hold yet) narrowed to what this window can show (each view's `when`), each side's view and collapsed state, and
 * rearranging, saved where the arrangement comes from: the workspace when it overrides it, else globally.
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
    const layout = computed<PanelLayout>(() => withRegisteredViews({left: panels.value.left, right: panels.value.right, hidden: panels.value.hidden}))

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

    const viewOf = {left: layouts.leftPanelView, right: layouts.rightPanelView}
    const collapsedOf = {left: layouts.leftPanelCollapsed, right: layouts.rightPanelCollapsed}

    function sideState(side: PanelSide): PanelSideState {
        const slots = tidySlots(layout.value[side].map((slot, index) => ({slot, index})).filter(s => s.slot === 'separator' || available(s.slot)), s => s.slot)
        const views = slots.map(s => s.slot).filter(s => s !== 'separator' && !!panelViews.get(s)?.component)
        const chosen = viewOf[side].value
        const active = chosen && views.includes(chosen) ? chosen : views[0]
        return {slots, views, active, open: !!active && !collapsedOf[side].value}
    }
    const sides = computed(() => ({left: sideState('left'), right: sideState('right')}))

    const actionContext = (side: PanelSide): PanelActionContext => {
        const s = sides.value[side]
        return {...context.value, area: side, shown: s.open ? s.active : undefined}
    }

    /** The keyboard hints of a side's view buttons, by view. */
    function kbdsOf(side: PanelSide): Record<PanelViewId, string[]> {
        const ctx = actionContext(side)
        return Object.fromEntries(sides.value[side].slots.flatMap(({slot}) => {
            const kbds = slot === 'separator' ? undefined : panelViews.get(slot)?.kbds?.(ctx)
            return kbds ? [[slot, kbds]] : []
        }))
    }

    /** A view's button: shows it (in a strip, the shown one collapses its panel); an action runs. */
    function select(side: PanelSide, id: PanelViewId) {
        const action = panelViews.get(id)?.action
        if (action) return void nuxtApp.runWithContext(() => action(actionContext(side)))
        const s = sides.value[side]
        if (style.value === 'strip' && s.open && s.active === id) {
            collapsedOf[side].value = true
            return
        }
        viewOf[side].value = id
        collapsedOf[side].value = false
    }

    const toggle = (side: PanelSide) => {
        collapsedOf[side].value = !collapsedOf[side].value
    }

    /** Shows view `id` on whichever side holds it; false when it's hidden or can't show here. */
    function showView(id: PanelViewId) {
        const side = panelSideOf(layout.value, id)
        if (!side || !available(id)) return false
        viewOf[side].value = id
        collapsedOf[side].value = false
        return true
    }

    /** The arrangement as `next`: in the workspace when it already overrides it, else in the global settings. */
    async function save(next: PanelLayout) {
        const patch = {[LAYOUT_PATHS[0]]: next.left, [LAYOUT_PATHS[1]]: next.right, [LAYOUT_PATHS[2]]: next.hidden}
        if (LAYOUT_PATHS.some(path => settings.overridden(path))) return settings.set(patch)
        return saveSettings(Object.entries(patch).reduce((next, [path, value]) => withAt(next, path, value), config.value!))
    }

    /** Back to the stock arrangement (a workspace that overrides it goes back to the global one). */
    function reset() {
        if (LAYOUT_PATHS.some(path => settings.overridden(path))) return settings.set(Object.fromEntries(LAYOUT_PATHS.map(p => [p, null])))
        return save(withRegisteredViews({...DEFAULT_PANEL_LAYOUT}))
    }

    const move = (from: PanelSlotRef, to: PanelSlotRef) => save(movePanelSlot(layout.value, from, to))

    /** The right-click menu of a slot on `side` (`index` in its list), or of the empty space beside the slots. */
    const slotMenu = (side: PanelSide, index?: number) =>
        panelSlotMenu({layout: layout.value, list: side, index, shown: sides.value[side].slots.map(s => s.index), save, reset, t})

    return {style, layout, sides, available, kbdsOf, select, toggle, showView, move, slotMenu}
}
