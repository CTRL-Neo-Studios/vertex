<script setup lang="ts">
import type {SelectItem} from '@nuxt/ui'
import type {SessionRecoveryMode} from "#shared/types/app/settings";
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {config, load, save} = useAppSettings()

onMounted(load)

const recoveryItems = computed<SelectItem[]>(() => (['none', 'workspaces', 'singlespaces', 'both'] as SessionRecoveryMode[])
    .map(value => ({value, label: t(`app.settings.general.recovery.${value}`)})))

async function setRecovery(value: SessionRecoveryMode) {
    await save({recoverSessions: value})
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
    </SettingsScrollLayout>
</template>
