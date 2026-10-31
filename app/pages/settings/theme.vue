<script setup lang="ts">
import {useAppTheme} from "~/composables/app/useAppTheme";
import type {AppThemeConfig} from "#shared/types/app/settings";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {theme, defaults, update, isDirty, reset} = useAppTheme()

const COLOR_KEYS: (keyof AppThemeConfig)[] = ['primaryColor', 'neutralColor', 'blackAsPrimary', 'colorMode']
const SHAPE_KEYS: (keyof AppThemeConfig)[] = ['roundedRadius']
const FONT_KEYS = ['appFont', 'appMonoFont', 'editorFont', 'editorMonoFont'] as const

const fonts = computed(() => FONT_KEYS.map(key => ({
    key,
    label: t(`app.settings.theme.${key}`),
    description: t(`app.settings.theme.${key}Description`),
    monospace: key.endsWith('MonoFont'),
})))
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
                :label="t('app.settings.theme.reset')"
                @click="reset()"
            />
        </template>

        <div class="space-y-4">
            <SettingsSection :title="t('app.settings.theme.preview')">
                <SettingsThemePreview/>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.colors')" :dirty="isDirty(COLOR_KEYS)" @reset="reset(COLOR_KEYS)">
                <SettingsRow :label="t('app.settings.theme.primary')" :description="t('app.settings.theme.primaryDescription')">
                    <SettingsThemeColorMenu alias="primary"/>
                </SettingsRow>
                <SettingsRow :label="t('app.settings.theme.neutral')" :description="t('app.settings.theme.neutralDescription')">
                    <SettingsThemeColorMenu alias="neutral"/>
                </SettingsRow>
                <SettingsRow :label="t('app.settings.theme.colorMode')" :description="t('app.settings.theme.colorModeDescription')">
                    <SettingsThemeColorModeTabs/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.shape')" :dirty="isDirty(SHAPE_KEYS)" @reset="reset(SHAPE_KEYS)">
                <SettingsRow :label="t('app.settings.theme.radius')" :description="t('app.settings.theme.radiusDescription')">
                    <SettingsThemeRadiusPicker/>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.theme.fonts')" :dirty="isDirty([...FONT_KEYS])" @reset="reset([...FONT_KEYS])">
                <SettingsRow v-for="font in fonts" :key="font.key" :label="font.label" :description="font.description">
                    <SettingsThemeFontPicker
                        :model-value="theme[font.key]"
                        :monospace="font.monospace"
                        :default-value="defaults[font.key]"
                        :aria-label="font.label"
                        @update:model-value="update({ [font.key]: $event })"
                    />
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
