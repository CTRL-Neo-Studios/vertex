import colors from 'tailwindcss/colors'
import {invoke} from '@tauri-apps/api/core'
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {defaultAppThemeConfig} from "#shared/utils/defaults/themes";
import type {AppThemeConfig} from "#shared/types/app/settings";

/** Tailwind's gray ramps; only these may be the neutral, and none of them the primary. */
export const NEUTRAL_COLORS = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'taupe', 'mauve', 'mist', 'olive']
const NOT_A_RAMP = ['inherit', 'current', 'transparent', 'black', 'white', ...NEUTRAL_COLORS]
export const PRIMARY_COLORS = Object.keys(colors).filter(name => !NOT_A_RAMP.includes(name))
export const RADIUSES = [0, 0.125, 0.25, 0.375, 0.5, 0.75]

/** Fonts shipped in public/fonts (nuxt.config `fonts.families`); always available, unlike system fonts. */
export const BUNDLED_FONTS: FontFamily[] = [
    {name: 'Geist', monospace: false},
    {name: 'Inter', monospace: false},
    {name: 'Inter Display', monospace: false},
    {name: 'SF Pro', monospace: false},
    {name: 'Geist Mono', monospace: true},
    {name: 'SF Mono', monospace: true},
]

export interface FontFamily {
    name: string
    monospace: boolean
}

/** Font names end up inside a quoted CSS string; drop anything that could break out of it. */
export function cssFontName(name: string) {
    return name.replace(/['"\\;{}<>]/g, '')
}

// One scan per window; the Rust side caches across windows (src-tauri/src/fonts.rs).
let systemFonts: Promise<FontFamily[]> | undefined
export function loadSystemFonts() {
    systemFonts ??= invoke<FontFamily[]>('system_fonts').catch((error) => {
        console.error('[useAppTheme] could not list system fonts:', error)
        systemFonts = undefined
        return []
    })
    return systemFonts
}

/**
 * The theme lives in settings (`themeConfig`, which a workspace may override), written by Rust and broadcast to
 * every window; `apply()` copies this window's effective theme into app.config, which app.vue turns into CSS
 * variables, and its custom CSS into a style element. Edits go to the Settings window's current scope.
 */
export function useAppTheme() {
    const appConfig = useAppConfig()
    const colorMode = useColorMode()
    const scope = useSettingsScope()
    const defaults = defaultAppThemeConfig()

    const theme = computed(() => scope.effective.value?.themeConfig ?? defaults)
    const customCss = computed(() => scope.effective.value?.advancedThemeConfig.customCss ?? '')
    const paths = (keys: (keyof AppThemeConfig)[]) => keys.map(key => `themeConfig.${key}` as const)

    function apply() {
        const t = theme.value
        appConfig.ui.colors.primary = t.primaryColor
        appConfig.ui.colors.neutral = t.neutralColor
        appConfig.theme.radius = t.roundedRadius
        appConfig.theme.appFont = t.appFont
        appConfig.theme.appMonoFont = t.appMonoFont
        appConfig.theme.editorFont = t.editorFont
        appConfig.theme.editorMonoFont = t.editorMonoFont
        appConfig.theme.blackAsPrimary = t.blackAsPrimary
        colorMode.preference = t.colorMode
        // textContent, not innerHTML: the CSS can't close its element and inject markup.
        const style = document.getElementById('vertex-custom-css') ?? document.head.appendChild(Object.assign(document.createElement('style'), {id: 'vertex-custom-css'}))
        style.textContent = customCss.value
    }

    /** Saving broadcasts the settings; the init plugin's watcher re-applies them in every window, this one included. */
    async function update(patch: Partial<AppThemeConfig>) {
        await scope.set(Object.fromEntries(Object.entries(patch).map(([key, value]) => [`themeConfig.${key}`, value])))
    }

    /** Whether any of `keys` differs (User: from the stock theme; workspace: from the global one). */
    const isDirty = (keys: (keyof AppThemeConfig)[]) => scope.isDirty(paths(keys))

    const reset = (keys: (keyof AppThemeConfig)[] = Object.keys(defaults) as (keyof AppThemeConfig)[]) => scope.reset(paths(keys))

    return {theme, customCss, defaults, apply, update, isDirty, reset}
}
