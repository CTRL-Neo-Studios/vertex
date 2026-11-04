import type {FileTrustMode} from "#shared/workflows/trust"

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
    }
}
