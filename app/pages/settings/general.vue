<script setup lang="ts">
import type {SelectItem} from '@nuxt/ui'
import type {SessionRecoveryMode} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const {t, locales} = useI18n()
const {config, load, save} = useAppSettings()

onMounted(load)

const recoveryItems = computed<SelectItem[]>(() => (['none', 'workspaces', 'singlespaces', 'both'] as SessionRecoveryMode[])
    .map(value => ({value, label: t(`app.settings.general.recovery.${value}`)})))

// Language names are shown in their own language so they are recognisable whatever is selected.
const languageItems = computed<SelectItem[]>(() => [
    {value: 'system', label: t('app.settings.general.language.system')},
    ...locales.value.map(l => (typeof l === 'string' ? {value: l, label: l} : {value: l.code, label: l.name ?? l.code})),
])

async function setRecovery(value: SessionRecoveryMode) {
    await save({recoverSessions: value})
}

async function setLanguage(value: string) {
    await save({language: value})
}
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.general.title')" v-if="config">
        <UPageCard :title="t('app.settings.general.startup')">
            <UFormField
                size="sm"
                :label="t('app.settings.general.recovery.label')"
                :description="t('app.settings.general.recovery.description')"
                orientation="horizontal"
            >
                <USelect
                    :model-value="config.recoverSessions"
                    :items="recoveryItems"
                    class="min-w-44"
                    @update:model-value="setRecovery($event as SessionRecoveryMode)"
                />
            </UFormField>
        </UPageCard>
        <UPageCard :title="t('app.settings.general.language.title')">
            <UFormField
                size="sm"
                :label="t('app.settings.general.language.label')"
                :description="t('app.settings.general.language.description')"
                orientation="horizontal"
            >
                <USelect
                    :model-value="config.language"
                    :items="languageItems"
                    class="min-w-44"
                    @update:model-value="setLanguage($event as string)"
                />
            </UFormField>
        </UPageCard>
    </SettingsScrollLayout>
</template>
