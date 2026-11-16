/**
 * The plugin contract: what a plugin's entry exports and what its `setup` is given. It holds only what the host
 * implements; each phase of the Plugin Architecture Plan adds its contribution points here.
 */
import type {Extension} from '@codemirror/state'
import type {EditorView} from '@codemirror/view'
import type {Ref} from 'vue'
import type {ActiveSession} from '#shared/types/active/sessions'
import type {ActiveWorkspaceFileIndex, UITreeNode, WorkspaceIndexListener} from '#shared/types/active/workspace'
import type {Vault} from '#shared/utils/vault'
import type {PanelViewId} from '#shared/types/app/settings'
import type {
    CodeBlockDef, EditorActionDef, EditorHost, EmbedDef, FileMenuItemDef, FileTypeDef, HomeActionDef, LinkExtractorDef,
    MarkdownSyntaxDef, NoteMenuItemDef, OverlayDef, PaletteGroupDef, PanelViewDef, PluginMenuItem, SettingsPageDef, StatusItemDef,
    TabKindDef, ViewerDef,
} from './contributions'
import type {PluginManifest, WindowKind} from './manifest'

export type {ActiveSession, ActiveWorkspaceFileIndex, UITreeNode}
export type {PluginManifest, WindowKind}
export type * from './contributions'

/** `builtin`: a feature not extracted into its layer yet (Plugin Architecture Plan, X phases), registered from `app/builtins/`. */
export type PluginSource = 'core' | 'global' | 'workspace' | 'builtin'

export type MenuSection = 'app' | 'file' | 'edit' | 'view' | 'help'

export interface PluginCommand {
    /** Unique within the plugin; it's registered as `<plugin id>:<id>`. */
    id: string
    /** i18n key. */
    label: string
    icon?: string
    run: () => unknown
    /** Evaluated whenever the menu or the palette is drawn. */
    enabled?: () => boolean
    /** Native menu accelerator (`CmdOrCtrl+Shift+G`); it works as a shortcut while the item is in the menu. */
    accelerator?: string
    /** Shows it in the native menu: in `section`, after the kernel's items of the same group (default 100, at the end), groups separated. */
    menu?: { section: MenuSection, group?: number }
    /** Shows it in the command palette's Commands group. */
    palette?: boolean
}

/** What the vault picker shows: files or folders of the workspace, one or several, of some extensions. */
export interface VaultPickOptions {
    title: string
    kind: 'file' | 'folder'
    multiple: boolean
    /** Comma-separated extensions without the dot (`png,jpg`); empty for any. */
    extensions?: string
}

/** An Open or Save dialog's options. */
export interface DialogOptions {
    title?: string
    /** A folder to start in, a path whose name is suggested, or a bare name. */
    defaultPath?: string
    filters?: { name: string, extensions: string[] }[]
}

