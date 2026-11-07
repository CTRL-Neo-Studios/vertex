<script setup lang="ts">
import type {AiProviderProfile} from "#shared/types/app/ai";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAiModels} from "~/composables/ai/useAiModels";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {aiClient} from "~/utils/aiClient";

/** One provider: name, base URL, its keychain key (write-only) and the models enabled on it. */
const props = defineProps<{ provider: AiProviderProfile }>()
const {t} = useI18n()
const $qt = useQuickToasts()
const {updateProvider, removeProvider} = useAiConfig()
const {list} = useAiModels()

const name = ref('')
const baseURL = ref('')
watch(() => props.provider.name, v => name.value = v, {immediate: true})
watch(() => props.provider.baseURL, v => baseURL.value = v, {immediate: true})

const urlError = computed(() => {
    try {
        return ['http:', 'https:'].includes(new URL(baseURL.value).protocol) ? undefined : t('app.settings.ai.providers.baseURLInvalid')
    } catch {
        return t('app.settings.ai.providers.baseURLInvalid')
    }
})

const saveName = () => name.value.trim() && name.value !== props.provider.name && updateProvider(props.provider.id, {name: name.value.trim()})
// Rust deletes the saved key when the base URL changes (the key belongs to that host), before the save resolves.
async function saveURL() {
    if (urlError.value || baseURL.value === props.provider.baseURL) return
    await updateProvider(props.provider.id, {baseURL: baseURL.value.trim()})
    await refreshKey()
}

// The key is write-only: it goes to the OS keychain and is never read back.
const hasKey = ref(false)
const keyDraft = ref('')
const keyError = ref<string>()
async function refreshKey() {
    hasKey.value = await aiClient.hasKey(props.provider.id).catch(() => false)
}
onMounted(refreshKey)
async function setKey(key: string) {
    keyError.value = undefined
    try {
        await aiClient.setKey(props.provider.id, key)
        keyDraft.value = ''
        await refreshKey()
    } catch (error) {
        keyError.value = String(error)
    }
}

const testing = ref(false)
async function test() {
    testing.value = true
    const models = await list(props.provider)
    testing.value = false
    if (models) $qt.success(t('app.settings.ai.providers.testOk', {name: props.provider.name}), t('app.settings.ai.providers.testCount', {count: models.length}))
}

const adding = ref(false)
const removeModel = (id: string) => updateProvider(props.provider.id, {models: props.provider.models.filter(m => m.id !== id)})
</script>

<template>
    <SettingsSection :title="provider.name || t('app.settings.ai.providers.unnamed')" :description="provider.baseURL">
        <template #actions>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-plug-zap" :loading="testing" :label="t('app.settings.ai.providers.test')" @click="test"/>
            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" :label="t('app.settings.ai.providers.remove')" @click="removeProvider(provider.id)"/>
        </template>

        <SettingsRow :label="t('app.settings.ai.providers.name')">
            <UInput v-model="name" class="w-72" @blur="saveName" @keydown.enter="saveName"/>
        </SettingsRow>
        <SettingsRow
            :label="t('app.settings.ai.providers.baseURL')"
            :description="t(hasKey ? 'app.settings.ai.providers.baseURLKeyWarning' : 'app.settings.ai.providers.baseURLDescription')"
            :error="baseURL !== provider.baseURL ? urlError : undefined"
        >
            <UInput v-model="baseURL" class="w-72" placeholder="https://api.openai.com/v1" @blur="saveURL" @keydown.enter="saveURL"/>
        </SettingsRow>
        <SettingsRow
            :label="t('app.settings.ai.providers.apiKey')"
            :description="t(hasKey ? 'app.settings.ai.providers.apiKeySaved' : 'app.settings.ai.providers.apiKeyDescription')"
            :error="keyError"
        >
            <template v-if="hasKey">
                <UBadge color="success" variant="subtle" icon="i-lucide-key-round" :label="t('app.settings.ai.providers.keySaved')"/>
                <UButton color="neutral" variant="outline" icon="i-lucide-trash-2" :label="t('app.settings.ai.providers.removeKey')" @click="setKey('')"/>
            </template>
            <UFieldGroup v-else class="w-72">
                <UInput v-model="keyDraft" type="password" class="flex-1" autocomplete="off" @keydown.enter="keyDraft.trim() && setKey(keyDraft)"/>
                <UButton color="neutral" variant="outline" :disabled="!keyDraft.trim()" :label="t('app.settings.ai.providers.saveKey')" @click="setKey(keyDraft)"/>
            </UFieldGroup>
        </SettingsRow>

        <SettingsRow :label="t('app.settings.ai.providers.models')" :description="t('app.settings.ai.providers.modelsDescription', {count: provider.models.length})">
            <UButton color="neutral" variant="outline" icon="i-lucide-list-plus" :label="t('app.settings.ai.providers.addModels')" @click="adding = true"/>
        </SettingsRow>
        <div v-for="model in provider.models" :key="model.id" class="flex items-center gap-3 px-4 py-2 pl-8">
            <div class="flex-1 min-w-0">
                <div class="text-sm truncate">{{ model.name ?? model.id }}</div>
                <div v-if="model.name" class="text-xs text-muted font-mono truncate">{{ model.id }}</div>
            </div>
            <SettingsAiModelBadges :model="model"/>
            <UTooltip :text="t('app.settings.ai.providers.removeModel')">
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('app.settings.ai.providers.removeModel')" @click="removeModel(model.id)"/>
            </UTooltip>
        </div>

        <SettingsAiAddModelsModal v-model:open="adding" :provider="provider"/>
    </SettingsSection>
</template>
