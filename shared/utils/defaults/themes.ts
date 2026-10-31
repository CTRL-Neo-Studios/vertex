import type {AppAdvancedThemeConfig, AppThemeConfig} from "#shared/types/app/settings";

export function defaultAppThemeConfig(data?: Partial<AppThemeConfig>): AppThemeConfig {
    return {
        primaryColor: data?.primaryColor || 'indigo',
        neutralColor: data?.neutralColor || 'zinc',
        appFont: data?.appFont || 'Geist',
        editorFont: data?.editorFont || 'Geist',
        appMonoFont: data?.appMonoFont || 'Geist Mono',
        editorMonoFont: data?.editorMonoFont || 'Geist Mono',
        blackAsPrimary: data?.blackAsPrimary ?? false,
        // `??`, not `||`: 0 (square corners) is a valid radius.
        roundedRadius: data?.roundedRadius ?? 0.25,
        colorMode: data?.colorMode === 'light' || data?.colorMode === 'dark' ? data.colorMode : 'system'
    } satisfies AppThemeConfig
}

export function defaultAppAdvancedThemeConfig(data?: Partial<AppAdvancedThemeConfig>): AppAdvancedThemeConfig {
    return {
        customCss: data?.customCss || ''
    } satisfies AppAdvancedThemeConfig
}
