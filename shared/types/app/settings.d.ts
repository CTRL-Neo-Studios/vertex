import type {FileTrustMode} from "#shared/workflows/trust"
import type {AppAiConfig} from "#shared/types/app/ai"

export type SessionRecoveryMode = 'none' | 'workspaces' | 'singlespaces' | 'both'

export interface AppSettings {
    /** Which session windows to reopen on launch. Replaces the old `openLastOpenedWindows` boolean. */
    recoverSessions: SessionRecoveryMode,
    /** UI language code (`en`, `zh-CN`), or `system` to follow the OS language. */
    language: string,
    themeConfig: AppThemeConfig,
    advancedThemeConfig: AppAdvancedThemeConfig,
    viewConfig: AppViewConfig,
    workflowConfig: AppWorkflowConfig,
    /** Assistive AI; only `features` is workspace-overridable (trusted workspaces). Keys are in the keychain. */
    aiConfig: AppAiConfig,
	deviceId: string,
    /** Update channel (stable, beta, …); sent to the updater backend as `x-updater-channel`. */
    updateChannel: string
}

/** Trusted folders and files aren't settings: they live in `trust.json` (`shared/workflows/trust.ts`). */
export interface AppWorkflowConfig {
    /** Step limit per run (`limits.steps`): every node activation counts, so loops can't run forever. */
    maxLoopIterations: number,
    /** Call depth limit (`limits.depth`). */
    maxStackDepth: number,
    /** Wall-clock limit per run; 0 = none. */
    wallClockTimeoutMs: number,
    /** Ask before a run's first move to the vault trash. */
    confirmTrash: boolean,
    /** What a trusted file remembers: its path, or its path and program (an edit asks again). */
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
    fileTree: {
        showFoldArrows: boolean,
        showFileExtInName: boolean,
        showFileExtAsTag: boolean,
        showDefaultFileIcons: boolean,
        showDefaultFolderIcons: boolean,
        allowCustomFileIcons: boolean,
        allowCustomFolderIcons: boolean,
    },
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
/** `separator` draws a line between buttons; `split` starts a new pane in its area (panes stack on a side). */
export type PanelSlot = PanelViewId | 'separator' | 'split'
export type PanelSide = 'left' | 'right'

export interface PanelLayout {
    left: PanelSlot[],
    right: PanelSlot[],
    hidden: PanelViewId[],
}

export interface AppPanelsConfig extends PanelLayout {
    /** `buttons`: in the side panels (a list on the left, icons in the right's header); `strip`: icon strips at the window's edges. */
    style: 'buttons' | 'strip',
}
