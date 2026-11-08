<script setup lang="ts">
import {createOpenAICompatible} from "@ai-sdk/openai-compatible";
import {generateText} from "ai";
import type {AiModelProfile} from "#shared/types/app/ai";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {createAiFetch} from "~/utils/aiFetch";

/** One model profile: a provider's model plus the system prompt features send with it. */
const props = defineProps<{ profile: AiModelProfile }>()
const {t} = useI18n()
const $qt = useQuickToasts()
const {ai, updateModelProfile, removeModelProfile} = useAiConfig()

const name = ref('')
const systemPrompt = ref('')
watch(() => props.profile.name, v => name.value = v, {immediate: true})
watch(() => props.profile.systemPrompt, v => systemPrompt.value = v, {immediate: true})
const save = (patch: Partial<AiModelProfile>) => updateModelProfile(props.profile.id, patch)

const provider = computed(() => ai.value?.providers.find(p => p.id === props.profile.providerId))
const isDefault = computed(() => ai.value?.defaultModelProfile === props.profile.id)
const providerItems = computed(() => (ai.value?.providers ?? []).map(p => ({label: p.name, value: p.id})))
const modelItems = computed(() => (provider.value?.models ?? []).map(model => ({label: model.name ?? model.id, value: model.id, model})))
// A model the provider no longer enables is still shown as chosen.
const modelMissing = computed(() => !!props.profile.modelId && !modelItems.value.some(i => i.value === props.profile.modelId))
const modelInfo = computed(() => provider.value?.models.find(m => m.id === props.profile.modelId))

const testing = ref(false)
async function test() {
    if (!provider.value || !props.profile.modelId) return
    testing.value = true
    try {
        const model = createOpenAICompatible({name: 'vertex', baseURL: provider.value.baseURL, fetch: createAiFetch(provider.value.id, props.profile.params)})
            .chatModel(props.profile.modelId)
        const {text} = await generateText({
            model,
            instructions: props.profile.systemPrompt || undefined,
            prompt: 'Reply with OK.',
            maxOutputTokens: 5,
            maxRetries: 0,
        })
        $qt.success(t('app.settings.ai.models.testOk', {name: props.profile.name}), text.trim() || undefined)
    } catch (error) {
        $qt.error(t('app.settings.ai.models.testFailed', {name: props.profile.name}), error instanceof Error ? error.message : String(error))
    } finally {
        testing.value = false
    }
}
</script>

<template>
    <SettingsSection :title="profile.name || t('app.settings.ai.models.unnamed')" :description="isDefault ? t('app.settings.ai.models.isDefault') : undefined">
        <template #actions>
            <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-plug-zap"
                :loading="testing"
                :disabled="!provider || !profile.modelId"
                :label="t('app.settings.ai.models.test')"
                @click="test"
            />
            <UTooltip :text="isDefault ? t('app.settings.ai.models.cannotRemoveDefault') : undefined" :disabled="!isDefault">
                <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" :disabled="isDefault" :label="t('app.settings.ai.models.remove')" @click="removeModelProfile(profile.id)"/>
            </UTooltip>
        </template>

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
        <SettingsAiModelParams :params="profile.params" :model="modelInfo" @save="params => save({params})"/>
    </SettingsSection>
</template>
