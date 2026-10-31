/**
 * App commands: the single source for the native menu (and anything else that lists actions).
 *
 * Components register the commands they can actually perform while mounted. The menu is rebuilt from
 * what is registered, so an item is only enabled when something handles it — no more menu entries that
 * silently do nothing.
 */
export type MenuSection = 'app' | 'file' | 'edit' | 'view' | 'help'

export interface Command {
    id: string
    /** i18n key for the label. */
    label: string
    section: MenuSection
    /** Items with the same group are kept together; a separator is drawn between groups. */
    group: number
    accelerator?: string
    run: () => unknown
    /** Shown greyed out when false (evaluated at menu build time). */
    enabled?: () => boolean
}

/** Ordered list of every command the menu knows about. Order defines menu order within a section. */
export const MENU_LAYOUT: {id: string, section: MenuSection, group: number, label: string, accelerator?: string}[] = [
    {id: 'app.settings', section: 'app', group: 0, label: 'app.commands.settings', accelerator: 'CmdOrCtrl+,'},
    {id: 'app.about', section: 'app', group: 0, label: 'app.commands.about'},
    {id: 'app.checkUpdates', section: 'app', group: 0, label: 'app.commands.checkUpdates'},
    {id: 'app.quit', section: 'app', group: 1, label: 'app.commands.quit', accelerator: 'CmdOrCtrl+Q'},

    {id: 'file.newFile', section: 'file', group: 0, label: 'app.commands.newFile', accelerator: 'CmdOrCtrl+N'},
    {id: 'file.newFolder', section: 'file', group: 0, label: 'app.commands.newFolder', accelerator: 'CmdOrCtrl+Shift+N'},
    {id: 'file.openFile', section: 'file', group: 1, label: 'app.commands.openFile', accelerator: 'CmdOrCtrl+O'},
    {id: 'file.openFolder', section: 'file', group: 1, label: 'app.commands.openFolder', accelerator: 'CmdOrCtrl+Shift+O'},
    {id: 'file.save', section: 'file', group: 2, label: 'app.commands.save', accelerator: 'CmdOrCtrl+S'},

    {id: 'view.reload', section: 'view', group: 0, label: 'app.commands.reload', accelerator: 'CmdOrCtrl+R'},
    {id: 'view.toggleFullscreen', section: 'view', group: 0, label: 'app.commands.toggleFullscreen', accelerator: 'Ctrl+CmdOrCtrl+F'},
    {id: 'view.closeTab', section: 'view', group: 1, label: 'app.commands.closeTab', accelerator: 'CmdOrCtrl+W'},
    {id: 'view.closeAllTabs', section: 'view', group: 1, label: 'app.commands.closeAllTabs', accelerator: 'CmdOrCtrl+Shift+W'},
    {id: 'view.closeWindow', section: 'view', group: 1, label: 'app.commands.closeWindow', accelerator: 'CmdOrCtrl+Alt+W'},

    {id: 'help.docs', section: 'help', group: 0, label: 'app.commands.docs'},
    {id: 'help.reportIssue', section: 'help', group: 0, label: 'app.commands.reportIssue'},
    {id: 'help.repo', section: 'help', group: 0, label: 'app.commands.repo'},
]

export type CommandHandlers = Record<string, Pick<Command, 'run' | 'enabled'>>

export type MenuLayoutItem = (typeof MENU_LAYOUT)[number]

/** A layout item after handlers are applied; `run` is absent when nothing handles the command. */
export interface MenuEntry extends MenuLayoutItem {
    run?: () => unknown
    enabled: boolean
}

/** Resolves the menu: one entry per layout item, enabled only when a handler is registered and allows it. */
export function resolveMenu(handlers: CommandHandlers): MenuEntry[] {
    return MENU_LAYOUT.map(item => {
        const handler = handlers[item.id]
        return {...item, run: handler?.run, enabled: !!handler && (handler.enabled?.() ?? true)}
    })
}

/** Groups resolved entries into sections; `null` marks a separator between groups. */
export function menuSections(entries: MenuEntry[]): Map<MenuSection, (MenuEntry | null)[]> {
    const sections = new Map<MenuSection, (MenuEntry | null)[]>()
    for (const entry of entries) {
        const list = sections.get(entry.section) ?? []
        const last = list.at(-1)
        if (last && last.group !== entry.group) list.push(null)
        list.push(entry)
        sections.set(entry.section, list)
    }
    return sections
}
