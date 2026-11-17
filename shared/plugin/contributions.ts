/**
 * What a plugin adds to the workbench and the editor (Plugin Architecture Plan, K3 and K4): the definitions it registers
 * through `ctx`. Ids are global (panel views and tab kinds are saved in layouts and sessions), so a plugin starts its
 * own with its id.
 */
import type {Extension} from '@codemirror/state'
import type {MarkdownOptions} from '@type32/codemirror-rich-obsidian-editor'
import type {EditorAction} from '@type32/codemirror-rich-obsidian-editor/kit'
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
    /** The shown view's own search (`PanelViewDef.search`), when it has one. */
    shownSearch: (() => void) | undefined
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

/** What an overlay is drawn with. */
export interface OverlayProps {
    session: SessionContext
}

/** UI drawn once in each session window, over its layout (the command palette). */
export interface OverlayDef extends UiSlot<OverlayProps> {
    id: string
    /** Whether it's drawn in this window; absent = always. */
    when?: (ctx: PanelViewContext) => boolean
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
    /** The window's session, as `onSession` gets it: the viewer draws once it's handed to plugins. */
    session: SessionContext
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

/** What a status item is drawn with: the shown file's text (empty for a viewer that doesn't load it) and where it is. */
export interface StatusItemProps {
    text: string
    /** As `ViewerProps.filePath`. */
    filePath: string
    /** The file's id in the workspace index, also its tab's id (`session.editor.viewOf(fileId)`). */
    fileId: string
    session: SessionContext
}

/** Something a viewer shows besides its content: in its status bar (the word counter), or at its side (the line outline). */
export interface StatusItemDef extends UiSlot<StatusItemProps> {
    id: string
    /** The viewers it shows for; default every one that loads text. */
    viewers?: string[]
    /** `bar` (default): in the status bar, after the viewer's own items. `side`: over the content's right edge, centred. */
    placement?: 'bar' | 'side'
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
    /** Keys shown beside it (`['meta', 'z']`); a hint only. */
    kbds?: string[]
    color?: 'error'
    onSelect?: () => unknown
    children?: PluginMenuItem[]
}

/** What the file menu is for: the rows right-clicked (several when a selection is). */
export interface FileMenuTarget {
    session: ActiveSession
    files: ActiveWorkspaceFileIndex[]
}

/** A group of items in the file menu of a row or a selection (Run workflow). */
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
    /** The page's plugin's config in the scope Settings is editing (User, or a workspace). */
    config: ScopedConfig
}

/**
 * A plugin's config as Settings edits it: in User, or in a workspace (its overrides, as far as the manifest's
 * `config.overridable` lets it). Paths are inside the config (`features.chat`).
 */
export interface ScopedConfig {
    /** The workspace being edited (its root), or `null` for User. */
    readonly root: string | null
    /** Whether that workspace is trusted, so its trusted-only overrides apply. */
    readonly trusted: boolean
    /** The config in effect in this scope (the workspace's applicable overrides on User's), as stored. Reactive. */
    readonly effective: Record<string, unknown>
    /** This scope's own value at `path` (a workspace's even before it applies), else the effective one. */
    value(path: string): unknown
    /** Writes paths in this scope; `null` removes one (in a workspace: Use global). */
    set(patch: Record<string, unknown>): Promise<unknown>
    /** Whether the workspace overrides `path` (or something under it). */
    overridden(path: string): boolean
    /** In User: whether any of `paths` differs from `defaults` (the config's defaults). In a workspace: overridden. */
    isDirty(paths: string[], defaults: Record<string, unknown>): boolean
    /** Puts `paths` back: to `defaults` in User, to the global values in a workspace (its overrides go). */
    reset(paths: string[], defaults: Record<string, unknown>): Promise<unknown>
    /** The full setting path of `path` (`plugins.config.<id>.<path>`), for `SettingsRow`'s `setting`. */
    path(path: string): `plugins.config.${string}`
}

/** A page in the Settings window, at `/settings/<id>/…`, listed in its nav with its plugin's group. */
export interface SettingsPageDef extends UiSlot<SettingsPageProps> {
    id: string
    /** i18n key. */
    label: string
    /** Default: its plugin's manifest's `icon`. */
    icon?: string
    /** Sub-entries in the nav (`path` below the page); a page with children is a group. */
    children?: { label: string, icon: string, path: string }[]
}

/** What a home action can do from the start page. */
export interface HomeActionContext {
    /** Opens a folder as a workspace (in its window, or this one). */
    openWorkspace(path: string): Promise<unknown>
}

