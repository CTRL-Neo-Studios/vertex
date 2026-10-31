export type SessionRecoveryMode = 'none' | 'workspaces' | 'singlespaces' | 'both'

export interface AppSettings {
    /** Which session windows to reopen on launch. Replaces the old `openLastOpenedWindows` boolean. */
    recoverSessions: SessionRecoveryMode,
    /** UI language code (`en`, `zh-CN`), or `system` to follow the OS language. */
    language: string,
    themeConfig: AppThemeConfig,
    advancedThemeConfig: AppAdvancedThemeConfig,
    viewConfig: AppViewConfig,
	deviceId: string,
    /** Update channel (stable, beta, …); sent to the updater backend as `x-updater-channel`. */
    updateChannel: string,
    /** Optional token for restricted channels; sent as `x-updater-token`. */
    updateToken: string
}

export interface AppThemeConfig {
    primaryColor: string,
    neutralColor: string,
    roundedRadius: number,
    appFont: string,
    editorFont: string,
    appMonoFont: string,
    editorMonoFont: string,
    blackAsPrimary: boolean
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
