<script setup lang="ts">
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAppSettings} from "~/composables/app/useAppSettings";

definePageMeta({
    layout: 'settings'
})

const {t} = useI18n()
const {load} = useAppSettings()
const {ai, addModelProfile} = useAiConfig()
onMounted(load)

const add = () => addModelProfile({
    name: t('app.settings.ai.models.newProfile'),
    providerId: ai.value?.providers[0]?.id ?? '',
    modelId: '',
    systemPrompt: '',
})
</script>

<template>
    <SettingsScrollLayout :title="t('app.settings.ai.models.title')" v-if="ai" global-only>
        <template #header-trailing>
            <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-plus" :label="t('app.settings.ai.models.add')" @click="add"/>
        </template>
        <div class="space-y-4">
            <p class="text-sm text-muted">{{ t('app.settings.ai.models.description') }}</p>
            <SettingsAiModelProfileCard v-for="profile in ai.modelProfiles" :key="profile.id" :profile="profile"/>
            <p v-if="!ai.modelProfiles.length" class="text-sm text-muted">{{ t('app.settings.ai.models.empty') }}</p>
        </div>
    </SettingsScrollLayout>
</template>