/** A button on the start page (Clone Workspace…). */
export interface HomeActionDef {
    id: string
    /** i18n key. */
    label: string
    icon: string
    run(home: HomeActionContext): unknown
}

// Editor

/** The note an editor shows, as what a plugin adds to that editor sees it. */
export interface EditorHost {
    session: SessionContext
    /** The note's path as its viewer has it (`ViewerProps.filePath`): `this` for a base embedded in it. */
    notePath: string
}

/** A fenced code block a plugin draws (` ```mermaid `), in notes, callouts, table cells and canvas cards. */
export interface CodeBlockDef extends UiSlot<{ codeContent: string, host: EditorHost }> {
    /** The fence's info string. */
    language: string
}

/**
 * What an embed is drawn with: the editor's props for `![[file#subpath|display]]`, `host`, and `assetUrl`; or what a
 * canvas card gives it (`card`).
 */
export interface EmbedProps {
    /** The embedded file's path, workspace-relative. */
    filePath: string
    /** After `#` (`View` in `![[x.base#View]]`). */
    subpath?: string
    /** After `|` (`300` in `![[x.png|300]]`). */
    display?: string
    /** A URL the webview can load the file from, as `ViewerProps.assetUrl`. */
    assetUrl: string
    host: EditorHost
    /** It fills a box (a canvas card) instead of sitting in a note's flow. */
    card?: boolean
    [prop: string]: unknown
}

/** `![[file]]` drawn by a plugin, for the files it matches. */
export interface EmbedDef extends UiSlot<EmbedProps> {
    id: string
    /** The embedded file's extension, lowercase, without the dot. */
    match(extension: string): boolean
    /** How `![[…]]` names the file: `fileName` (default) with its extension (`photo.png`), `name` without (`Board`). */
    linkName?: 'name' | 'fileName'
}

/**
 * A CodeMirror extension for the note editor. A function gets each editor's host; whatever it returns must be the same
 * objects on every call (module constants; options through a facet), or CodeMirror remounts them on every change.
 */
export interface EditorExtensionDef {
    extension: Extension | ((host: EditorHost) => Extension)
    /** Also in callouts, table cells and canvas cards (the editor's `nestedExtensions`). Default: the note's own editor only. */
    nested?: boolean
}

/** Markdown syntax added to the editor's parser (a Lezer `MarkdownConfig`); drawing what it parses is an extension's job. */
export type MarkdownSyntaxDef = NonNullable<MarkdownOptions['extensions']> extends readonly (infer C)[] ? C : never

/** An item in the editor's slash menu or selection toolbar: the editor's `EditorAction`, with `label` an i18n key. */
export type EditorActionDef = EditorAction

/** What the note's right-click menu is for. */
export interface NoteMenuTarget {
    host: EditorHost
    /** The selected text; empty when nothing is. */
    selection: string
}

/** A group of items in the note's right-click menu (Ask in chat). An item's `onSelect` runs once the menu has closed. */
export interface NoteMenuItemDef {
    id: string
    items(target: NoteMenuTarget): PluginMenuItem[]
}

// Index

/** Links in a file format the index doesn't read as markdown (a canvas's cards), for backlinks and link updates. */
export interface LinkExtractorDef {
    id: string
    /** The file's extension, lowercase, without the dot. */
    match(extension: string): boolean
    /** The link targets as written (`target` of `[[target]]`); `getInternalLinks` reads markdown's, for text inside the file. */
    targets(text: string, getInternalLinks: (text: string) => { path: string }[]): string[]
    /** After renames (`rename`: old target → new), the text with its links updated and how many changed. Without it, links in these files aren't updated. */
    rewrite?(text: string, rename: Map<string, string>): { text: string, count: number }
}

/** Every contribution point, by the name the host registers it under. */
export interface ContributionPoints {
    command: PluginCommand & { plugin: string }
    paletteGroup: PaletteGroupDef
    panel: PanelViewDef
    overlay: OverlayDef
    tabKind: TabKindDef
    viewer: ViewerDef
    statusItem: StatusItemDef
    fileType: FileTypeDef
    fileMenuItem: FileMenuItemDef
    settingsPage: SettingsPageDef
    homeAction: HomeActionDef
    codeBlock: CodeBlockDef
    embed: EmbedDef
    editorExtension: EditorExtensionDef
    markdownSyntax: MarkdownSyntaxDef
    slashItem: EditorActionDef
    toolbarItem: EditorActionDef
    noteMenuItem: NoteMenuItemDef
    linkExtractor: LinkExtractorDef
}
