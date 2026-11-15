/**
 * The plugin contract: what a plugin's entry exports and what its `setup` is given. It holds only what the host
 * implements; each phase of the Plugin Architecture Plan adds its contribution points here.
 */
import type {ActiveSession} from '#shared/types/active/sessions'
import type {PluginManifest, WindowKind} from './manifest'

export type {ActiveSession}
export type {PluginManifest, WindowKind}

export type PluginSource = 'core' | 'global' | 'workspace'

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
    /** Shows it in the native menu: in `section`, after the kernel's items, groups separated. */
    menu?: { section: MenuSection, group?: number }
    /** Shows it in the command palette's Commands group. */
    palette?: boolean
}

/** What `onSession` callbacks get: the window's session once its index is built. */
export interface SessionContext {
    session: ActiveSession
}

/**
 * Plugins' APIs by plugin id. A plugin that offers one declares it in its `app/api.ts`:
 * `declare module '#shared/plugin/api' { interface PluginApis { 'my-plugin': MyApi } }`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- filled by module augmentation
export interface PluginApis {}

export interface PluginContext {
    plugin: { id: string, version: string, source: PluginSource }
    window: { kind: WindowKind, label: string }
    commands: {
        /** Removed when the plugin stops, or with the session when called from an `onSession` callback. */
        register(command: PluginCommand): () => void
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

export interface PluginDefinition {
    /**
     * Runs once per window. Synchronous: what it registers belongs to the plugin's effect scope, which an `await` would
     * leave. Async work belongs in what it registers (commands, `onSession`).
     */
    setup(ctx: PluginContext): void
}

/** A plugin's entry (`app/plugin.ts`) default-exports `definePlugin({setup(ctx) {…}})`. */
export const definePlugin = (definition: PluginDefinition): PluginDefinition => definition

/** A plugin the host can start: its manifest and how to load its entry. */
export interface PluginEntry {
    manifest: PluginManifest
    source: PluginSource
    load(): Promise<{ default: PluginDefinition }>
}
