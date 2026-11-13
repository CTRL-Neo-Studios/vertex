import type {CommandPaletteItem} from "@nuxt/ui";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {BaseContext} from "~/composables/bases/useBaseContext";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {tableCells, toTsv} from "~/utils/basesTable";
import {afterOverlaysClose} from "~/utils/overlays";

/** The base open in this window's tab (set while its `BasesViewer` is mounted), for the palette's Bases commands. */
const active = shallowRef<BaseContext | null>(null)

/** Called by `BasesViewer`: its commands are in the palette while it's mounted. */
export function registerBaseCommands(ctx: BaseContext) {
    active.value = ctx
    onBeforeUnmount(() => {
        if (active.value === ctx) active.value = null
    })
}

/** Copies a view's table as Obsidian's "Copy to clipboard" does (TSV), with a toast. */
export function useCopyTable() {
    const {t} = useI18n()
    const $qt = useQuickToasts()
    return async (ctx: BaseContext) => {
        try {
            await writeText(toTsv(tableCells(ctx.view.value.order, id => ctx.property(id).label, ctx.result.value.rows)))
            $qt.success(t('app.editor.ui.bases.copied'))
        } catch (error) {
            $qt.error(String(error))
        }
    }
}

/** "Bases: Add view", "Switch view…", "Copy table", "Add item", while a base is open. */
export function useBaseCommandItems() {
    const {t} = useI18n()
    const copyTable = useCopyTable()
    const openMenu = (ctx: BaseContext, menu: string) => afterOverlaysClose(() => ctx.open.value = menu)
    return computed<CommandPaletteItem[]>(() => {
        const ctx = active.value
        if (!ctx) return []
        return [
            {id: 'bases:addView', label: t('app.editor.ui.bases.commands.addView'), icon: 'i-lucide-plus', onSelect: () => openMenu(ctx, 'addView')},
            {id: 'bases:switchView', label: t('app.editor.ui.bases.commands.switchView'), icon: 'i-lucide-layout-dashboard', onSelect: () => openMenu(ctx, 'views')},
            {id: 'bases:copyTable', label: t('app.editor.ui.bases.commands.copyTable'), icon: 'i-lucide-copy', onSelect: () => copyTable(ctx)},
            {id: 'bases:addItem', label: t('app.editor.ui.bases.commands.addItem'), icon: 'i-lucide-file-plus', onSelect: () => openMenu(ctx, 'new')},
        ]
    })
}
