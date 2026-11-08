<script setup lang="ts">
import type {AiModelInfo, AiModelParams} from "#shared/types/app/ai";
import {AI_NUMBER_PARAMS, sanitizeModelParams} from "#shared/utils/aiParams";

type NumberParam = typeof AI_NUMBER_PARAMS[number]

/**
 * A model profile's request parameters: per parameter a switch (off = the provider's default, not sent) and its value;
 * stop sequences and extra JSON fields. Every change goes out through `save` (sliders when let go), sanitized.
 */
const props = defineProps<{ params?: AiModelParams, model?: AiModelInfo }>()
const emit = defineEmits<{ save: [params: AiModelParams | undefined] }>()
const {t} = useI18n()

const current = computed<AiModelParams>(() => props.params ?? {})
const set = (patch: Partial<AiModelParams>) => emit('save', sanitizeModelParams({...current.value, ...patch}))

// Sliders move a draft; the value is saved when they're let go (a save per step would write settings on every move).
const drafts = ref<Partial<Record<NumberParam['key'], number>>>({})
watch(current, value => drafts.value = Object.fromEntries(AI_NUMBER_PARAMS.map(p => [p.key, value[p.key]])), {immediate: true})
const commit = (p: NumberParam, value = drafts.value[p.key]) => value !== undefined && value !== null && set({[p.key]: value})
const toggle = (p: NumberParam, on: boolean) => set({[p.key]: on ? Math.min(p.start, maxOf(p)) : undefined})
/** Max tokens stops at the model's output limit when it's known. */
const maxOf = (p: NumberParam) => p.key === 'maxOutputTokens' && props.model?.maxOutput ? props.model.maxOutput : p.max

const extraDraft = ref('')
const extraError = ref<string>()
watch(() => props.params?.extra, value => extraDraft.value = value ? JSON.stringify(value, null, 2) : '', {immediate: true})
function saveExtra() {
    const text = extraDraft.value.trim()
    let value: unknown
    try {
        value = text ? JSON.parse(text) : undefined
    } catch {
        value = null
    }
    if (value !== undefined && (typeof value !== 'object' || value === null || Array.isArray(value))) {
        extraError.value = t('app.settings.ai.models.params.extraInvalid')
        return
    }
    extraError.value = undefined
    set({extra: value as Record<string, unknown> | undefined})
}
</script>

<template>
    <div class="flex items-start gap-2 px-4 pt-3 pb-1">
        <div class="flex-1 min-w-0">
            <div class="text-sm text-default">{{ t('app.settings.ai.models.params.title') }}</div>
            <div class="text-xs text-muted">{{ t('app.settings.ai.models.params.description') }}</div>
        </div>
        <UButton
            v-if="params"
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-rotate-ccw"
            :label="t('app.settings.ai.models.params.reset')"
            @click="emit('save', undefined)"
        />
    </div>
    <SettingsRow
        v-for="p in AI_NUMBER_PARAMS"
        :key="p.key"
        :label="t(`app.settings.ai.models.params.${p.key}`)"
        :description="t(`app.settings.ai.models.params.${p.key}Description`)"
    >
        <template v-if="current[p.key] !== undefined">
            <USlider
                v-if="p.slider !== false"
                v-model="drafts[p.key]"
                class="w-32"
                size="sm"
                :min="p.min"
                :max="maxOf(p)"
                :step="p.step"
                @change="commit(p)"
            />
            <UInputNumber
                class="w-32"
                size="sm"
                :min="p.min"
                :max="maxOf(p)"
                :step="p.step"
                :model-value="drafts[p.key]"
                @update:model-value="value => commit(p, value ?? undefined)"
            />
        </template>
        <span v-else class="text-xs text-dimmed">{{ t('app.settings.ai.models.params.providerDefault') }}</span>
        <USwitch :model-value="current[p.key] !== undefined" :aria-label="t(`app.settings.ai.models.params.${p.key}`)" @update:model-value="on => toggle(p, on)"/>
    </SettingsRow>
    <SettingsRow :label="t('app.settings.ai.models.params.stop')" :description="t('app.settings.ai.models.params.stopDescription')">
        <UInputTags
            class="w-72"
            size="sm"
            :placeholder="t('app.settings.ai.models.params.stopPlaceholder')"
            :model-value="current.stop ?? []"
            @update:model-value="stop => set({stop})"
        />
    </SettingsRow>
    <div class="px-4 py-2.5 space-y-1.5">
        <div class="text-sm">{{ t('app.settings.ai.models.params.extra') }}</div>
        <div class="text-xs" :class="extraError ? 'text-error' : 'text-muted'">{{ extraError ?? t('app.settings.ai.models.params.extraDescription') }}</div>
        <UTextarea
            v-model="extraDraft"
            class="w-full font-mono"
            :rows="2"
            autoresize
            :maxrows="12"
            placeholder='{"reasoning_effort": "low"}'
            @blur="saveExtra"
        />
    </div>
</template>
