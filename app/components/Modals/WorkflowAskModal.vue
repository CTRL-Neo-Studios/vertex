<script lang="ts">
/** A workflow's question (the `ui` capability). */
export type Ask =
    | { kind: 'text', question: string, initial: string }
    | { kind: 'number', question: string, initial: number }
    | { kind: 'choice', question: string, choices: string[] }
    | { kind: 'yesNo', question: string }
    /** `question` is the form's title. */
    | { kind: 'form', question: string, fields: string[] }
</script>

<script setup lang="ts">
/** Asks one question for a running workflow. Closing it any other way than answering resolves `undefined` (cancelled). */
const props = defineProps<{
    /** The workflow's. */
    name: string,
    kind: Ask['kind'],
    question: string,
    initial?: string | number,
    choices?: string[],
    fields?: string[],
}>()
const emit = defineEmits<{ close: [answer?: string | number | boolean | Record<string, string>] }>()
const {t} = useI18n()

const text = ref(typeof props.initial === 'string' ? props.initial : '')
const number = ref(typeof props.initial === 'number' ? props.initial : 0)
const choice = ref(props.choices?.[0])
const answers = reactive(Object.fromEntries((props.fields ?? []).map(f => [f, ''])))

function submit() {
    if (props.kind === 'text') emit('close', text.value)
    else if (props.kind === 'number') emit('close', number.value)
    else if (props.kind === 'choice') emit('close', choice.value)
    else if (props.kind === 'form') emit('close', {...answers})
}
</script>

<template>
    <UModal
        :title="props.kind === 'form' ? props.question : props.name"
        :description="props.kind === 'form' ? props.name : props.question"
        :close="{ onClick: () => emit('close') }"
        size="sm"
    >
        <template v-if="props.kind !== 'yesNo'" #body>
            <form id="workflow-ask" class="space-y-3" @submit.prevent="submit">
                <UInput v-if="props.kind === 'text'" v-model="text" class="w-full" autofocus/>
                <UInputNumber v-else-if="props.kind === 'number'" v-model="number" class="w-full" autofocus/>
                <URadioGroup v-else-if="props.kind === 'choice'" v-model="choice" :items="props.choices ?? []"/>
                <template v-else>
                    <UFormField v-for="(field, i) in props.fields" :key="field" :label="field">
                        <UInput v-model="answers[field]" class="w-full" :autofocus="i === 0"/>
                    </UFormField>
                </template>
            </form>
        </template>
        <template #footer>
            <div class="w-full inline-flex items-center justify-end gap-2">
                <UButton size="sm" color="neutral" variant="ghost" :label="t('app.editor.ui.workflowAsk.cancel')" @click="emit('close')"/>
                <template v-if="props.kind === 'yesNo'">
                    <UButton size="sm" color="neutral" variant="outline" :label="t('app.editor.ui.workflowAsk.no')" @click="emit('close', false)"/>
                    <UButton size="sm" :label="t('app.editor.ui.workflowAsk.yes')" autofocus @click="emit('close', true)"/>
                </template>
                <UButton v-else size="sm" type="submit" form="workflow-ask" :label="t('app.editor.ui.workflowAsk.ok')" :disabled="props.kind === 'choice' && choice === undefined"/>
            </div>
        </template>
    </UModal>
</template>
