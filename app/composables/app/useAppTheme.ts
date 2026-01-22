import { omit } from '#ui/utils'
import colors from 'tailwindcss/colors'
import {useAppSettings} from "~/composables/app/useAppSettings";
import {defaultAppAdvancedThemeConfig, defaultAppThemeConfig} from "#shared/utils/defaults/themes";

const defaultPrimaryColor = 'indigo'
const defaultNeutralColor = 'zinc'
const defaultSansFont = 'Geist'

export function useAppTheme() {
    const appConfig = useAppConfig()
    const colorMode = useColorMode()
    const $settings = useAppSettings()

    const neutralColors = ['slate', 'gray', 'zinc', 'neutral', 'stone']
    const neutral = computed({
        get() {
            return appConfig.ui.colors.neutral
        },
        set(option) {
            appConfig.ui.colors.neutral = option
            $settings.set({
                themeConfig: {
                    neutralColor: option
                }
            })
        }
    })

    const colorsToOmit = ['inherit', 'current', 'transparent', 'black', 'white', ...neutralColors]
    const primaryColors = Object.keys(omit(colors, colorsToOmit as any))
    const primary = computed({
        get() {
            return appConfig.ui.colors.primary
        },
        set(option) {
            appConfig.ui.colors.primary = option
            $settings.set({
                themeConfig: {
                    primaryColor: option
                }
            })
            setBlackAsPrimary(false)
        }
    })

    const radiuses = [0, 0.125, 0.25, 0.375, 0.5]
    const radius = computed({
        get() {
            return appConfig.theme.radius
        },
        set(option) {
            appConfig.theme.radius = option
            $settings.set({
                themeConfig: {
                    roundedRadius: option
                }
            })
        }
    })

    const fonts = ['Public Sans', 'DM Sans', 'Geist', 'Inter', 'Poppins', 'Outfit', 'Raleway']
    const font = computed({
        get() {
            return appConfig.theme.font
        },
        set(option) {
            appConfig.theme.font = option
            $settings.set({
                themeConfig: {
                    appFont: option
                }
            })
        }
    })

    const modes = [
        { label: 'light', icon: appConfig.ui.icons.light },
        { label: 'dark', icon: appConfig.ui.icons.dark },
        { label: 'system', icon: appConfig.ui.icons.system }
    ]
    const mode = computed({
        get() {
            return colorMode.value
        },
        set(option) {
            colorMode.preference = option
        }
    })

    function setBlackAsPrimary(value: boolean) {
        appConfig.theme.blackAsPrimary = value
        $settings.set({
            themeConfig: {
                blackAsPrimary: true
            }
        })
    }

    function exportCSS(): string {
        const lines = [
            '@import "tailwindcss";',
            '@import "@nuxt/ui";'
        ]

        if (appConfig.theme.font !== unref($settings.config)?.themeConfig.appFont) {
            lines.push('', '@theme {', `  --font-sans: '${appConfig.theme.font}', sans-serif;`, '}')
        }

        const rootLines: string[] = []
        if (appConfig.theme.radius !== 0.25) {
            rootLines.push(`  --ui-radius: ${appConfig.theme.radius}rem;`)
        }
        if (appConfig.theme.blackAsPrimary) {
            rootLines.push('  --ui-primary: black;')
        }

        if (rootLines.length) {
            lines.push('', ':root {', ...rootLines, '}')
        }

        if (appConfig.theme.blackAsPrimary) {
            lines.push('', '.dark {', '  --ui-primary: white;', '}')
        }

        return lines.join('\n')
    }

    function resetTheme() {
        // Reset without triggering individual tracking events
        if (!$settings.config.value) return;

        $settings.set({
            themeConfig: defaultAppThemeConfig(),
            advancedThemeConfig: defaultAppAdvancedThemeConfig()
        })

        appConfig.ui.colors.primary = $settings.config.value.themeConfig.primaryColor
        appConfig.ui.colors.neutral = $settings.config.value.themeConfig.neutralColor
        appConfig.theme.radius = $settings.config.value.themeConfig.roundedRadius
        appConfig.theme.font = $settings.config.value.themeConfig.appFont
        appConfig.theme.blackAsPrimary = $settings.config.value.themeConfig.blackAsPrimary
    }

    return {
        neutralColors,
        neutral,
        primaryColors,
        primary,
        setBlackAsPrimary,
        radiuses,
        radius,
        fonts,
        font,
        modes,
        mode,
        exportCSS,
        resetTheme
    }
}