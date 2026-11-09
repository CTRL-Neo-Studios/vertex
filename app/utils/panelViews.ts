import type {Component, InjectionKey, MaybeRefOrGetter, ShallowRef} from "vue";
import type {ContextMenuItem} from "@nuxt/ui";
import type {ActiveSession} from "#shared/types/active/sessions";
import type {ActiveWorkspaceFileIndex} from "#shared/types/active/workspace";
import type {AppSettings, PanelLayout, PanelSide, PanelViewId} from "#shared/types/app/settings";
import {sessionScope, StateKey} from "#shared/constants/app";
import {isBasesFile} from "#shared/utils/fs/filenames";
import {addPanelSeparator, movePanelSlot, placeMissingViews, type PanelList} from "#shared/utils/panelLayout";
import {aiFeatureOn} from "~/composables/ai/useAiConfig";

/** What a view's `when` sees: the session window it would show in. */
export interface PanelViewContext {
    session: ActiveSession | undefined
    isWorkspace: boolean
    /** The focused tab's file; `undefined` for a chat tab or no tab. */
    activeFile: ActiveWorkspaceFileIndex | undefined
    /** The effective settings (the workspace's overrides applied). */
    settings: AppSettings | undefined
}

/** What an action and its shortcut hint see: the context, plus the side its button is on and the view shown there. */
export interface PanelActionContext extends PanelViewContext {
    area: PanelSide
    /** The view the side's panel shows, `undefined` when it's collapsed. */
    shown: PanelViewId | undefined
}

/** A side-panel view: either a `component` shown in the panel, or an `action` its button runs (Search). */
export interface PanelViewDef {
    id: PanelViewId
    /** i18n key. */
    label: string
    icon: string
    /** Where the view first goes when a layout doesn't hold it; built-ins are placed by `DEFAULT_PANEL_LAYOUT`. */
    defaultArea: PanelList
    component?: () => Promise<Component | { default: Component }>
    /** Runs inside the Nuxt app's context, so it may use `useState`. */
    action?: (ctx: PanelActionContext) => void
    /** Whether the view can show in this window; absent = always. */
    when?: (ctx: PanelViewContext) => boolean
    /** Wrap it in the panel's fading scroll area (views that don't scroll on their own). */
    scroll?: boolean
    /** Keyboard hint on its button. */
    kbds?: (ctx: PanelActionContext) => string[] | undefined
}

const views = shallowReactive(new Map<PanelViewId, PanelViewDef>())
const components = new Map<PanelViewId, Component>()

/** Every registered view, in registration order. */
export const panelViews: ReadonlyMap<PanelViewId, PanelViewDef> = views

/** Registers a view (replacing one with the same id). */
export function definePanelView(def: PanelViewDef): PanelViewDef {
    views.set(def.id, def)
    const load = def.component
    // Vue unwraps `default` only from real ES modules; a loader may resolve to a plain `{default}` too.
    if (load) components.set(def.id, defineAsyncComponent(async () => {
        const loaded = await load()
        return 'default' in loaded ? loaded.default : loaded
    }))
    else components.delete(def.id)
    return def
}

/** The component a view shows, loaded on first use; `undefined` for actions and unregistered ids. */
export const panelViewComponent = (id: PanelViewId | undefined) => (id ? components.get(id) : undefined)

/** `layout` with every registered view it doesn't hold yet, at its `defaultArea`. */
export const withRegisteredViews = (layout: PanelLayout) => placeMissingViews(layout, views.values())

/** A button a view puts in its panel's header (refresh, new, collapse all…). */
export interface PanelViewAction {
    id: string
    /** Shown text (already translated): the tooltip and the accessible name. */
    label: string
    icon: string
    onSelect: () => unknown
    disabled?: boolean
}

/** The pane's slot for its shown view's actions; `DashboardSidePanel` provides it. */
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

const chatOn = (ctx: PanelViewContext) => ctx.isWorkspace && aiFeatureOn(ctx.settings?.aiConfig, 'chat')
/** Views about the open note, which a Bases file doesn't have. */
const noteView = (ctx: PanelViewContext) => !isBasesFile(ctx.activeFile?.fileExt ?? '')

