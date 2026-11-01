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

/** Trust records live here, in app data, so a vault can't mark its own workflows trusted (§11). */
export interface AppWorkflowConfig {
    /** Step limit per run (`limits.steps`): every node activation counts, so loops can't run forever. */
    maxLoopIterations: number,
    /** Call depth limit (`limits.depth`). */
    maxStackDepth: number,
    /** Wall-clock limit per run; 0 = none. */
    wallClockTimeoutMs: number,
    /** Ask before a run's first move to the vault trash. */
    confirmTrash: boolean,
    /** Program hash → the workflow's name and when it was trusted. Editing a program changes its hash. */
    trustedPrograms: Record<string, {name: string, trustedAt: string}>,
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
