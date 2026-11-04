import type {AppAdvancedThemeConfig, AppThemeConfig} from "#shared/types/app/settings";

// Theme values end up in CSS text (app.vue, Nuxt UI's color variables), and a workspace's settings come from
// its folder, so anything that isn't plainly a value is dropped here rather than escaped at every use.
const name = (value: unknown, fallback: string) => typeof value === 'string' && /^[a-z]+(-[a-z]+)*$/.test(value) ? value : fallback
// Font names can be any installed family; cssFontName (useAppTheme) keeps them inside their quotes.
const font = (value: unknown, fallback: string) => typeof value === 'string' && value ? value : fallback

export function defaultAppThemeConfig(data?: Partial<AppThemeConfig>): AppThemeConfig {
    const radius = data?.roundedRadius
    return {
        primaryColor: name(data?.primaryColor, 'indigo'),
        neutralColor: name(data?.neutralColor, 'zinc'),
        appFont: font(data?.appFont, 'Geist'),
        editorFont: font(data?.editorFont, 'Geist'),
        appMonoFont: font(data?.appMonoFont, 'Geist Mono'),
        editorMonoFont: font(data?.editorMonoFont, 'Geist Mono'),
        blackAsPrimary: data?.blackAsPrimary === true,
        // 0 (square corners) is a valid radius.
        roundedRadius: typeof radius === 'number' && radius >= 0 && radius <= 2 ? radius : 0.25,
        colorMode: data?.colorMode === 'light' || data?.colorMode === 'dark' ? data.colorMode : 'system'
    } satisfies AppThemeConfig
}

export function defaultAppAdvancedThemeConfig(data?: Partial<AppAdvancedThemeConfig>): AppAdvancedThemeConfig {
    return {
        customCss: typeof data?.customCss === 'string' ? data.customCss : ''
    } satisfies AppAdvancedThemeConfig
}
