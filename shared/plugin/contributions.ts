/**
 * What a plugin adds to the workbench (Plugin Architecture Plan, K3): the definitions it registers through `ctx`. Ids
 * are global (panel views and tab kinds are saved in layouts and sessions), so a plugin starts its own with its id.
 */
import type {Component} from 'vue'
import type {ActiveSession} from '#shared/types/active/sessions'
import type {ActiveWorkspaceFileIndex} from '#shared/types/active/workspace'
import type {AppSettings, PanelArea, PanelViewId} from '#shared/types/app/settings'
import type {PanelList} from '#shared/utils/panelLayout'
import type {PluginCommand, SessionContext} from './api'

export type ComponentLoader = () => Promise<Component | { default: Component }>

/**
 * UI a plugin draws, given as one of: `component`, a lazily loaded Vue component that gets the props; or `mount`,
 * which draws into `el` and returns what undoes it (it runs again, after that, when the props change). Either way it
 * draws inside an error boundary that names the plugin.
 */
export interface UiSlot<Props> {
    component?: ComponentLoader
    mount?: (el: HTMLElement, props: Props) => (() => void) | undefined
}

// Panel views

/** What a view's `when` sees: the session window it would show in. */
export interface PanelViewContext {
    session: ActiveSession | undefined
    isWorkspace: boolean
    /** The focused tab's file; `undefined` for another kind of tab or no tab. */
    activeFile: ActiveWorkspaceFileIndex | undefined
    /** The id of the viewer showing the focused tab's file (`markdown`, `bases`…). */
    activeViewer: string | undefined
    /** The effective settings (the workspace's overrides applied). */
    settings: AppSettings | undefined
}

/** What an action and its shortcut hint see: the context, plus the area its button is in and the view shown there. */
export interface PanelActionContext extends PanelViewContext {
    area: PanelArea
    /** The view shown in the pane holding the button, `undefined` when the area is collapsed. */
    shown: PanelViewId | undefined
}

/** A button a view puts in its panel's header (refresh, new, collapse all…). */
export interface PanelViewAction {
    id: string
    /** Shown text (already translated): the tooltip and the accessible name. */
    label: string
    icon: string
    onSelect: () => unknown
    disabled?: boolean
}

/** What a view is drawn with, in a pane or in a tab. */
export interface PanelViewProps {
    session: SessionContext
    placement: 'panel' | 'tab'
    /** Its header buttons (what `usePanelActions` does for a component). */
    actions(list: PanelViewAction[]): void
}

/** A panel view: either a `component`/`mount` shown in a pane (on a side or at the bottom), or an `action` its button runs (Search). */
export interface PanelViewDef extends UiSlot<PanelViewProps> {
    id: PanelViewId
    /** i18n key. */
    label: string
    icon: string
    /** Where the view first goes when a layout doesn't hold it. */
    defaultArea: PanelList
    /** Runs inside the Nuxt app's context, so it may use `useState`. */
    action?: (ctx: PanelActionContext) => void
    /** Whether the view can show in this window; absent = always. */
    when?: (ctx: PanelViewContext) => boolean
    /** Wrap it in the panel's fading scroll area (views that don't scroll on their own). */
    scroll?: boolean
    /** It may open in a tab of its own (tab kind `view`, id = view id) as well as in its pane, so it must work mounted twice. */
    tab?: boolean
    /** Keyboard hint on its button. */
    kbds?: (ctx: PanelActionContext) => string[] | undefined
    /** What the Search button does while this view is shown (the Chats view searches chats); absent = the palette. */
    search?: (ctx: PanelActionContext) => void
}

// Tabs

export interface TabProps {
    session: SessionContext
    /** The tab's id within its kind (a chat id, a diff spec). */
    id: string
}

/** A kind of tab other than a file's. */
export interface TabKindDef extends UiSlot<TabProps> {
    kind: string
    /** Name and icon in the tab bar and the switcher, already translated; `undefined` when what it shows is gone. */
    describe(id: string): { label: string, icon: string } | undefined
    /** Reopened after a relaunch. */
    persist?: boolean
    /** Whether a saved tab still has something to show, checked before it's reopened; absent = always. */
    exists?(id: string): boolean
}

// File viewers

/**
 * What a viewer is drawn with. A `component` gets these as props, with `v-model` for `modelValue`, `fileName` and
 * `contentSaved`, and emits `rename(oldName)` (its `onRename`) when its title edit ends. A `mount` gets the same object
 * with `setText` in place of the `modelValue` update.
 */
