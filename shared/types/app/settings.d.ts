
export interface AppThemeColorPalette {

}

export interface AppSettings {
    openLastOpenedWindows: boolean,
    themeConfig: AppThemeConfig,
    advancedThemeConfig: AppAdvancedThemeConfig
}

export interface AppThemeConfig {
    primaryColor: string,
    neutralColor: string,
    roundedRadius: number,
    appFont: string,
    editorFont: string,
    codeFont: string,
    blackAsPrimary: boolean
}

export interface AppAdvancedThemeConfig {
    customCss: string,
}