definePanelView({
    id: 'files', label: 'app.chat.files', icon: 'i-lucide-files', defaultArea: 'left',
    when: ctx => ctx.isWorkspace,
    component: () => import('~/components/LayoutComponents/PanelFilesView.vue'),
})
definePanelView({
    id: 'chats', label: 'app.chat.chats', icon: 'i-lucide-messages-square', defaultArea: 'left',
    when: chatOn,
    component: () => import('~/components/Chat/ChatsPanel.vue'),
})
definePanelView({
    id: 'search', label: 'app.chat.search', icon: 'i-lucide-search', defaultArea: 'left',
    when: ctx => ctx.isWorkspace,
    // The chats' search while Chats shows beside it, else the files'.
    action: ({session, shown}) => {
        const scope = sessionScope(session, 'search')
        useState<boolean>(shown === 'chats' ? StateKey.chatSearchOpen(scope) : StateKey.fileSearchOpen(scope), () => false).value = true
    },
    kbds: ({shown}) => (shown === 'chats' ? undefined : ['meta', 'p']),
})
definePanelView({
    id: 'forelinks', label: 'app.editor.ui.forelinks', icon: 'i-lucide-square-arrow-out-up-right', defaultArea: 'right',
    when: noteView, scroll: true,
    component: () => import('~/components/ReferenceForelinksListComponent.vue'),
})
definePanelView({
    id: 'backlinks', label: 'app.editor.ui.backlinks', icon: 'i-lucide-square-arrow-out-down-left', defaultArea: 'right',
    when: noteView, scroll: true,
    component: () => import('~/components/ReferenceBacklinksListComponent.vue'),
})
definePanelView({
    id: 'writersTools', label: 'app.editor.ui.functions.writersTools', icon: 'i-lucide-pencil', defaultArea: 'right',
    when: noteView, scroll: true,
    component: () => import('~/components/WritersInfoPanelComponent.vue'),
})
definePanelView({
    id: 'toc', label: 'app.editor.ui.functions.tableOfContents', icon: 'i-lucide-table-of-contents', defaultArea: 'right',
    when: noteView, scroll: true,
    component: () => import('~/components/TableOfContentsPanelComponent.vue'),
})
definePanelView({
    id: 'chat', label: 'app.chat.chat', icon: 'i-lucide-message-square', defaultArea: 'right',
    when: chatOn,
    component: () => import('~/components/Chat/ChatSidePanelView.vue'),
})

/**
 * The right-click menu of a slot (`index` in `list`), or of a list's empty space: move it (up, down, to the other side),
 * hide it, add or remove a separator, show a hidden view here, reset. `shown`: the indices of the list's slots on
 * screen, for up and down.
 */
export function panelSlotMenu(o: {
    layout: PanelLayout
    list: PanelList
    index?: number
    shown: number[]
    save: (next: PanelLayout) => unknown
    reset: () => unknown
    t: (key: string) => string
}): ContextMenuItem[][] {
    const {layout: l, list, index, shown, save, t} = o
    const slot = index === undefined ? undefined : l[list][index]
    const at = index === undefined ? -1 : shown.indexOf(index)
    const move = (to: PanelList, at: number) => save(movePanelSlot(l, {list, index: index!}, {list: to, index: at}))
    const toSide = (side: PanelSide) => ({label: t(`app.panels.moveTo.${side}`), icon: `i-lucide-panel-${side}`, onSelect: () => move(side, l[side].length)})
    const items: ContextMenuItem[][] = []
    if (slot !== undefined && list === 'hidden') items.push([toSide('left'), toSide('right')])
    else if (slot !== undefined) {
        const side = list as PanelSide
        items.push([
            {label: t('app.panels.moveUp'), icon: 'i-lucide-arrow-up', disabled: at <= 0, onSelect: () => move(side, shown[at - 1]!)},
            {label: t('app.panels.moveDown'), icon: 'i-lucide-arrow-down', disabled: at >= shown.length - 1, onSelect: () => move(side, shown[at + 1]! + 1)},
            ...slot === 'separator'
                ? [{label: t('app.panels.removeSeparator'), icon: 'i-lucide-x', onSelect: () => move('hidden', 0)}]
                : [
                    toSide(side === 'left' ? 'right' : 'left'),
                    {label: t('app.panels.hide'), icon: 'i-lucide-eye-off', onSelect: () => move('hidden', l.hidden.length)},
                    {label: t('app.panels.addSeparator'), icon: 'i-lucide-separator-horizontal', onSelect: () => save(addPanelSeparator(l, side, index! + 1))},
                ],
        ])
    }
    const items2: ContextMenuItem[] = [{label: t('app.panels.reset'), icon: 'i-lucide-rotate-ccw', onSelect: () => void o.reset()}]
    // Hidden views that aren't registered (a plugin that's off, later) keep their place but aren't offered.
    const hidden = l.hidden.flatMap((id, i) => {
        const view = views.get(id)
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