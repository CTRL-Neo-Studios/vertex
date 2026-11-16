import type {PaletteItem, SessionContext} from "#shared/plugin/api";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {BaseContext} from "./useBaseContext";
import {tableCells, toTsv} from "./basesTable";
import {afterOverlaysClose} from "./overlays";

/** The base open in this window's tab (set while its viewer is mounted), for the palette's Bases commands. */
const active = shallowRef<BaseContext | null>(null)

/** Called by the viewer: its commands are in the palette while it's mounted. */
export function registerBaseCommands(ctx: BaseContext) {
    active.value = ctx
    onBeforeUnmount(() => {
        if (active.value === ctx) active.value = null
    })
}

/** Copies a view's table as Obsidian's "Copy to clipboard" does (TSV), with a toast. */
export function useCopyTable() {
    // Not `useI18n`: the Bases palette group uses it outside a component's setup.
    const {t} = useNuxtApp().$i18n
    const toast = useToast()
    return async (ctx: BaseContext) => {
        try {
            await writeText(toTsv(tableCells(ctx.view.value.order, id => ctx.property(id).label, ctx.result.value.rows)))
            toast.add({title: t('plugins.bases.copied'), color: 'success', icon: 'lucide:circle-check'})
        } catch (error) {
            toast.add({title: String(error), color: 'error', icon: 'lucide:circle-alert'})
        }
    }
}

/**
 * "Bases: Add view", "Switch view…", "Copy table", "Add item", while a base is open; "Insert new base" while a note is:
 * as Obsidian's, an empty `Untitled.base` at the workspace root (it opens on Obsidian's default table view), embedded
 * at the note's cursor.
 */
export function useBaseCommandItems({index, files, tabs, editor}: SessionContext) {
    const {t} = useNuxtApp().$i18n
    const toast = useToast()
    const copyTable = useCopyTable()
    const openMenu = (ctx: BaseContext, menu: string) => afterOverlaysClose(() => ctx.open.value = menu)

    /** As Obsidian's: a line break first if the cursor's line has text before it, one after; the cursor after it. */
    function insertBlock(tabId: string, text: string) {
        const view = editor.viewOf(tabId)
        if (!view) return
        const {from, to} = view.state.selection.main
        const line = view.state.doc.lineAt(from)
        const insert = `${from > line.from ? '\n' : ''}${text}\n`
        view.dispatch({changes: {from, to, insert}, selection: {anchor: from + insert.length - 1}, scrollIntoView: true})
        view.focus()
    }

    async function insertNewBase(tabId: string) {
        const untitled = t('plugins.bases.untitled')
        // Unused anywhere, not only at the root: the editor resolves `![[name]]` to the first file of that name.
        const taken = new Set(index.files().filter(f => !f.isFolder).map(f => f.fileName))
        let name = `${untitled}.base`
        for (let i = 1; taken.has(name); i++) name = `${untitled} ${i}.base`
        try {
            await files.create('', name)
            insertBlock(tabId, `![[${name}]]`)
        } catch (error) {
            toast.add({title: String(error), color: 'error', icon: 'lucide:circle-alert'})
        }
    }

    return computed<PaletteItem[]>(() => {
        const ctx = active.value
        const tabId = tabs.active()
        const note = tabId ? index.byUuid(tabId) : undefined
        return [
            ...(note && note.fileExt === 'md'
                ? [{id: 'bases:insert', label: t('plugins.bases.commands.insert'), icon: 'i-lucide-table', onSelect: () => void insertNewBase(note.uuid)}]
                : []),
            ...(ctx
                ? [
                    {id: 'bases:addView', label: t('plugins.bases.commands.addView'), icon: 'i-lucide-plus', onSelect: () => openMenu(ctx, 'addView')},
                    {id: 'bases:switchView', label: t('plugins.bases.commands.switchView'), icon: 'i-lucide-layout-dashboard', onSelect: () => openMenu(ctx, 'views')},
                    {id: 'bases:copyTable', label: t('plugins.bases.commands.copyTable'), icon: 'i-lucide-copy', onSelect: () => copyTable(ctx)},
                    {id: 'bases:addItem', label: t('plugins.bases.commands.addItem'), icon: 'i-lucide-file-plus', onSelect: () => ctx.newItem()},
                ]
                : []),
        ]
    })
}
