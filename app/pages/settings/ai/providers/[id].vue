<script setup lang="ts">
import type {AiModelInfo} from "#shared/types/app/ai";
import {Routes} from "#shared/constants/app";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAiModels} from "~/composables/ai/useAiModels";
import {useAppSettings} from "~/composables/app/useAppSettings";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {aiClient} from "~/utils/aiClient";

definePageMeta({
    layout: 'settings'
})

/** One provider: name, base URL, its keychain key (write-only) and the models enabled on it. */
const {t} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const {load} = useAppSettings()
const {ai, updateProvider, removeProviders} = useAiConfig()
const {list} = useAiModels()
onMounted(load)

const back = computed(() => ({path: `${Routes.settings}/ai/providers`, query: {q: $route.query.q || undefined}}))
const provider = computed(() => ai.value?.providers.find(p => p.id === $route.params.id))

const name = ref('')
const baseURL = ref('')
watch(() => provider.value?.name, v => name.value = v ?? '', {immediate: true})
watch(() => provider.value?.baseURL, v => baseURL.value = v ?? '', {immediate: true})

const urlError = computed(() => {
    try {
        return ['http:', 'https:'].includes(new URL(baseURL.value).protocol) ? undefined : t('app.settings.ai.providers.baseURLInvalid')
    } catch {
        return t('app.settings.ai.providers.baseURLInvalid')
    }
})

function saveName() {
    const p = provider.value
    if (p && name.value.trim() && name.value !== p.name) void updateProvider(p.id, {name: name.value.trim()})
}
// Rust deletes the saved key when the base URL changes (the key belongs to that host), before the save resolves.
async function saveURL() {
    const p = provider.value
    if (!p || urlError.value || baseURL.value === p.baseURL) return
    await updateProvider(p.id, {baseURL: baseURL.value.trim()})
    await refreshKey()
}

// The key is write-only: it goes to the OS keychain and is never read back.
const hasKey = ref(false)
const keyDraft = ref('')
const keyError = ref<string>()
async function refreshKey() {
    hasKey.value = provider.value ? await aiClient.hasKey(provider.value.id).catch(() => false) : false
}
watch(() => provider.value?.id, refreshKey, {immediate: true})
async function setKey(key: string) {
    if (!provider.value) return
    keyError.value = undefined
    try {
        await aiClient.setKey(provider.value.id, key)
        keyDraft.value = ''
        await refreshKey()
    } catch (error) {
        keyError.value = String(error)
    }
}

const testing = ref(false)
async function test() {
    if (!provider.value) return
    testing.value = true
    const models = await list(provider.value)
    testing.value = false
    if (models) $qt.success(t('app.settings.ai.providers.testOk', {name: provider.value.name}), t('app.settings.ai.providers.testCount', {count: models.length}))
}

async function remove() {
    if (!provider.value) return
    await removeProviders([provider.value.id])
    await navigateTo(back.value)
}

const adding = ref(false)
const models = computed(() => provider.value?.models ?? [])
const modelQuery = ref('')
const removeModels = (ids: string[]) => provider.value && updateProvider(provider.value.id, {models: provider.value.models.filter(m => !ids.includes(m.id))})
const modelText = (m: AiModelInfo) => `${m.name ?? ''} ${m.id}`
</script>

<template>
    <SettingsScrollLayout v-if="ai" :title="provider ? provider.name || t('app.settings.ai.providers.unnamed') : t('app.settings.ai.providers.title')" global-only>
        <template #header-leading>
            <UButton :to="back" size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :aria-label="t('app.settings.ai.providers.back')"/>
        </template>
        <template v-if="provider" #header-trailing>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plug-zap" :loading="testing" :label="t('app.settings.ai.providers.test')" @click="test"/>
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" :label="t('app.settings.ai.providers.remove')" @click="remove"/>
        </template>

        <div v-if="provider" class="space-y-4">
            <SettingsAiOffBanner/>
            <SettingsSection :title="t('app.settings.ai.providers.connection')">
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
            </SettingsSection>

            <div class="flex items-end gap-2">
                <div class="flex-1 min-w-0">
                    <h2 class="text-sm font-semibold text-highlighted">{{ t('app.settings.ai.providers.models') }}</h2>
                    <p class="text-xs text-muted">{{ t('app.settings.ai.providers.modelsDescription', {count: models.length}) }}</p>
                </div>
                <UButton size="sm" color="neutral" variant="outline" icon="i-lucide-list-plus" :label="t('app.settings.ai.providers.addModels')" @click="adding = true"/>
            </div>
            <SettingsAiList
                v-model:query="modelQuery"
                :items="models"
                :text="modelText"
                :placeholder="t('app.settings.ai.providers.searchModels')"
                :empty="t('app.settings.ai.providers.noEnabledModels')"
                :confirm="count => t('app.settings.ai.providers.removeModelsConfirm', {count})"
                @remove="removeModels"
            >
                <template #row="{item}">
                    <div class="text-sm truncate">{{ item.name ?? item.id }}</div>
                    <div v-if="item.name" class="text-xs text-muted font-mono truncate">{{ item.id }}</div>
                </template>
                <template #actions="{item}">
                    <SettingsAiModelBadges :model="item"/>
                    <UTooltip :text="t('app.settings.ai.providers.removeModel')">
                        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('app.settings.ai.providers.removeModel')" @click="removeModels([item.id])"/>
                    </UTooltip>
                </template>
            </SettingsAiList>

            <SettingsAiAddModelsModal v-if="provider" v-model:open="adding" :provider/>
        </div>
        <UEmpty
            v-else
            class="mt-12"
            variant="naked"
            icon="i-lucide-server"
            :title="t('app.settings.ai.providers.notFound')"
            :actions="[{label: t('app.settings.ai.providers.back'), icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'outline', to: back}]"
        />
    </SettingsScrollLayout>
</template>
