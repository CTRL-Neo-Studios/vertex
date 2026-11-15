/**
 * The plugin contract: what a plugin's entry exports and what its `setup` is given. It holds only what the host
 * implements; each phase of the Plugin Architecture Plan adds its contribution points here.
 */
import type {ActiveSession} from '#shared/types/active/sessions'
import type {PanelViewId} from '#shared/types/app/settings'
import type {FileMenuItemDef, FileTypeDef, HomeActionDef, PaletteGroupDef, PanelViewDef, SettingsPageDef, StatusItemDef, TabKindDef, ViewerDef} from './contributions'
import type {PluginManifest, WindowKind} from './manifest'

export type {ActiveSession}
export type {PluginManifest, WindowKind}
export type * from './contributions'

/** `builtin`: a feature not extracted into its layer yet (Plugin Architecture Plan, X phases): always on, not in Settings. */
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

/** What `onSession` callbacks get: the window's session once its index is built. */
export interface SessionContext {
    session: ActiveSession
    views: {
        /** Shows a panel view in its pane (out of Hidden, the area expanded), or in a tab when no pane can show it. */
        show(id: PanelViewId): unknown
        /** Opens a `tab: true` view in a tab. */
        openInTab(id: PanelViewId): unknown
    }
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

export interface PluginContext<Config = Record<string, unknown>> {
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
    }
    files: {
        type(def: FileTypeDef): () => void
        /** Items in Files' row menu. */
        menuItem(def: FileMenuItemDef): () => void
    }
    settings: {
        page(def: SettingsPageDef): () => void
    }
    home: {
        action(def: HomeActionDef): () => void
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