export interface ViewerProps {
    sessionId: string
    /** The file's id in the workspace index (also its tab's id). */
    fileId: string
    /** The display path: relative to the workspace, or absolute in a singlespace window. */
    filePath: string
    /** Without its extension; the viewer's title edits it. */
    fileName: string
    'onUpdate:fileName'(name: string): void
    /** The file's text, for a viewer with `loadsText`; changing it autosaves the file. */
    modelValue?: string
    'onUpdate:modelValue'?(text: string): void
    contentSaved: boolean
    'onUpdate:contentSaved'(saved: boolean): void
    renaming: boolean
    disabled: boolean
    /** A URL the webview can load the file from (images, media). */
    assetUrl: string
    /** The title edit ended: the tab renames the file to `fileName`, or puts `oldName` back when it can't. */
    onRename(oldName: string): void
}

export interface ViewerMountProps extends ViewerProps {
    setText(text: string): void
}

export interface ViewerDef extends UiSlot<ViewerProps> {
    id: string
    /** Lowercase extension without the dot. */
    match(ext: string): boolean
    /** The tab reads the file as UTF-8, passes it as `modelValue` and autosaves what comes back. */
    loadsText: boolean
    /** Session modes it works in; default both. */
    modes?: ('workspace' | 'singlespace')[]
    /** Higher wins when several match; default 0 (a fallback like the code viewer uses a negative one). */
    priority?: number
}

/** Something in a viewer's status bar (the word counter). */
export interface StatusItemDef extends UiSlot<{ text: string, filePath: string }> {
    id: string
    /** The viewers it shows for; default every one that loads text. */
    viewers?: string[]
}

// Files

export interface FileTypeDef {
    id: string
    /** Lowercase, without the dot. */
    extensions: string[]
    icon: string
    /** i18n key: what the file type is called ("Canvas"). */
    label: string
    /**
     * Offers New for it in File → New, Files' menus and the palette. i18n keys: `label` ("New Canvas"); `command`, File
     * → New's label when it differs ("New Canvas…"); `description`, the palette's.
     */
    new?: { label: string, command?: string, description?: string }
}

/** An item in a plugin's menu (Nuxt UI's menu item, as far as plugins need). */
export interface PluginMenuItem {
    label: string
    icon?: string
    description?: string
    disabled?: boolean
    onSelect?: () => unknown
    children?: PluginMenuItem[]
}

/** What Files' row menu is for: the rows right-clicked (several when a selection is). */
export interface FileMenuTarget {
    session: ActiveSession
    files: ActiveWorkspaceFileIndex[]
}

/** A group of items in Files' row menu (Run workflow). */
export interface FileMenuItemDef {
    id: string
    items(target: FileMenuTarget): PluginMenuItem[]
}

// Palette

export interface PaletteItem {
    id: string
    label: string
    description?: string
    icon?: string
    disabled?: boolean
    onSelect(): unknown
}

/** A group in the command palette, computed when it's drawn (the open base's commands, each workflow). */
export interface PaletteGroupDef {
    id: string
    /** Already translated. */
    label(): string
    items(): PaletteItem[]
    /** Groups sort by it, then by registration; the kernel's Quick actions are 0, Commands 10, Files 100. Default 50. */
    order?: number
}

// Settings and home

export interface SettingsPageProps {
    /** The route below the page (`/settings/ai/providers/x` → `['providers', 'x']`). */
    path: string[]
}

/** A page in the Settings window, at `/settings/<id>/…`, listed in its nav after the kernel's. */
export interface SettingsPageDef extends UiSlot<SettingsPageProps> {
    id: string
    /** i18n key. */
    label: string
    icon: string
    /** Sub-entries in the nav (`path` below the page); a page with children is a group. */
    children?: { label: string, icon: string, path: string }[]
}

/** A button on the start page (Clone Workspace…). */
export interface HomeActionDef {
    id: string
    /** i18n key. */
    label: string
    icon: string
    run(): unknown
}

/** Every contribution point, by the name the host registers it under. */
export interface ContributionPoints {
    command: PluginCommand & { plugin: string }
    paletteGroup: PaletteGroupDef
    panel: PanelViewDef
    tabKind: TabKindDef
    viewer: ViewerDef
    statusItem: StatusItemDef
    fileType: FileTypeDef
    fileMenuItem: FileMenuItemDef
    settingsPage: SettingsPageDef
    homeAction: HomeActionDef
}
