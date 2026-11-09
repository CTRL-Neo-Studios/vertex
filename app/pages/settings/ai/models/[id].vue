<script setup lang="ts">
import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
import {generateText} from "ai";
import type {AiModelProfile} from "#shared/types/app/ai";
import {Routes} from "#shared/constants/app";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import {useAppSettings} from "~/composables/app/useAppSettings";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {createAiFetch} from "~/utils/aiFetch";

definePageMeta({
    layout: 'settings'
})

/** One model profile: a provider's model, how features use it (system prompt, tools) and its request parameters. */
const {t} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const {load} = useAppSettings()
const {ai, updateModelProfile, removeModelProfiles, setDefaultModelProfile} = useAiConfig()
onMounted(load)

const back = computed(() => ({path: `${Routes.settings}/ai/models`, query: {q: $route.query.q || undefined}}))
const profile = computed(() => ai.value?.modelProfiles.find(p => p.id === $route.params.id))
const save = (patch: Partial<AiModelProfile>) => profile.value && updateModelProfile(profile.value.id, patch)

const name = ref('')
const systemPrompt = ref('')
watch(() => profile.value?.name, v => name.value = v ?? '', {immediate: true})
watch(() => profile.value?.systemPrompt, v => systemPrompt.value = v ?? '', {immediate: true})

const provider = computed(() => ai.value?.providers.find(p => p.id === profile.value?.providerId))
const isDefault = computed(() => ai.value?.defaultModelProfile === profile.value?.id)
const providerItems = computed(() => (ai.value?.providers ?? []).map(p => ({label: p.name, value: p.id})))
const modelItems = computed(() => (provider.value?.models ?? []).map(model => ({label: model.name ?? model.id, value: model.id, model})))
// A model the provider no longer enables is still shown as chosen.
const modelMissing = computed(() => !!profile.value?.modelId && !modelItems.value.some(i => i.value === profile.value?.modelId))
const modelInfo = computed(() => provider.value?.models.find(m => m.id === profile.value?.modelId))

const testing = ref(false)
async function test() {
    const p = profile.value
    if (!provider.value || !p?.modelId) return
    testing.value = true
    try {
        const model = createOpenAICompatible({name: 'vertex', baseURL: provider.value.baseURL, fetch: createAiFetch(provider.value.id, p.params)})
            .chatModel(p.modelId)
        const {text} = await generateText({
            model,
            instructions: p.systemPrompt || undefined,
            prompt: 'Reply with OK.',
            maxOutputTokens: 5,
            maxRetries: 0,
        })
        $qt.success(t('app.settings.ai.models.testOk', {name: p.name}), text.trim() || undefined)
    } catch (error) {
        $qt.error(t('app.settings.ai.models.testFailed', {name: p.name}), error instanceof Error ? error.message : String(error))
    } finally {
        testing.value = false
    }
}

async function remove() {
    if (!profile.value) return
    await removeModelProfiles([profile.value.id])
    await navigateTo(back.value)
}
</script>

<template>
    <SettingsScrollLayout v-if="ai" :title="profile ? profile.name || t('app.settings.ai.models.unnamed') : t('app.settings.ai.models.title')" global-only>
        <template #header-leading>
            <UButton :to="back" size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :aria-label="t('app.settings.ai.models.back')"/>
        </template>
        <template v-if="profile" #header-trailing>
            <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-plug-zap"
                :loading="testing"
                :disabled="!provider || !profile.modelId"
                :label="t('app.settings.ai.models.test')"
                @click="test"
            />
            <UButton v-if="!isDefault" size="sm" color="neutral" variant="ghost" icon="i-lucide-star" :label="t('app.settings.ai.models.setDefault')" @click="setDefaultModelProfile(profile.id)"/>
            <UTooltip :text="isDefault ? t('app.settings.ai.models.cannotRemoveDefault') : undefined" :disabled="!isDefault">
                <UButton size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" :disabled="isDefault" :label="t('app.settings.ai.models.remove')" @click="remove"/>
            </UTooltip>
        </template>

        <div v-if="profile" class="space-y-4">
            <SettingsAiOffBanner/>
            <SettingsSection :title="t('app.settings.ai.models.general')" :description="isDefault ? t('app.settings.ai.models.isDefault') : undefined">
                <SettingsRow :label="t('app.settings.ai.models.name')">
                    <UInput v-model="name" class="w-72" @blur="name.trim() && name !== profile.name && save({name: name.trim()})"/>
                </SettingsRow>
                <SettingsRow :label="t('app.settings.ai.models.provider')" :error="profile.providerId && !provider ? t('app.settings.ai.models.providerMissing') : undefined">
                    <USelect
                        class="w-72"
                        :items="providerItems"
                        :model-value="provider ? profile.providerId : undefined"
                        :placeholder="t('app.settings.ai.models.chooseProvider')"
                        @update:model-value="save({providerId: $event as string, modelId: ''})"
                    />
                </SettingsRow>
                <SettingsRow
                    :label="t('app.settings.ai.models.model')"
                    :description="provider && !provider.models.length ? t('app.settings.ai.models.noModels') : undefined"
                    :error="modelMissing ? t('app.settings.ai.models.modelMissing', {model: profile.modelId}) : undefined"
                >
                    <USelectMenu
                        class="w-72"
                        :items="modelItems"
                        value-key="value"
                        :filter-fields="['label', 'value']"
                        :model-value="profile.modelId || undefined"
                        :disabled="!provider"
                        :placeholder="modelMissing ? profile.modelId : t('app.settings.ai.models.chooseModel')"
                        :search-input="{placeholder: t('app.settings.ai.models.searchModels')}"
                        :ui="{content: 'min-w-96'}"
                        @update:model-value="save({modelId: $event as string})"
                    >
                        <template #item-label="{item}">
                            <div class="min-w-0">
                                <div class="truncate">{{ item.label }}</div>
                                <SettingsAiModelBadges :model="item.model" class="mt-0.5"/>
                            </div>
                        </template>
                    </USelectMenu>
                </SettingsRow>
            </SettingsSection>

            <SettingsSection :title="t('app.settings.ai.models.behaviour')">
                <SettingsRow :label="t('app.settings.ai.models.tools')" :description="t('app.settings.ai.models.toolsDescription')">
                    <USwitch :model-value="profile.tools !== false" @update:model-value="save({tools: $event ? undefined : false})"/>
                </SettingsRow>
                <div class="px-4 py-2.5 space-y-1.5">
                    <div class="text-sm">{{ t('app.settings.ai.models.systemPrompt') }}</div>
                    <div class="text-xs text-muted">{{ t('app.settings.ai.models.systemPromptDescription') }}</div>
                    <UTextarea
                        v-model="systemPrompt"
                        class="w-full"
                        :rows="3"
                        autoresize
                        :maxrows="16"
                        :placeholder="t('app.settings.ai.models.systemPromptPlaceholder')"
                        @blur="systemPrompt !== profile.systemPrompt && save({systemPrompt})"
                    />
                </div>
            </SettingsSection>

            <SettingsAiModelParams :params="profile.params" :model="modelInfo" @save="params => save({params})"/>
        </div>
        <UEmpty
            v-else
            class="mt-12"
            variant="naked"
            icon="i-lucide-box"
            :title="t('app.settings.ai.models.notFound')"
            :actions="[{label: t('app.settings.ai.models.back'), icon: 'i-lucide-arrow-left', color: 'neutral', variant: 'outline', to: back}]"
        />
    </SettingsScrollLayout>
</template>
