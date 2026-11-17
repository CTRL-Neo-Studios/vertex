import type {FileTrustMode} from "#shared/utils/trust"
import type {PluginConfigs} from "#shared/plugin/api"

export type SessionRecoveryMode = 'none' | 'workspaces' | 'singlespaces' | 'both'

export interface AppSettings {
    /** Which session windows to reopen on launch. Replaces the old `openLastOpenedWindows` boolean. */
    recoverSessions: SessionRecoveryMode,
    /** UI language code (`en`, `zh-CN`), or `system` to follow the OS language. */
    language: string,
    themeConfig: AppThemeConfig,
    advancedThemeConfig: AppAdvancedThemeConfig,
    viewConfig: AppViewConfig,
    /** Global only: what trust remembers (the trusted folders and files themselves are in `trust.json`). */
    trustConfig: AppTrustConfig,
    /** Moving and renaming files; workspace-overridable. */
    fileConfig: AppFileConfig,
    /** Plugins: which are on, and their config. Workspace-overridable as their manifests allow (`settingsAllowlist`). */
    plugins: AppPluginsConfig,
	deviceId: string,
    /** Update channel (stable, beta, …); sent to the updater backend as `x-updater-channel`. */
    updateChannel: string
}

export interface AppPluginsConfig {
    /**
     * Plugin id → on or off; a plugin not listed follows its manifest's `enabledByDefault` (on). A workspace may turn
     * any off; only a trusted one may turn one on.
     */
    enabled: Record<string, boolean>,
    /**
     * Plugin id → its config, as stored: a plugin's schema defaults apply when it runs (`pluginConfig`). Kept for plugins
     * this device doesn't have. Typed for the plugins that declare `PluginConfigs`.
     */
    config: { [Id in keyof PluginConfigs]?: PluginConfigs[Id] },
    /** Plugin id → where it was installed from (C phases): a vault that uses it can offer to install it. */
    sources: Record<string, string>,
}

export interface AppFileConfig {
    /**
     * After a move or rename changes links to a note (or to the notes in a folder): ask each time, update them, or
     * keep them as written. The link dialog's "Remember my decision" sets it for the workspace.
     */
    updateLinks: 'ask' | 'update' | 'keep',
    /** Where files from outside go when chat or the editor takes them (and pasted screenshots), relative to the
     *  workspace; created when first needed. */
    attachmentsFolder: string,
    /** OS files dropped or pasted into chat are copied into the workspace first: ask each time, or always do it. */
    importToChat: 'ask' | 'always',
    /**
     * Where Files' Delete sends items: the system Trash (Recycle Bin), the workspace's `.trash/` folder (hidden from
     * Files), or nowhere (deleted for good, after a confirmation, and not undoable).
     */
    deletedFiles: 'trash' | 'workspaceTrash' | 'permanent',
}

/** Trusted folders and files aren't settings: they live in `trust.json` (`shared/utils/trust.ts`). */
export interface AppTrustConfig {
    /** What a trusted file remembers: its path, or its path and program (an edit outside Vertex asks again). */
    fileTrust: FileTrustMode,
}

export interface AppThemeConfig {
    primaryColor: string,
    neutralColor: string,
    roundedRadius: number,
    appFont: string,
    editorFont: string,
    appMonoFont: string,
    editorMonoFont: string,
    blackAsPrimary: boolean,
    /** Kept in settings (not the color-mode module's per-window storage) so every window follows it. */
    colorMode: 'light' | 'dark' | 'system'
}

export interface AppAdvancedThemeConfig {
    customCss: string,
}

export interface AppViewConfig {
    editorPanel: {
        showStatusBar: 'show-on-hover' | 'always-shown' | 'always-hidden',
        selectionToolbar: boolean,
        slashMenu: boolean,
        blockHandle: boolean,
        /** Where the header shows undo/redo and the formatting buttons; `hidden` turns them off. */
        headerHistory: HeaderToolsPosition,
        headerFormatting: HeaderToolsPosition,
    },
    /** The side panels' views: which side each sits on, in what order (with separators), or hidden; and how they're switched. */
    panels: AppPanelsConfig,
}

export type HeaderToolsPosition = 'left' | 'right' | 'hidden'

/**
 * A view a side panel can show, as registered in `app/utils/panelViews.ts`; `search` is an action (it opens a search)
 * rather than a view. Any well-formed id is kept in a saved layout (`isPanelViewId`), registered or not.
 */
export type PanelViewId = string
/** `separator` draws a line between buttons; `split` starts a new pane in its area (stacked on a side, side by side at the bottom). */
export type PanelSlot = PanelViewId | 'separator' | 'split'
export type PanelSide = 'left' | 'right'
/** Where views show: the side panels, or the bottom area under the editor. */
export type PanelArea = PanelSide | 'bottom'

export interface PanelLayout {
    left: PanelSlot[],
    right: PanelSlot[],
    bottom: PanelSlot[],
    hidden: PanelViewId[],
}

export interface AppPanelsConfig extends PanelLayout {
    /** `buttons`: in the side panels (a list on the left, icons in the right's header); `strip`: icon strips at the window's edges. The bottom area always has its buttons in its own header. */
    style: 'buttons' | 'strip',
}