/** What `onSession` callbacks get: the window's session once its index is built. */
export interface SessionContext {
    session: ActiveSession
    views: {
        /** Shows a panel view in its pane (out of Hidden, the area expanded), or in a tab when no pane can show it. */
        show(id: PanelViewId): unknown
        /** Opens a `tab: true` view in a tab. */
        openInTab(id: PanelViewId): unknown
    }
    /** The workspace's files and links (empty in a single-file window). Files by absolute path or uuid. */
    index: {
        files(): ActiveWorkspaceFileIndex[]
        /** Folders and files as Files shows them: the top level, each folder's children, sorted. Reactive. */
        tree(): UITreeNode[]
        byPath(path: string): ActiveWorkspaceFileIndex | undefined
        byUuid(uuid: string): ActiveWorkspaceFileIndex | undefined
        /** The file a link target (`[[target]]`) finds, as the editor resolves it. */
        resolveLink(target: string): ActiveWorkspaceFileIndex | undefined
        /** Uuids of the files linking to it / it links to. */
        backlinks(uuid: string): string[]
        forelinks(uuid: string): string[]
        /** Every resolved link as a pair of uuids. */
        links(): { from: string, to: string }[]
        /** A file's link targets that find no file. */
        unresolved(uuid: string): string[]
        /** Files created, removed, renamed, modified (removed with the session). */
        on(listener: WorkspaceIndexListener): () => void
    }
    /** The registered commands and palette groups, for a command palette. Reactive. */
    commands: {
        list(): readonly (PluginCommand & { plugin: string })[]
        paletteGroups(): readonly PaletteGroupDef[]
    }
    /**
     * The kernel's file operations. Those a file browser runs (menu, copy, paste, delete, drops) take uuids and
     * workspace-relative folders (`''` for the top level), and report failures themselves.
     */
    files: {
        /** A URL the webview can load an absolute path from (images, media). */
        assetUrl(path: string): string
        /** Writes a workspace file's text, by uuid, and updates the index. */
        write(uuid: string, text: string): Promise<void>
        /**
         * Creates an empty file named `name` in `folder` (workspace-relative, `''` for the top level; created when
         * missing) and indexes it. Throws when the path exists.
         */
        create(folder: string, name: string): Promise<ActiveWorkspaceFileIndex | undefined>
        /** New text for notes, by uuid, as one step of Files' undo history named `label`; open tabs of them reload. */
        edit(edits: { uuid: string, text: string }[], label: string): Promise<void>
        /** Moves files into `folder` (workspace-relative, `''` for the top level), with Files' clash prompts and undo. */
        move(uuids: string[], folder: string): Promise<unknown>
        /** Files' undo history: the last file operation undone, or the last undone one done again. */
        undo(): Promise<unknown>
        redo(): Promise<unknown>
        /**
         * Files from outside (a drop) as workspace uuids: ones the workspace has as they are, the rest copied into the
         * attachments folder (`fileConfig.attachmentsFolder`). Empty outside a workspace.
         */
        importAttachments(files: File[]): Promise<string[]>
        /** The vault picker: workspace-relative paths, `undefined` when it closes without a choice. */
        pick(options: VaultPickOptions): Promise<string[] | undefined>
        /**
         * The workspace as a `Vault` (`shared/plugin/vault.ts`), over workspace-relative paths: what it writes goes
         * through the index as the app's own edits do. Throws in a single-file window.
         */
        vault(): Vault
        /** The icon of a file named `name`: its file type's (`ctx.files.type`), or the folder properties file's; `undefined` for others. */
        iconFor(name: string): string | undefined
        /** The folders a file browser shows open, by uuid: saved with the session, restored with it. */
        openFolders: Ref<string[]>
        /**
         * The menu for rows of a file browser: one row's, a selection's, or the empty space's (`[]`). Plugins' items
         * (`ctx.files.menuItem`) come first. `added` gets what Paste and Duplicate made.
         */
        menuFor(uuids: string[], options?: { added?(uuids: string[]): void }): PluginMenuItem[][]
        /** New note, New folder, then each file type's New; each asks for a name, then creates it in `folder` (default the top level). */
        newItems(folder?: string): PluginMenuItem[]
        /** Puts the files on the system clipboard as files (Finder and Explorer paste them too). */
        copy(uuids: string[]): Promise<void>
        /** Copies the system clipboard's files into `folder`; in their own folder they're named like Keep both. The new uuids. */
        paste(folder: string): Promise<string[]>
        /** Deletes into a trash (with Undo), or asks first when deletes are for good (`fileConfig.deletedFiles`). */
        remove(uuids: string[]): Promise<unknown>
        /**
         * The OS files of a drop into `folder`: copied, or moved when they're the workspace's own (`copy` copies them
         * anyway). Call it inside the drop event. The new uuids.
         */
        importDrop(transfer: DataTransfer, folder: string, options?: { copy?: boolean }): Promise<string[]>
        drag: {
            /**
             * Starts a drag of the rows (inside `dragstart`): the drag image (a card per row, from `grab`, the row's
             * icon and name), `FILES_DRAG` for the editor and chat, and in the app a native drag Finder and Explorer
             * copy from. `ended` runs when it's over, also when the page never sees `dragend`.
             */
            start(event: DragEvent, uuids: string[], grab: Element | null, ended: () => void): void
            /** The workspace-relative paths of rows dragged from Files (a folder's ends with `/`); `undefined` for any other drag. */
            rows(transfer: DataTransfer | null): string[] | undefined
        }
    }
    /** The vault's property types (Obsidian's `types.json`: key → `text`, `multitext`, `number`…). Reactive. */
    properties: {
        types(): Readonly<Record<string, string>>
        /** `null`: Automatic (the type comes from the values). Saved to `.vertex/types.json`. */
        setType(key: string, type: string | null): Promise<void>
    }
    tabs: {
        /** Opens and shows a tab: a file's (by uuid), or another kind's (`kind`, `id`). */
        open(id: string, kind?: string): Promise<unknown>
        close(id: string): Promise<unknown>
        /** The shown tab's id (a file's uuid, or another kind's id). */
        active(): string | null
        list(): { kind?: string, id: string }[]
    }
    editor: {
        /** The note editor of a tab while it's mounted (its tab is shown). */
        viewOf(tabId: string): EditorView | undefined
        /** The embed a plugin registered for files of `extension` (lowercase, no dot): how `![[file]]` draws one. */
        embedFor(extension: string): EmbedDef | undefined
    }
    /**
     * Raw watcher events under a workspace-relative folder the index ignores (a dot folder: `.vertex/chats/`), each
     * batch's absolute paths. Removed with the session.
     */
    watch(prefix: string, fn: (paths: string[]) => void): () => void
}

