import type {CommandPaletteItem} from "@nuxt/ui";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {ActiveSession} from "#shared/types/active/sessions";
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveWorkspaceTools} from "~/composables/active/useActiveWorkspaceTools";
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

/**
 * "Bases: Add view", "Switch view…", "Copy table", "Add item", while a base is open; "Insert new base" while a note is:
 * as Obsidian's, an empty `Untitled.base` at the workspace root (it opens on Obsidian's default table view), embedded
 * at the note's cursor.
 */
export function useBaseCommandItems(session: ActiveSession) {
    const {t} = useI18n()
    const $qt = useQuickToasts()
    const copyTable = useCopyTable()
    const $index = useActiveWorkspaceIndex(session)
    const tools = useActiveWorkspaceTools(session)
    const {activeTabUuid} = useActiveTabs(session)
    const {dispatcher} = useActiveEditorDispatcher(session)
    const openMenu = (ctx: BaseContext, menu: string) => afterOverlaysClose(() => ctx.open.value = menu)

    async function insertNewBase() {
        const untitled = t('app.editor.ui.bases.untitled')
        // Unused anywhere, not only at the root: the editor resolves `![[name]]` to the first file of that name.
        const taken = new Set($index.getFilteredFiles(f => !f.isFolder).map(f => f.fileName))
        let name = `${untitled}.base`
        for (let i = 1; taken.has(name); i++) name = `${untitled} ${i}.base`
        try {
            await tools.createFile(undefined, name)
            dispatcher.emit('editor.insertBlock', {text: `![[${name}]]`})
        } catch (error) {
            $qt.error(String(error))
        }
    }

    return computed<CommandPaletteItem[]>(() => {
        const ctx = active.value
        const note = $index.getFileByUuid(activeTabUuid.value ?? undefined)
        return [
            ...(note && getFileExtensionFromPath(note.fileName) === 'md'
                ? [{id: 'bases:insert', label: t('app.editor.ui.bases.commands.insert'), icon: 'i-lucide-table', onSelect: () => void insertNewBase()}]
                : []),
            ...(ctx
                ? [
                    {id: 'bases:addView', label: t('app.editor.ui.bases.commands.addView'), icon: 'i-lucide-plus', onSelect: () => openMenu(ctx, 'addView')},
                    {id: 'bases:switchView', label: t('app.editor.ui.bases.commands.switchView'), icon: 'i-lucide-layout-dashboard', onSelect: () => openMenu(ctx, 'views')},
                    {id: 'bases:copyTable', label: t('app.editor.ui.bases.commands.copyTable'), icon: 'i-lucide-copy', onSelect: () => copyTable(ctx)},
                    {id: 'bases:addItem', label: t('app.editor.ui.bases.commands.addItem'), icon: 'i-lucide-file-plus', onSelect: () => openMenu(ctx, 'new')},
                ]
                : []),
        ]
    })
}
