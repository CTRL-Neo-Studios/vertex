<script setup lang="ts">
import type {AiModelInfo} from "#shared/types/app/ai";

/** A model's vendor and capabilities as small icon badges, each explained by a tooltip. */
const props = defineProps<{ model: AiModelInfo }>()
const {t} = useI18n()

/** Vendor ids (models.dev providers, `/models` id prefixes) → simple-icons; nuxt.config bundles each. */
const VENDOR_ICONS: Record<string, string> = {
    openai: 'i-simple-icons-openai',
    anthropic: 'i-simple-icons-anthropic',
    google: 'i-simple-icons-googlegemini',
    meta: 'i-simple-icons-meta',
    'meta-llama': 'i-simple-icons-meta',
    mistral: 'i-simple-icons-mistralai',
    mistralai: 'i-simple-icons-mistralai',
    deepseek: 'i-simple-icons-deepseek',
    qwen: 'i-simple-icons-qwen',
    alibaba: 'i-simple-icons-alibabacloud',
    microsoft: 'i-simple-icons-microsoft',
    nvidia: 'i-simple-icons-nvidia',
    perplexity: 'i-simple-icons-perplexity',
    ollama: 'i-simple-icons-ollama',
    huggingface: 'i-simple-icons-huggingface',
    amazon: 'i-simple-icons-amazon',
    'amazon-bedrock': 'i-simple-icons-amazon',
    ibm: 'i-simple-icons-ibm',
    'ibm-granite': 'i-simple-icons-ibm',
    moonshotai: 'i-simple-icons-moonshotai',
    minimax: 'i-simple-icons-minimax',
    openrouter: 'i-simple-icons-openrouter',
}

const MODALITY_ICONS: Record<string, string> = {image: 'i-lucide-image', audio: 'i-lucide-audio-lines', file: 'i-lucide-file', pdf: 'i-lucide-file'}
const compact = new Intl.NumberFormat('en', {notation: 'compact'})
const price = (usd?: number) => (usd === undefined ? '?' : `$${Number(usd.toFixed(2))}`)

const badges = computed<{icon?: string, label?: string, tip: string}[]>(() => {
    const m = props.model
    const modalities = [...new Set((m.inputModalities ?? []).filter(x => MODALITY_ICONS[x]).map(x => (x === 'pdf' ? 'file' : x)))]
    return [
        ...modalities.map(x => ({icon: MODALITY_ICONS[x]!, tip: t(`app.settings.ai.badges.${x}`)})),
        ...(m.toolCall ? [{icon: 'i-lucide-wrench', tip: t('app.settings.ai.badges.tools')}] : []),
        ...(m.reasoning ? [{icon: 'i-lucide-brain', tip: t('app.settings.ai.badges.reasoning')}] : []),
        ...(m.openWeights ? [{icon: 'i-lucide-unlock', tip: t('app.settings.ai.badges.openWeights')}] : []),
        ...(m.contextLength ? [{label: compact.format(m.contextLength), tip: t('app.settings.ai.badges.context', {tokens: m.contextLength.toLocaleString()})}] : []),
        ...(m.cost ? [{label: `${price(m.cost.input)} / ${price(m.cost.output)}`, tip: t('app.settings.ai.badges.price', {input: price(m.cost.input), output: price(m.cost.output)})}] : []),
    ]
})
</script>

<template>
    <div class="flex items-center gap-1 flex-wrap">
        <UTooltip :text="model.vendor ? t('app.settings.ai.badges.vendor', {vendor: model.vendor}) : t('app.settings.ai.badges.unknownVendor')">
            <UIcon :name="(model.vendor && VENDOR_ICONS[model.vendor]) || 'i-lucide-bot'" class="size-4 text-muted shrink-0"/>
        </UTooltip>
        <UTooltip v-for="badge in badges" :key="badge.tip" :text="badge.tip">
            <UBadge size="sm" color="neutral" variant="subtle" :icon="badge.icon" :label="badge.label"/>
        </UTooltip>
    </div>
</template>
