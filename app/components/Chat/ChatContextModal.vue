<script setup lang="ts">
import {getToolName, isToolUIPart} from "ai";
import type {ChatRequestInfo, VertexChatMessage} from "#shared/types/app/chats";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

/**
 * What a chat sent and got back, as of opening. Totals on top; per message its parts and raw JSON, a reply's model
 * calls (model, timing, tokens, the instructions without the notes, the notes sent, the tools offered) and its tool
 * calls by step. `focus` opens that message and scrolls to it.
 */
const props = defineProps<{ messages: VertexChatMessage[], title: string, focus?: string }>()
const emit = defineEmits<{ close: [] }>()

const {t, locale} = useI18n()
const settings = useSettingsScope().effective

const profileName = (id: string) => settings.value?.aiConfig.modelProfiles.find(p => p.id === id)?.name ?? id
const num = (n: number | undefined) => n === undefined ? '—' : n.toLocaleString(locale.value)
const when = (ms: number | undefined) => ms ? new Date(ms).toLocaleString(locale.value) : '—'
const seconds = (ms: number) => (ms / 1000).toLocaleString(locale.value, {maximumFractionDigits: 1})
const json = (value: unknown) => JSON.stringify(value, null, 2)

const totals = computed(() => {
    const requests = props.messages.flatMap(m => m.metadata?.requests ?? [])
    const sum = (pick: (r: ChatRequestInfo) => number | undefined) => requests.reduce((total, r) => total + (pick(r) ?? 0), 0)
    return {
        messages: props.messages.length,
        calls: requests.length,
        input: num(sum(r => r.usage?.input)),
        output: num(sum(r => r.usage?.output)),
        seconds: seconds(sum(r => r.finishedAt && r.finishedAt - r.startedAt)),
    }
})

const items = computed(() => props.messages.map((message, i) => ({
    value: message.id,
    label: `${i + 1}. ${t(message.role === 'user' ? 'app.chat.context.user' : 'app.chat.context.assistant')}`,
    icon: message.role === 'user' ? 'i-lucide-user' : 'i-lucide-bot',
    message,
})))
const open = ref<string[]>(props.focus ? [props.focus] : [])
onMounted(async () => {
    await nextTick()
    if (props.focus) document.getElementById(`chat-context-${props.focus}`)?.scrollIntoView({block: 'start'})
})

/** Each part type with how many there are, in order of first appearance. */
const partCounts = (message: VertexChatMessage) => {
    const counts = new Map<string, number>()
    for (const p of message.parts) counts.set(p.type, (counts.get(p.type) ?? 0) + 1)
    return [...counts].map(([type, n]) => n > 1 ? `${type} ×${n}` : type)
}

/** The tool calls with the step they ran in (1-based, counted by `step-start` parts). */
const toolCalls = (message: VertexChatMessage) => {
    let step = 0
    return message.parts.flatMap(p => {
        if (p.type === 'step-start') step++
        if (!isToolUIPart(p)) return []
        return [{id: p.toolCallId, name: getToolName(p), state: p.state, step: Math.max(step, 1), detail: json({input: p.input, output: p.output, error: p.errorText})}]
    })
}

const tokens = (r: ChatRequestInfo) => [
    t('app.chat.context.tokensLine', {input: num(r.usage?.input), output: num(r.usage?.output)}),
    r.usage?.reasoning ? t('app.chat.context.reasoning', {n: num(r.usage.reasoning)}) : '',
    r.usage?.cachedInput ? t('app.chat.context.cached', {n: num(r.usage.cachedInput)}) : '',
].filter(Boolean).join(' · ')
</script>

