import type {AppAdvancedThemeConfig, AppThemeConfig} from "#shared/types/app/settings";

export function defaultAppThemeConfig(data?: Partial<AppThemeConfig>): AppThemeConfig {
    return {
        primaryColor: data?.primaryColor || 'indigo',
        neutralColor: data?.neutralColor || 'zinc',
        appFont: data?.appFont || 'Geist',
        editorFont: data?.editorFont || 'Geist',
        appMonoFont: data?.appMonoFont || 'Geist Mono',
        editorMonoFont: data?.editorMonoFont || 'Geist Mono',
        blackAsPrimary: data?.blackAsPrimary == undefined ? false : data?.blackAsPrimary,
        roundedRadius: data?.roundedRadius || 0.25
    } satisfies AppThemeConfig
}

export function defaultAppAdvancedThemeConfig(data?: Partial<AppAdvancedThemeConfig>): AppAdvancedThemeConfig {
    return {
        customCss: data?.customCss || ''
    } satisfies AppAdvancedThemeConfig
}