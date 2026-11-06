<script setup lang="ts">
import type {Chat} from "@ai-sdk/vue";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import ChatMarkdown from "~/components/Chat/ChatMarkdown.vue";
import ChatLink from "~/components/Chat/ChatLink.vue";
import ChatVaultForm from "~/components/Chat/ChatVaultForm.vue";

/** One conversation: header, messages, prompt. In a tab it offers "move to side panel"; in the side panel, "open in tab". */
const props = defineProps<{ chatId: string, inSidePanel?: boolean }>()

const {t, te} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {vault, refresh, summary, profileId, saveError, retrySave, liveChat, send, setProfile, showInSidePanel, openInTab} = useChats(session)
const {getFilteredFiles} = useActiveWorkspaceIndex(session)
const settings = useSettingsScope().effective

const title = computed(() => summary(props.chatId).value?.title || t('app.chat.untitled'))
const locked = computed(() => vault.value === 'none' || vault.value === 'locked')

const chat = shallowRef<Chat<VertexChatMessage>>()
const loadError = ref('')
watch([() => props.chatId, () => locked.value || vault.value === null], async ([id, unavailable]) => {
    chat.value = undefined
    loadError.value = ''
    if (unavailable) return
    try {
        const live = await liveChat(id)
        if (id === props.chatId) chat.value = live
    } catch (e) {
        loadError.value = errorText(e)
    }
}, {immediate: true})
onMounted(() => { if (vault.value === null) refresh() })

function errorText(e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return te(message) ? t(message) : message
}

const scrollEl = useTemplateRef<HTMLElement>('scrollEl')
const {y: scrollY} = useScroll(scrollEl)
const isScrolled = computed(() => scrollY.value > 2)

const lastId = computed(() => chat.value?.messages.at(-1)?.id)
const isStreaming = (message: VertexChatMessage) => chat.value?.status === 'streaming' && message.id === lastId.value
const assistant = computed(() => ({
    actions: [{
        label: t('app.chat.copy'),
        icon: 'i-lucide-copy',
        async onClick(_e: MouseEvent, message: VertexChatMessage) {
            await writeText(message.parts.flatMap(p => p.type === 'text' ? [p.text] : []).join('\n\n'))
            $qt.success(t('app.chat.copied'))
        },
    }],
}))

const input = ref('')
const notes = ref<string[]>([])
const sendError = ref('')
const banner = computed(() => sendError.value || chat.value?.error?.message)
const unsaved = computed(() => saveError(props.chatId).value)
const retrying = ref(false)

async function retry() {
    retrying.value = true
    // A failure keeps `unsaved` set, so the alert stays.
    await retrySave(props.chatId).catch(() => {})
    retrying.value = false
}

async function onSubmit() {
    const text = input.value.trim()
    if (!text || !chat.value || chat.value.status === 'submitted' || chat.value.status === 'streaming') return
    const attached = notes.value
    input.value = ''
    notes.value = []
    sendError.value = ''
    try {
        await send(props.chatId, text, attached)
    } catch (e) {
        sendError.value = errorText(e)
        // Give the unsent prompt back unless the user already typed a new one.
        if (!input.value) {
            input.value = text
            notes.value = attached
        }
    }
}

function dismissError() {
    sendError.value = ''
    chat.value?.clearError()
}

const noteItems = computed(() => getFilteredFiles(f => !f.isFolder && f.fileExt === 'md')
    .map(f => ({label: fileNameFromPath(f.fileName, true), description: f.relativePath, value: f.relativePath}))
    .sort((a, b) => a.description.localeCompare(b.description)))

// USelect can't hold an empty value; '@default' stands for "the chat feature's profile".
const DEFAULT_PROFILE = '@default'
const profileItems = computed(() => [
    {label: t('app.chat.defaultProfile'), value: DEFAULT_PROFILE},
    ...(settings.value?.aiConfig.modelProfiles ?? []).map(p => ({label: p.name, value: p.id})),
])
const profile = computed({
    get: () => profileId(props.chatId).value ?? DEFAULT_PROFILE,
    set: value => setProfile(props.chatId, value === DEFAULT_PROFILE ? undefined : value),
})
</script>

