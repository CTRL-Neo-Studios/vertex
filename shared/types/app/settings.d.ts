export interface AppSettings {
    openLastOpenedWindows: boolean,
    themeConfig: AppThemeConfig,
    advancedThemeConfig: AppAdvancedThemeConfig,
    viewConfig: AppViewConfig
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
        showFileIcons: boolean,
        showFolderIcons: boolean,
        allowCustomFileIcons: boolean,
        allowCustomFolderIcons: boolean,
    },
    editorPanel: {
        showStatusBar: 'show-on-hover' | 'always-shown' | 'always-hidden',
    }
}
