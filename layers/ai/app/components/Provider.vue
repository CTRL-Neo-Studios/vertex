<script setup lang="ts">
import type {AiModelInfo} from "../../shared/types";
import {useAiConfig} from "../lib/useAiConfig";
import {useAiModels} from "../lib/useAiModels";
import {useNotify} from "../lib/notify";
import {aiClient} from "../lib/aiClient";
import {SettingsList, SettingsRow, SettingsScrollLayout, SettingsSection} from "~/plugin/ui";

/** One provider: name, base URL, its keychain key (write-only) and the models enabled on it. */
const props = defineProps<{ id: string }>()
const {t} = useI18n()
const $route = useRoute()
const notify = useNotify()
const {ai, updateProvider, removeProviders} = useAiConfig()
const {list} = useAiModels()

const back = computed(() => ({path: '/settings/ai/providers', query: {q: $route.query.q || undefined}}))
const provider = computed(() => ai.value?.providers.find(p => p.id === props.id))

const name = ref('')
const baseURL = ref('')
watch(() => provider.value?.name, v => name.value = v ?? '', {immediate: true})
watch(() => provider.value?.baseURL, v => baseURL.value = v ?? '', {immediate: true})

const urlError = computed(() => {
    try {
        return ['http:', 'https:'].includes(new URL(baseURL.value).protocol) ? undefined : t('plugins.ai.providers.baseURLInvalid')
    } catch {
        return t('plugins.ai.providers.baseURLInvalid')
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
    if (models) notify.success(t('plugins.ai.providers.testOk', {name: provider.value.name}), t('plugins.ai.providers.testCount', {count: models.length}))
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
// Not inline: a new function on every render made each keystroke in Name, Base URL or the key redraw the model list.
const removeConfirm = (count: number) => t('plugins.ai.providers.removeModelsConfirm', {count})
</script>

<template>
    <SettingsScrollLayout v-if="ai" :title="provider ? provider.name || t('plugins.ai.providers.unnamed') : t('plugins.ai.providers.title')" global-only>
        <template #header-leading>
            <UButton :to="back" size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :aria-label="t('plugins.ai.providers.back')"/>
        </template>
        <template v-if="provider" #header-trailing>
            <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-plug-zap" :loading="testing" :label="t('plugins.ai.providers.test')" @click="test"/>
            <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" :label="t('plugins.ai.providers.remove')" @click="remove"/>
        </template>

        <div v-if="provider" class="space-y-4">
            <AiOffBanner/>
            <SettingsSection :title="t('plugins.ai.providers.connection')">
                <SettingsRow :label="t('plugins.ai.providers.name')">
                    <UInput v-model="name" class="w-72" @blur="saveName" @keydown.enter="saveName"/>
                </SettingsRow>
                <SettingsRow
                    :label="t('plugins.ai.providers.baseURL')"
                    :description="t(hasKey ? 'plugins.ai.providers.baseURLKeyWarning' : 'plugins.ai.providers.baseURLDescription')"
                    :error="baseURL !== provider.baseURL ? urlError : undefined"
                >
                    <UInput v-model="baseURL" class="w-72" placeholder="https://api.openai.com/v1" @blur="saveURL" @keydown.enter="saveURL"/>
                </SettingsRow>
                <SettingsRow
                    :label="t('plugins.ai.providers.apiKey')"
                    :description="t(hasKey ? 'plugins.ai.providers.apiKeySaved' : 'plugins.ai.providers.apiKeyDescription')"
                    :error="keyError"
                >
                    <template v-if="hasKey">
                        <UBadge color="success" variant="subtle" icon="i-lucide-key-round" :label="t('plugins.ai.providers.keySaved')"/>
                        <UButton color="neutral" variant="outline" icon="i-lucide-trash-2" :label="t('plugins.ai.providers.removeKey')" @click="setKey('')"/>
                    </template>
                    <UFieldGroup v-else class="w-72">
                        <UInput v-model="keyDraft" type="password" class="flex-1" autocomplete="off" @keydown.enter="keyDraft.trim() && setKey(keyDraft)"/>
                        <UButton color="neutral" variant="outline" :disabled="!keyDraft.trim()" :label="t('plugins.ai.providers.saveKey')" @click="setKey(keyDraft)"/>
                    </UFieldGroup>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('plugins.ai.providers.models')" :description="t('plugins.ai.providers.modelsDescription', {count: models.length})">
                <template #actions>
                    <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-list-plus" :label="t('plugins.ai.providers.addModels')" @click="adding = true"/>
                </template>
                <SettingsList
                    v-model:query="modelQuery"
                    :items="models"
                    :text="modelText"
                    :placeholder="t('plugins.ai.providers.searchModels')"
                    :empty="t('plugins.ai.providers.noEnabledModels')"
                    :actions="[{id: 'remove', label: count => t('plugins.ai.list.removeSelected', {count}), icon: 'i-lucide-trash-2', color: 'error',
                                confirm: removeConfirm, run: items => removeModels(items.map(m => m.id))}]"
                >
                    <template #row="{item}">
                        <div class="text-sm truncate">{{ item.name ?? item.id }}</div>
                        <div v-if="item.name" class="text-xs text-muted font-mono truncate">{{ item.id }}</div>
                    </template>
                    <template #actions="{item}">
                        <AiModelBadges :model="item"/>
                        <UTooltip :text="t('plugins.ai.providers.removeModel')">
                            <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('plugins.ai.providers.removeModel')" @click="removeModels([item.id])"/>
                        </UTooltip>
                    </template>
                </SettingsList>
            </SettingsSection>

            <AiAddModelsModal v-if="provider" v-model:open="adding" :provider/>
        </div>
        <UEmpty
            v-else
            class="mt-12"
            variant="naked"
            icon="i-lucide-server"
            :title="t('plugins.ai.providers.notFound')"
            :actions="[{label: t('plugins.ai.providers.back'), icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'outline', to: back}]"
        />
    </SettingsScrollLayout>
</template>
