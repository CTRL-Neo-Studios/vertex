import type {
    CodeBlockDef, EditorActionDef, EditorExtensionDef, EmbedDef, FileMenuItemDef, FileTypeDef, HomeActionDef, LinkExtractorDef,
    MarkdownSyntaxDef, NoteMenuItemDef, PaletteGroupDef, SettingsPageDef, StatusItemDef, TabKindDef, ViewerDef,
} from '#shared/plugin/api'
import {panelViews} from '~/utils/panelViews'
import {createList, createRegistry} from '~/utils/registry'

/**
 * The contribution points (Plugin Architecture Plan, K3 and K4), besides commands (`commands.ts`) and panel views
 * (`panelViews.ts`). The kernel registers its own here at import; plugins through `ctx` (`runtime.ts`).
 */
export const tabKinds = createRegistry<TabKindDef>('tab kind', d => d.kind)
export const fileViewers = createRegistry<ViewerDef>('file viewer', d => d.id)
export const statusItems = createRegistry<StatusItemDef>('status item', d => d.id)
export const fileTypes = createRegistry<FileTypeDef>('file type', d => d.id)
export const fileMenuItems = createRegistry<FileMenuItemDef>('file menu item', d => d.id)
export const paletteGroups = createRegistry<PaletteGroupDef>('palette group', d => d.id)
export const homeActions = createRegistry<HomeActionDef>('home action', d => d.id)

// The editor's (K4): what every note editor draws with (`useNoteEditor`), and the index's link extractors.
export const codeBlocks = createRegistry<CodeBlockDef>('code block', d => d.language)
export const embeds = createRegistry<EmbedDef>('embed', d => d.id)
export const editorExtensions = createList<EditorExtensionDef>()
export const markdownSyntax = createList<MarkdownSyntaxDef>()
export const slashItems = createRegistry<EditorActionDef>('slash item', d => d.id)
export const toolbarItems = createRegistry<EditorActionDef>('toolbar item', d => d.id)
export const noteMenuItems = createRegistry<NoteMenuItemDef>('note menu item', d => d.id)
export const linkExtractors = createRegistry<LinkExtractorDef>('link extractor', d => d.id)

const settingsPageRegistry = createRegistry<SettingsPageDef>('settings page', d => d.id)
/** The kernel's own settings pages (file routes, which win over a registered page's): their ids are refused. */
const KERNEL_SETTINGS_PAGES = ['general', 'theme', 'view', 'plugins']
export const settingsPages = {
    ...settingsPageRegistry,
    register(def: SettingsPageDef) {
        if (KERNEL_SETTINGS_PAGES.includes(def.id)) throw new Error(`settings page "${def.id}" is the kernel's`)
        return settingsPageRegistry.register(def)
    },
}

/** A panel view open in a tab (`usePanels.openInTab`; the id is the view's): only views with `tab`, reopened after a relaunch. */
tabKinds.register({
    kind: 'view',
    describe(id) {
        const view = panelViews.get(id)
        return view && {label: useNuxtApp().$i18n.t(view.label), icon: view.icon}
    },
    persist: true,
    exists: id => !!panelViews.get(id)?.tab,
    component: () => import('~/components/LayoutComponents/PanelViewTab.vue'),
})
