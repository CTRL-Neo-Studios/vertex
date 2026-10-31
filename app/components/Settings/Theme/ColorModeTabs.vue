<script setup lang="ts">
import {useAppTheme} from "~/composables/app/useAppTheme";
import type {AppThemeConfig} from "#shared/types/app/settings";

/** Light / dark / system as a segmented control (after Nuxt UI's ThemeStudioColorModeTabs). */
const appConfig = useAppConfig()
const {theme, update} = useAppTheme()
const {t} = useI18n()

const items = computed(() => [
    {label: t('app.settings.theme.light'), value: 'light', icon: appConfig.ui.icons.light},
    {label: t('app.settings.theme.dark'), value: 'dark', icon: appConfig.ui.icons.dark},
    {label: t('app.settings.theme.system'), value: 'system', icon: appConfig.ui.icons.system},
])

const mode = computed({
    get: () => theme.value.colorMode,
    set: (value: string | number) => update({colorMode: value as AppThemeConfig['colorMode']}),
})
</script>

<template>
    <UTabs
        v-model="mode"
        :items="items"
        :content="false"
        color="neutral"
        size="xs"
        class="w-60"
        :ui="{
            list: 'bg-elevated/50 ring ring-default p-0.5',
            indicator: 'bg-default inset-y-0.5',
            trigger: 'data-[state=active]:text-highlighted w-full p-1.5',
        }"
    />
</template>