/**
 * Plugins' APIs by plugin id. A plugin that offers one declares it in its `app/api.ts`:
 * `declare module '#shared/plugin/api' { interface PluginApis { 'my-plugin': MyApi } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by module augmentation
export interface PluginApis {}

/**
 * Plugins' config types by plugin id, for typed `plugins.config.<id>` setting paths. A plugin declares its own in its
 * `app/api.ts`: `declare module '#shared/plugin/api' { interface PluginConfigs { 'my-plugin': MyConfig } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by module augmentation
export interface PluginConfigs {}

/** Where a config write goes: the user's settings, or the window's workspace (only what the manifest lets it override). */
export type ConfigScope = 'global' | 'workspace'

export interface PluginConfigAccess<Config> {
    /** The effective config in this window (the workspace's overrides applied), schema fields checked and defaulted. Reactive. */
    readonly value: Config
    /** Writes paths inside the config (`{depth: 2}`); `null` removes one. Default scope: `global`. */
    set(patch: Record<string, unknown>, scope?: ConfigScope): Promise<void>
    /** Whether this window's workspace overrides the path. */
    overridden(path: string): boolean
}

/** A plugin's JSON document in one scope (`ctx.data`), kept by the kernel; writes are atomic. */
export interface Store<T> {
    /** `undefined` until something is set. */
    get(): Promise<T | undefined>
    set(value: T): Promise<void>
    /** Runs after every write to this document, from any window, with the new value; removed like a registration. */
    onChange(fn: (value: T | undefined) => void): () => void
}

/** The kernel's services every plugin gets (`ctx.http`, `ctx.secrets`, `ctx.data`), each kept apart per plugin. */
export interface HostServices {
    http: {
        /**
         * One GET from Rust, outside the webview's CORS, `init`'s `Accept` passed on. Redirects come back unfollowed,
         * the body stops past 2 MiB, and addresses on this computer or the local network are refused.
         */
        fetch(url: string, init?: { headers?: HeadersInit, signal?: AbortSignal | null }): Promise<Response>
    }
    /** Strings in the OS keychain, by name, this plugin's own. */
    secrets: {
        get(name: string): Promise<string | undefined>
        set(name: string, value: string): Promise<void>
        delete(name: string): Promise<void>
    }
    data: {
        /** The plugin's document in the app's data folder. */
        global: Store<unknown>
        /** The plugin's document in the window's workspace (`.vertex/plugins-data/`); `undefined` outside a workspace window. */
        workspace: Store<unknown> | undefined
    }
    /** The Open and Save dialogs; what's picked is this window's to read (open) or write (save). `null` when cancelled. */
    dialogs: {
        open(options?: DialogOptions & { directory?: boolean }): Promise<string | null>
        save(options?: DialogOptions): Promise<string | null>
    }
    /**
     * Trust for programs from a vault (the trusted folders and files, Settings → Trust), so every plugin that runs one
     * asks the same way. Paths are absolute; `hash` names a program's content (the format's `hash`).
     */
    trust: {
        /**
         * Whether it may run without asking: its file is trusted, or a covering folder (in content mode, with this
         * program). A record of another program was changed outside Vertex, and is dropped.
         */
        allows(path: string, hash: string): Promise<boolean>
        trustFile(path: string, hash: string): Promise<void>
        /** With `nested`, its subfolders too; `pin`: the program running now, which may be ahead of the disk. */
        trustFolder(path: string, nested: boolean, pin?: { file: string, hash: string }): Promise<void>
        /** An edit made in Vertex keeps the file's trust with its new program; a new file (`before` undefined) in a trusted folder gets it pinned. */
        followEdit(path: string, before: string | undefined, after: string): Promise<void>
        /** Files whose programs a folder's trust pins (in content mode, each as it is when the folder is trusted). */
        format(def: TrustedFormatDef): () => void
    }
}

