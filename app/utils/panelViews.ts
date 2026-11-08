import type {ContextMenuItem} from "@nuxt/ui";
import type {PanelLayout, PanelSide, PanelViewId} from "#shared/types/app/settings";
import {addPanelSeparator, movePanelSlot, type PanelList} from "#shared/utils/panelLayout";

/** How each panel view looks (`label`: an i18n key). An `action` (Search) runs something instead of showing in a panel. */
export const PANEL_VIEW_INFO: Record<PanelViewId, { label: string, icon: string, action?: true }> = {
    files: {label: 'app.chat.files', icon: 'i-lucide-files'},
    chats: {label: 'app.chat.chats', icon: 'i-lucide-messages-square'},
    search: {label: 'app.chat.search', icon: 'i-lucide-search', action: true},
    forelinks: {label: 'app.editor.ui.forelinks', icon: 'i-lucide-square-arrow-out-up-right'},
    backlinks: {label: 'app.editor.ui.backlinks', icon: 'i-lucide-square-arrow-out-down-left'},
    writersTools: {label: 'app.editor.ui.functions.writersTools', icon: 'i-lucide-pencil'},
    toc: {label: 'app.editor.ui.functions.tableOfContents', icon: 'i-lucide-table-of-contents'},
    chat: {label: 'app.chat.chat', icon: 'i-lucide-message-square'},
}

/** Views that need a workspace (files, chats). */
export const WORKSPACE_VIEWS: ReadonlySet<PanelViewId> = new Set(['files', 'chats', 'search', 'chat'])
/** Views about the open note, which a Bases file doesn't have. */
export const NOTE_VIEWS: ReadonlySet<PanelViewId> = new Set(['forelinks', 'backlinks', 'writersTools', 'toc'])
/** Views that need Chat on. */
export const CHAT_VIEWS: ReadonlySet<PanelViewId> = new Set(['chats', 'chat'])

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
    if (list !== 'hidden') {
        items2.unshift({
            label: t('app.panels.hidden'),
            icon: 'i-lucide-eye',
            disabled: !l.hidden.length,
            children: l.hidden.map((id, i) => ({
                label: t(PANEL_VIEW_INFO[id].label),
                icon: PANEL_VIEW_INFO[id].icon,
                onSelect: () => save(movePanelSlot(l, {list: 'hidden', index: i}, {list, index: index === undefined ? l[list].length : index + 1})),
            })),
        })
    }
    items.push(items2)
    return items
}