<template>
    <div class="flex flex-col h-full w-full min-h-0">
        <div class="flex items-center gap-1.5 px-3 h-10 shrink-0 border-b border-default">
            <UIcon name="i-lucide-message-square" class="size-4 text-muted shrink-0"/>
            <span class="truncate text-sm font-medium text-highlighted grow">{{ title }}</span>
            <UTooltip v-if="inSidePanel" :text="$t('app.chat.openInTab')">
                <UButton icon="i-lucide-square-arrow-out-up-left" size="xs" color="neutral" variant="ghost" :aria-label="$t('app.chat.openInTab')" @click="openInTab(chatId)"/>
            </UTooltip>
            <UTooltip v-else :text="$t('app.chat.moveToSidePanel')">
                <UButton icon="i-lucide-panel-right" size="xs" color="neutral" variant="ghost" :aria-label="$t('app.chat.moveToSidePanel')" @click="showInSidePanel(chatId)"/>
            </UTooltip>
        </div>

        <div v-if="locked" class="flex-1 min-h-0 overflow-y-auto flex items-center">
            <ChatVaultForm/>
        </div>

        <template v-else-if="chat">
            <div ref="scrollEl" :class="['flex-1 min-h-0 overflow-y-auto no-scrollbar scroll-fade', isScrolled && 'is-scrolled']">
                <UChatMessages
                    :messages="chat.messages"
                    :status="chat.status"
                    :assistant
                    should-auto-scroll
                    :class="['mx-auto w-full py-4', inSidePanel ? 'px-2' : 'px-4 max-w-3xl']"
                >
                    <template #indicator>
                        <UChatShimmer :text="$t('app.chat.thinking')" class="text-sm"/>
                    </template>
                    <template #content="{ message }">
                        <div v-if="message.role === 'user' && message.metadata?.notes?.length" class="flex flex-wrap gap-1 mb-1.5">
                            <ChatLink v-for="note in message.metadata.notes" :key="note" :note>
                                <UBadge icon="i-lucide-file-text" size="sm" color="neutral" variant="outline" :label="fileNameFromPath(note, true)"/>
                            </ChatLink>
                        </div>
                        <template v-for="(part, index) in message.parts" :key="`${message.id}-${index}`">
                            <UChatReasoning v-if="part.type === 'reasoning'" :text="part.text" :streaming="part.state === 'streaming'"/>
                            <ChatMarkdown v-else-if="part.type === 'text'" :value="part.text" :streaming="isStreaming(message)"/>
                        </template>
                    </template>
                </UChatMessages>
            </div>

            <div :class="['shrink-0 mx-auto w-full flex flex-col gap-2 pb-3', inSidePanel ? 'px-2' : 'px-4 max-w-3xl']">
                <UAlert
                    v-if="unsaved"
                    color="warning"
                    variant="subtle"
                    icon="i-lucide-save-off"
                    :title="$t('app.chat.saveFailed')"
                    :description="unsaved"
                    :actions="[{ label: $t('app.chat.retrySave'), icon: 'i-lucide-refresh-cw', color: 'warning', variant: 'soft', size: 'xs', loading: retrying, onClick: retry }]"
                />
                <UAlert
                    v-if="banner"
                    color="error"
                    variant="subtle"
                    icon="i-lucide-circle-alert"
                    :title="$t('app.chat.sendFailed')"
                    :description="banner"
                    :close="{ onClick: dismissError }"
                />
                <UChatPrompt v-model="input" :error="chat.error" :placeholder="$t('app.chat.placeholder')" variant="subtle" @submit="onSubmit">
                    <template #header v-if="notes.length">
                        <div class="flex flex-wrap gap-1">
                            <UBadge v-for="note in notes" :key="note" icon="i-lucide-file-text" size="sm" color="neutral" variant="soft" :label="fileNameFromPath(note, true)">
                                <template #trailing>
                                    <UButton icon="i-lucide-x" size="xs" color="neutral" variant="link" class="p-0" :aria-label="$t('app.chat.removeNote')" @click="notes = notes.filter(n => n !== note)"/>
                                </template>
                            </UBadge>
                        </div>
                    </template>
                    <template #footer>
                        <USelectMenu
                            v-model="notes"
                            :items="noteItems"
                            value-key="value"
                            multiple
                            icon="i-lucide-paperclip"
                            size="sm"
                            variant="ghost"
                            :search-input="{ placeholder: $t('app.chat.searchNotes') }"
                            :content="{ align: 'start' }"
                            :ui="{ content: 'min-w-72' }"
                            :aria-label="$t('app.chat.attachNote')"
                            class="min-w-0"
                        >
                            <!-- The side panel is narrow: icon only there. -->
                            <span v-if="!inSidePanel" class="text-muted truncate">{{ $t('app.chat.attachNote') }}</span>
                        </USelectMenu>
                        <USelect v-model="profile" :items="profileItems" icon="i-lucide-bot" size="sm" variant="ghost" class="min-w-0 max-w-48" :ui="{ value: 'truncate' }"/>
                        <div class="grow"/>
                        <UChatPromptSubmit :status="chat.status" size="sm" @stop="chat.stop()" @reload="chat.regenerate()"/>
                    </template>
                </UChatPrompt>
            </div>
        </template>

        <div v-else class="flex-1 flex items-center justify-center p-4 text-sm text-muted text-center">
            <span v-if="loadError">{{ loadError }}</span>
            <UIcon v-else name="i-lucide-loader-circle" class="size-5 animate-spin"/>
        </div>
    </div>
</template>