/** A kind of file holding a program trust pins (`.workflow`). */
export interface TrustedFormatDef {
    /** Lowercase, without the dot. */
    extensions: string[]
    /** The program's hash; `undefined` for a file that doesn't load, which isn't pinned and asks when it runs. */
    hash(text: string): Promise<string | undefined>
}

export interface PluginContext<Config = Record<string, unknown>> extends HostServices {
    plugin: { id: string, version: string, source: PluginSource }
    window: { kind: WindowKind, label: string }
    config: PluginConfigAccess<Config>
    commands: {
        /** Removed when the plugin stops, or with the session when called from an `onSession` callback. */
        register(command: PluginCommand): () => void
        /** A group in the command palette. */
        paletteGroup(def: PaletteGroupDef): () => void
    }
    views: {
        panel(def: PanelViewDef): () => void
        tabKind(def: TabKindDef): () => void
        fileViewer(def: ViewerDef): () => void
        statusItem(def: StatusItemDef): () => void
        overlay(def: OverlayDef): () => void
    }
    files: {
        type(def: FileTypeDef): () => void
        /** Items in the file menu of a row or a selection (`session.files.menuFor`). */
        menuItem(def: FileMenuItemDef): () => void
    }
    settings: {
        page(def: SettingsPageDef): () => void
    }
    home: {
        action(def: HomeActionDef): () => void
    }
    editor: {
        /** Also in callouts, table cells and canvas cards with `{nested: true}`. */
        extension(extension: Extension | ((host: EditorHost) => Extension), options?: { nested?: boolean }): () => void
        codeBlock(def: CodeBlockDef): () => void
        embed(def: EmbedDef): () => void
        /** Markdown syntax the editor parses, in notes and everything nested in them. */
        markdown(syntax: MarkdownSyntaxDef): () => void
        slashItem(def: EditorActionDef): () => void
        toolbarItem(def: EditorActionDef): () => void
        /** Items in the note's right-click menu. */
        noteMenuItem(def: NoteMenuItemDef): () => void
    }
    index: {
        linkExtractor(def: LinkExtractorDef): () => void
    }
    /** Runs for the window's session once its index is built (now, if it already is); what it starts stops with the session. */
    onSession(fn: (session: SessionContext) => unknown): void
    /** This plugin's API, for the plugins that `use` it. */
    provide(api: object): void
    /** Another plugin's API: `undefined` when it isn't running in this window. */
    use<K extends keyof PluginApis>(id: K): PluginApis[K] | undefined
    /** Runs `fn` with another plugin's API once it's provided: now, or when that plugin starts. */
    whenPlugin<K extends keyof PluginApis>(id: K, fn: (api: PluginApis[K]) => void): void
}

export interface PluginDefinition<Config = Record<string, unknown>> {
    /**
     * Runs once per window. Synchronous: what it registers belongs to the plugin's effect scope, which an `await` would
     * leave. Async work belongs in what it registers (commands, `onSession`).
     */
    setup(ctx: PluginContext<Config>): void
}

/** A plugin's entry (`app/plugin.ts`) default-exports `definePlugin({setup(ctx) {…}})`; `Config` types `ctx.config`. */
export const definePlugin = <Config = Record<string, unknown>>(definition: PluginDefinition<Config>): PluginDefinition<Config> => definition

/** A plugin the host can start: its manifest and how to load its entry. */
export interface PluginEntry {
    manifest: PluginManifest
    source: PluginSource
    load(): Promise<{ default: PluginDefinition }>
}