<template>
    <UModal :close="{ onClick: () => emit('close') }" :title="$t('app.chat.context.title', { title })" :ui="{ content: 'max-w-3xl' }">
        <template #body>
            <div class="flex flex-col gap-4 text-sm">
                <p class="text-muted">
                    {{ $t('app.chat.context.totals', totals) }}
                </p>
                <UAccordion v-model="open" type="multiple" :items :ui="{ body: 'pb-4' }">
                    <template #body="{ item }">
                        <div :id="`chat-context-${item.value}`" class="flex flex-col gap-3">
                            <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                                <template v-if="item.message.role === 'user'">
                                    <dt class="text-muted">{{ $t('app.chat.context.sent') }}</dt>
                                    <dd>{{ when(item.message.metadata?.createdAt) }}</dd>
                                    <template v-if="item.message.metadata?.notes?.length">
                                        <dt class="text-muted">{{ $t('app.chat.context.attached') }}</dt>
                                        <dd>{{ item.message.metadata.notes.join(', ') }}</dd>
                                    </template>
                                </template>
                                <dt class="text-muted">{{ $t('app.chat.context.parts') }}</dt>
                                <dd class="flex flex-wrap gap-1">
                                    <UBadge v-for="part in partCounts(item.message)" :key="part" :label="part" size="sm" color="neutral" variant="soft"/>
                                </dd>
                            </dl>

                            <template v-if="item.message.role === 'assistant'">
                                <p v-if="!item.message.metadata?.requests?.length" class="text-muted">{{ $t('app.chat.context.notRecorded') }}</p>
                                <section
                                    v-for="(request, n) in item.message.metadata?.requests"
                                    :key="n"
                                    class="flex flex-col gap-2 rounded-md border border-default p-3"
                                >
                                    <h4 class="font-medium">{{ $t('app.chat.context.call', { n: n + 1 }) }}</h4>
                                    <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                                        <dt class="text-muted">{{ $t('app.chat.context.model') }}</dt>
                                        <dd>{{ request.modelId }} ({{ profileName(request.profileId) }})</dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.started') }}</dt>
                                        <dd>{{ when(request.startedAt) }}</dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.duration') }}</dt>
                                        <dd>{{ request.finishedAt ? $t('app.chat.context.seconds', { n: seconds(request.finishedAt - request.startedAt) }) : $t('app.chat.context.unfinished') }}</dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.finishReason') }}</dt>
                                        <dd>{{ request.finishReason ?? '—' }}</dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.tokens') }}</dt>
                                        <dd>{{ tokens(request) }}</dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.notesSent') }}</dt>
                                        <dd>
                                            <span v-if="!request.notes.length" class="text-muted">—</span>
                                            <span v-for="note in request.notes" :key="note.path" class="block" :title="note.path">
                                                {{ fileNameFromPath(note.path, true) }} <span class="text-muted">· {{ $t('app.chat.context.chars', { n: num(note.chars) }) }}</span>
                                            </span>
                                        </dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.toolsSent') }}</dt>
                                        <dd class="flex flex-wrap gap-1">
                                            <span v-if="!request.tools.loaded.length" class="text-muted">—</span>
                                            <UBadge v-for="name in request.tools.loaded" :key="name" :label="name" size="sm" color="neutral" variant="soft"/>
                                        </dd>
                                        <dt class="text-muted">{{ $t('app.chat.context.toolsDeferred') }}</dt>
                                        <dd class="flex flex-wrap gap-1">
                                            <span v-if="!request.tools.deferred.length" class="text-muted">—</span>
                                            <UBadge v-for="name in request.tools.deferred" :key="name" :label="name" size="sm" color="neutral" variant="outline"/>
                                        </dd>
                                    </dl>
                                    <details>
                                        <summary class="cursor-pointer text-muted">{{ $t('app.chat.context.instructions') }}</summary>
                                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{{ request.prompt || '—' }}</pre>
                                    </details>
                                </section>

                                <section v-if="toolCalls(item.message).length" class="flex flex-col gap-1">
                                    <h4 class="font-medium">{{ $t('app.chat.context.toolCalls') }}</h4>
                                    <details v-for="call in toolCalls(item.message)" :key="call.id">
                                        <summary class="cursor-pointer">
                                            {{ call.name }} <span class="text-muted">· {{ $t('app.chat.context.step', { n: call.step }) }} · {{ call.state }}</span>
                                        </summary>
                                        <pre class="mt-1 text-xs whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{{ call.detail }}</pre>
                                    </details>
                                </section>
                            </template>

                            <details>
                                <summary class="cursor-pointer text-muted">{{ $t('app.chat.context.raw') }}</summary>
                                <pre class="mt-1 text-xs whitespace-pre-wrap break-words max-h-80 overflow-y-auto">{{ json(item.message) }}</pre>
                            </details>
                        </div>
                    </template>
                </UAccordion>
            </div>
        </template>
    </UModal>
</template>
