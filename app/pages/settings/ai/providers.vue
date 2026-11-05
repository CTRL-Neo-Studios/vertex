<script setup lang="ts">
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {load} = useAppSettings()
const {ai, addProvider} = useAiConfig()
onMounted(load)

const add = () => addProvider({name: t('app.settings.ai.providers.newProvider'), baseURL: 'https://', models: []})
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.ai.providers.title')" v-if="ai" global-only>
        <template #header-trailing>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('app.settings.ai.providers.add')" @click="add"/>
        </template>
        <div class="space-y-4">
            <p class="text-sm text-muted">{{ t('app.settings.ai.providers.description') }}</p>
            <SettingsAiProviderCard v-for="provider in ai.providers" :key="provider.id" :provider="provider"/>
            <p v-if="!ai.providers.length" class="text-sm text-muted">{{ t('app.settings.ai.providers.empty') }}</p>
        </div>
    </SettingsScrollLayout>
</template>
