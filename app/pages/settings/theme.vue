<script setup lang="ts">
import {useAppTheme} from "~/composables/app/useAppTheme";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useTrust} from "~/composables/app/useTrust";
import type {AppThemeConfig} from "#shared/types/app/settings";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {theme, defaults, update, isDirty, reset} = useAppTheme()
const scope = useSettingsScope()
const trust = useTrust()

const COLOR_KEYS: (keyof AppThemeConfig)[] = ['primaryColor', 'neutralColor', 'blackAsPrimary', 'colorMode']
const SHAPE_KEYS: (keyof AppThemeConfig)[] = ['roundedRadius']
const FONT_KEYS = ['appFont', 'appMonoFont', 'editorFont', 'editorMonoFont'] as const

const fonts = computed(() => FONT_KEYS.map(key => ({
    key,
    label: t(`app.settings.theme.${key}`),
    description: t(`app.settings.theme.${key}Description`),
    monospace: key.endsWith('MonoFont'),
})))

// Saved when the editor loses focus or on ⌘S, not per keystroke; follows the scope (and other windows) otherwise.
const CSS = 'advancedThemeConfig.customCss' as const
const css = ref('')
watch(() => scope.value(CSS), value => css.value = value ?? '', {immediate: true})
const saveCss = () => css.value !== (scope.value(CSS) ?? '') && scope.set({[CSS]: css.value})
const cssOff = computed(() => scope.root.value !== null && scope.overridden(CSS) && !scope.trusted.value)
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.theme.title')">
        <template #header-trailing>
            <UButton
                v-if="isDirty([...COLOR_KEYS, ...SHAPE_KEYS, ...FONT_KEYS])"
                icon="i-lucide-rotate-ccw"
                color="neutral"
                variant="outline"
                size="sm"
                :label="t(scope.root.value ? 'app.settings.scope.useGlobalAll' : 'app.settings.theme.reset')"
                @click="reset()"
            />
        </template>

        <div class="space-y-4">
            <SettingsSection :title="t('app.settings.theme.preview')">
                <SettingsRow stacked>
                    <SettingsThemePreview/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.colors')" :dirty="isDirty(COLOR_KEYS)" @reset="reset(COLOR_KEYS)">
                <SettingsRow setting="themeConfig.primaryColor" :label="t('app.settings.theme.primary')" :description="t('app.settings.theme.primaryDescription')">
                    <SettingsThemeColorMenu alias="primary"/>
                </SettingsRow>
                <SettingsRow setting="themeConfig.neutralColor" :label="t('app.settings.theme.neutral')" :description="t('app.settings.theme.neutralDescription')">
                    <SettingsThemeColorMenu alias="neutral"/>
                </SettingsRow>
                <SettingsRow setting="themeConfig.colorMode" :label="t('app.settings.theme.colorMode')" :description="t('app.settings.theme.colorModeDescription')">
                    <SettingsThemeColorModeTabs/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.shape')" :dirty="isDirty(SHAPE_KEYS)" @reset="reset(SHAPE_KEYS)">
                <SettingsRow setting="themeConfig.roundedRadius" :label="t('app.settings.theme.radius')" :description="t('app.settings.theme.radiusDescription')">
                    <SettingsThemeRadiusPicker/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.fonts')" :dirty="isDirty([...FONT_KEYS])" @reset="reset([...FONT_KEYS])">
                <SettingsRow v-for="font in fonts" :key="font.key" :setting="`themeConfig.${font.key}`" :label="font.label" :description="font.description">
                    <SettingsThemeFontPicker
                        :model-value="theme[font.key]"
                        :monospace="font.monospace"
                        :default-value="defaults[font.key]"
                        :aria-label="font.label"
                        @update:model-value="update({ [font.key]: $event })"
                    />
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.customCss')" :dirty="scope.isDirty([CSS])" @reset="scope.reset([CSS])">
                <SettingsRow v-if="cssOff" stacked>
                    <UAlert
                        color="warning"
                        variant="subtle"
                        icon="i-lucide-shield-alert"
                        :title="t('app.settings.theme.customCssUntrusted')"
                        :actions="[{label: t('app.settings.theme.trustWorkspace'), color: 'warning', variant: 'outline', onClick: () => trust.trustFolder(scope.root.value!, true)}]"
                    />
                </SettingsRow>
                <SettingsRow stacked :setting="CSS" :label="t('app.settings.theme.customCssLabel')" :description="t('app.settings.theme.customCssDescription')">
                    <SettingsCssEditor
                        v-model="css"
                        :readonly="cssOff || !scope.overridable(CSS)"
                        :placeholder="t('app.settings.theme.customCssPlaceholder')"
                        @save="saveCss"
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
