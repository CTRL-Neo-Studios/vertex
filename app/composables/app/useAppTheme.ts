import { omit } from '#ui/utils'
import colors from 'tailwindcss/colors'
import {useAppSettings} from "~/composables/app/useAppSettings";
import {defaultAppAdvancedThemeConfig, defaultAppThemeConfig} from "#shared/utils/defaults/themes";

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
    const primaryColors = computed(() => Object.keys(omit(colors, colorsToOmit as any)))
    const primary = computed({
        get() {
            return appConfig.ui.colors.primary
        },
        set(option) {
            appConfig.ui.colors.primary = option
            appConfig.theme.blackAsPrimary = false
            $settings.set({
                themeConfig: {
                    primaryColor: option,
                    blackAsPrimary: false
                }
            }, 'computed primary')
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

    const fonts = ['Public Sans', 'DM Sans', 'Geist', 'Inter', 'Poppins', 'Outfit', 'Raleway', 'JetBrains Mono', 'Geist Mono', 'Google Sans Code']
    const appFont = computed({
        get() {
            return appConfig.theme.appFont
        },
        set(option) {
            appConfig.theme.appFont = option
            $settings.set({
                themeConfig: {
                    appFont: option
                }
            })
        }
    })
    const appMonoFont = computed({
        get() {
            return appConfig.theme.appMonoFont
        },
        set(option) {
            appConfig.theme.appMonoFont = option
            $settings.set({
                themeConfig: {
                    appMonoFont: option
                }
            })
        }
    })
    const editorFont = computed({
        get() {
            return appConfig.theme.editorFont
        },
        set(option) {
            appConfig.theme.editorFont = option
            $settings.set({
                themeConfig: {
                    editorFont: option
                }
            })
        }
    })
    const editorMonoFont = computed({
        get() {
            return appConfig.theme.editorMonoFont
        },
        set(option) {
            appConfig.theme.editorMonoFont = option
            $settings.set({
                themeConfig: {
                    editorMonoFont: option
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
        }, 'setBlackAsPrimary()')
    }

    function resetTheme() {
        $settings.set({
            themeConfig: defaultAppThemeConfig(),
            advancedThemeConfig: defaultAppAdvancedThemeConfig()
        })

        loadThemeFromConfig()
    }

    async function saveTheme() {
        // Note: Individual setters already call $settings.set() for their specific values
        // This function just ensures everything is in sync and saves to disk
        // We don't call $settings.set() again here to avoid triggering watchers
        await $settings.save()
    }

    function loadThemeFromConfig() {
        if (!$settings.config.value) return;

        appConfig.ui.colors.primary = $settings.config.value.themeConfig.primaryColor
        appConfig.ui.colors.neutral = $settings.config.value.themeConfig.neutralColor
        appConfig.theme.radius = $settings.config.value.themeConfig.roundedRadius
        appConfig.theme.appFont = $settings.config.value.themeConfig.appFont
        appConfig.theme.appMonoFont = $settings.config.value.themeConfig.appMonoFont
        appConfig.theme.editorFont = $settings.config.value.themeConfig.editorFont
        appConfig.theme.editorMonoFont = $settings.config.value.themeConfig.editorMonoFont
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
        appFont,
        editorFont,
        appMonoFont,
        editorMonoFont,
        modes,
        mode,
        resetTheme,
        saveTheme,
        loadThemeFromConfig
    }
}