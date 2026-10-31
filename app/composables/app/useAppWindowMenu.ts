import {Menu, MenuItem, PredefinedMenuItem, Submenu} from '@tauri-apps/api/menu';
import {type CommandHandlers, type MenuSection, menuSections, resolveMenu} from "~/utils/commands";

/**
 * Per-window native menu, built from the commands currently registered via `useCommands`.
 * Rebuilt (debounced) whenever the set of registered commands changes, on focus and on route change.
 */
const handlers = shallowRef<CommandHandlers>({})
const SECTION_TITLES: Record<MenuSection, string> = {
    app: 'Vertex',
    file: 'app.menu.file',
    edit: 'app.menu.edit',
    view: 'app.menu.view',
    help: 'app.menu.help',
}

/**
 * Register commands for as long as the calling component is mounted. Later registrations of the same id
 * override earlier ones (e.g. a session layout overrides the app-wide "Open File").
 */
export function useCommands(commands: CommandHandlers) {
    const previous: CommandHandlers = {}
    onMounted(() => {
        for (const id of Object.keys(commands)) previous[id] = handlers.value[id]!
        handlers.value = {...handlers.value, ...commands}
    })
    onBeforeUnmount(() => {
        const next = {...handlers.value}
        for (const id of Object.keys(commands)) {
            if (next[id] !== commands[id]) continue
            if (previous[id]) next[id] = previous[id]
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- next is a plain-object copy, not reactive
            else delete next[id]
        }
        handlers.value = next
    })
}

export function useAppWindowMenu() {
    const {t} = useNuxtApp().$i18n

    async function buildMenu() {
        const sections = menuSections(resolveMenu(handlers.value))
        const submenus: Submenu[] = []
        for (const section of ['app', 'file', 'edit', 'view', 'help'] as MenuSection[]) {
            const items = await Promise.all((sections.get(section) ?? []).map(entry => entry
                ? MenuItem.new({
                    id: entry.id,
                    text: t(entry.label),
                    accelerator: entry.accelerator,
                    enabled: entry.enabled,
                    action: () => entry.run?.(),
                })
                : PredefinedMenuItem.new({item: 'Separator'})))
            if (section === 'edit') items.push(...await editItems())
            const title = SECTION_TITLES[section]
            submenus.push(await Submenu.new({text: title.startsWith('app.') ? t(title) : title, items}))
        }
        return Menu.new({items: submenus})
    }

    /** Clipboard/undo items are handled natively by the webview; they need no command. */
    async function editItems() {
        return Promise.all([
            PredefinedMenuItem.new({item: 'Undo'}),
            PredefinedMenuItem.new({item: 'Redo'}),
            PredefinedMenuItem.new({item: 'Separator'}),
            PredefinedMenuItem.new({item: 'Cut'}),
            PredefinedMenuItem.new({item: 'Copy'}),
            PredefinedMenuItem.new({item: 'Paste'}),
            PredefinedMenuItem.new({item: 'Separator'}),
            PredefinedMenuItem.new({item: 'SelectAll'}),
        ])
    }

    async function setMenu() {
        const menu = await buildMenu()
        await menu.setAsAppMenu()
    }

    return {setMenu, handlers}
}
