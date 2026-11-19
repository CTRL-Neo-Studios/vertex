<script setup lang="ts">
import type {DynamicToolUIPart, ToolUIPart} from "ai";
import type {AskUserInput, AskUserOutput} from "../lib/tools";

/**
 * An `askUser` call: its questions, each with its options (one, or several when `multiple`) and a line for the user's
 * own answer; Submit or Skip answers it. Once answered, the answers (or the reply typed in the prompt instead).
 */
const props = defineProps<{ part: ToolUIPart | DynamicToolUIPart, disabled?: boolean }>()
const emit = defineEmits<{ answer: [output: AskUserOutput] }>()

const {t} = useI18n()
// The AI SDK checked the input against askUser's schema before the call got here; the output is ours.
const questions = computed(() => (props.part.input as AskUserInput | undefined)?.questions ?? [])
const output = computed(() => props.part.state === 'output-available' ? props.part.output as AskUserOutput : undefined)

const picked = ref<string[][]>([])
const own = ref<string[]>([])
watch(questions, list => {
    picked.value = list.map(() => [])
    own.value = list.map(() => '')
}, {immediate: true})

const answers = computed(() => questions.value.map((q, i) => {
    const typed = own.value[i]?.trim()
    const chosen = [...picked.value[i] ?? [], ...typed ? [typed] : []]
    return {question: q.question, answer: q.multiple ? chosen : chosen.join('; ')}
}))
const answered = computed(() => answers.value.some(a => a.answer.length > 0))

function submit() {
    if (answered.value && !props.disabled) emit('answer', {answers: answers.value})
}

/** The answer given to question `at`, once answered through the card. */
function given(at: number) {
    const out = output.value
    const answer = out && 'answers' in out ? out.answers[at]?.answer : undefined
    const text = Array.isArray(answer) ? answer.join(', ') : answer
    return text || t('plugins.chat.questions.noAnswer')
}
</script>

<template>
    <div class="my-2 rounded-md border border-default text-sm">
        <div class="flex items-center gap-2 px-3 py-2">
            <UIcon name="i-lucide-message-circle-question" class="size-4 text-muted shrink-0"/>
            <span class="font-medium grow">{{ $t('plugins.chat.questions.title', { count: questions.length }) }}</span>
            <span v-if="output && 'skipped' in output" class="text-xs text-muted">{{ $t('plugins.chat.questions.skipped') }}</span>
        </div>
        <div v-for="(q, i) in questions" :key="i" class="border-t border-default px-3 py-2 flex flex-col gap-1.5">
            <p>{{ q.question }}</p>
            <p v-if="output && 'answers' in output" class="text-muted">{{ given(i) }}</p>
            <template v-else-if="!output">
                <UToggleGroup
                    v-if="q.options?.length"
                    :type="q.multiple ? 'multiple' : 'single'"
                    :items="q.options.map(option => ({
                        value: option.label,
                        label: option.label,
                        title: option.description,
                        icon: q.multiple ? picked[i]?.includes(option.label) ? 'i-lucide-square-check' : 'i-lucide-square' : undefined,
                    }))"
                    :model-value="q.multiple ? picked[i] : picked[i]?.[0]"
                    size="xs"
                    variant="outline"
                    :disabled
                    class="flex-wrap"
                    @update:model-value="v => picked[i] = [v ?? []].flat().filter(Boolean) as string[]"
                />
                <UInput
                    v-model="own[i]"
                    size="xs"
                    variant="soft"
                    :placeholder="q.options?.length ? $t('plugins.chat.questions.other') : $t('plugins.chat.questions.answer')"
                    :disabled
                    @keydown.enter.prevent="submit"
                />
            </template>
        </div>
        <p v-if="output && 'reply' in output" class="border-t border-default px-3 py-2 text-muted">
            {{ $t('plugins.chat.questions.replied', { reply: output.reply }) }}
        </p>
        <div v-if="!output" class="border-t border-default px-3 py-2 flex justify-end gap-1">
            <UButton size="xs" color="neutral" variant="ghost" :label="$t('plugins.chat.questions.skip')" :disabled
                     @click="emit('answer', { skipped: true })"/>
            <UButton size="xs" :label="$t('plugins.chat.questions.submit')" :disabled="disabled || !answered" @click="submit"/>
        </div>
    </div>
</template>
