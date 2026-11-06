<script setup lang="ts">
import type {Chat} from "@ai-sdk/vue";
import {getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart} from "ai";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import {ask} from "@tauri-apps/plugin-dialog";
import {fileNameFromPath} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useChats} from "~/composables/ai/useChats";
import {useChatActions} from "~/composables/ai/useChatActions";
import {useAiConfig} from "~/composables/ai/useAiConfig";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {toolsUnsupported} from "~/utils/chatTools";
import ChatMarkdown from "~/components/Chat/ChatMarkdown.vue";
import ChatLink from "~/components/Chat/ChatLink.vue";
import ChatVaultForm from "~/components/Chat/ChatVaultForm.vue";

/** One conversation: header, messages, prompt. In a tab it offers "move to side panel"; in the side panel, "open in tab". */
const props = defineProps<{ chatId: string, inSidePanel?: boolean }>()

const {t, te} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {vault, refresh, summary, profileId, chatProfile, saveError, retrySave, liveChat, send, setProfile, renameChat, showInSidePanel, openInTab, pendingPrompt} = useChats(session)
const {updateModelProfile} = useAiConfig()
const {chatActions} = useChatActions(session)
const {getFilteredFiles} = useActiveWorkspaceIndex(session)
const settings = useSettingsScope().effective

const title = computed(() => summary(props.chatId).value?.title || t('app.chat.untitled'))
const current = computed(() => summary(props.chatId).value)
const [DefineBody, Body] = createReusableTemplate()

// The tab header is the file viewers': breadcrumbs from a path (the chat's folders, then a stand-in for the title,
// which is the editable last crumb) and the title as the renamable name.
const crumbPath = computed(() => [current.value?.folder, 'chat'].filter(Boolean).join('/'))
const titleDraft = ref('')
watch(title, value => { titleDraft.value = value }, {immediate: true})
const renaming = ref(false)

async function onRename(_old: string, next: string) {
    const name = next.trim()
    if (!name || name === current.value?.title) {
        titleDraft.value = title.value
        return
    }
    renaming.value = true
    try {
        await renameChat(props.chatId, name)
    } catch (e) {
        $qt.error(t('app.chat.actionFailed'), errorText(e))
        titleDraft.value = title.value
    } finally {
        renaming.value = false
    }
}
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

// A model without tool calling refuses any request that offers tools: say so, and offer to turn them off for its
// profile and retry.
watch(() => chat.value?.error, async error => {
    const live = chat.value
    if (!error || !live || !toolsUnsupported(error.message)) return
    live.clearError()
    const profile = chatProfile(props.chatId)
    const turnOff = await ask(t('app.chat.toolsUnsupported.description', {model: profile?.modelId ?? ''}), {
        title: t('app.chat.toolsUnsupported.title'),
        kind: 'warning',
        okLabel: t('app.chat.toolsUnsupported.turnOff'),
        cancelLabel: t('app.generic.cancel'),
    })
    if (!turnOff || !profile) return
    await updateModelProfile(profile.id, {tools: false})
    await live.regenerate()
})

// Tool calls in a reply, as UChatTool rows: what ran (and on what), how it ended, and its raw result when opened.
type ToolPart = ToolUIPart | DynamicToolUIPart
const TOOL_ICONS: Record<string, string> = {
    findTools: 'i-lucide-search', searchNotes: 'i-lucide-file-search', readNote: 'i-lucide-file-text', listNotes: 'i-lucide-list-tree',
    readDocument: 'i-lucide-file-text', readSelection: 'i-lucide-text-select', proposeEdit: 'i-lucide-file-pen-line', proposeInsert: 'i-lucide-file-plus',
}
const TOOL_DETAIL_CHARS = 4000

function toolView(part: ToolPart) {
    const name = getToolName(part)
    const input = (part.input ?? {}) as { query?: string, path?: string, folder?: string }
    const output = part.state === 'output-available' ? part.output as { status?: string, error?: string } | undefined : undefined
    const pending = part.state === 'input-streaming' || part.state === 'input-available'
    const suffix = part.state === 'output-error' || output?.error ? t('app.chat.tools.failed')
        : output?.status === 'accepted' || output?.status === 'rejected' ? t(`app.chat.tools.${output.status}`)
        : pending && (name === 'proposeEdit' || name === 'proposeInsert') ? t('app.chat.tools.waiting')
        : input.query ?? input.path ?? input.folder
    return {text: te(`app.chat.tools.names.${name}`) ? t(`app.chat.tools.names.${name}`) : name, suffix, icon: TOOL_ICONS[name] ?? 'i-lucide-wrench', streaming: pending}
}

function toolDetail(part: ToolPart) {
    const text = part.state === 'output-error' ? part.errorText : part.state === 'output-available' ? JSON.stringify(part.output, null, 2) : ''
    return text.length > TOOL_DETAIL_CHARS ? `${text.slice(0, TOOL_DETAIL_CHARS)}…` : text
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

// `@` mentions: typing `@` (at the start or after whitespace) lists notes matching what follows, spaces included (note
// names have them), while anything matches; picking one attaches it like the Attach picker and drops the `@query` text.
// Focus stays in the textarea, which drives the list's keys.
const promptRef = useTemplateRef<{ $el: HTMLElement }>('promptRef')
const textarea = () => promptRef.value?.$el.querySelector('textarea') ?? null
const mention = ref<{ start: number, end: number, query: string } | null>(null)
const mentionIndex = ref(0)
const MENTION_LIMIT = 8
/** Where the `@` was that Esc dismissed: that mention stays closed until it's gone. */
let dismissedAt = -1
const mentionItems = computed(() => {
    const query = mention.value?.query.toLowerCase()
    if (query === undefined) return []
    return noteItems.value
        .filter(n => !notes.value.includes(n.value) && (n.label.toLowerCase().includes(query) || n.description.toLowerCase().includes(query)))
        .slice(0, MENTION_LIMIT)
})

function updateMention() {
    const el = textarea()
    const caret = el?.selectionStart ?? 0
    const match = el && el.selectionStart === el.selectionEnd ? /(?:^|\s)@([^@\n]{0,40})$/.exec(input.value.slice(0, caret)) : null
    const next = match ? {start: caret - match[1]!.length - 1, end: caret, query: match[1]!} : null
    if (next?.start !== dismissedAt) dismissedAt = -1
    if (next?.query !== mention.value?.query) mentionIndex.value = 0
    mention.value = next && next.start !== dismissedAt ? next : null
}

async function pickMention(path: string) {
    const at = mention.value
    if (!at) return
    input.value = input.value.slice(0, at.start) + input.value.slice(at.end)
    if (!notes.value.includes(path)) notes.value = [...notes.value, path]
    mention.value = null
    await nextTick()
    textarea()?.setSelectionRange(at.start, at.start)
}

/** Capture phase, so Enter/Tab/arrows/Esc never reach UChatPrompt (submit, blur) while the list is open. */
function onMentionKey(e: KeyboardEvent) {
    if (!mention.value || !mentionItems.value.length || e.isComposing) return
    const count = mentionItems.value.length
    if (e.key === 'ArrowDown') mentionIndex.value = (mentionIndex.value + 1) % count
    else if (e.key === 'ArrowUp') mentionIndex.value = (mentionIndex.value - 1 + count) % count
    else if (e.key === 'Enter' || e.key === 'Tab') pickMention(mentionItems.value[mentionIndex.value]!.value)
    else if (e.key === 'Escape') {
        dismissedAt = mention.value.start
        mention.value = null
    }
    else return
    e.preventDefault()
    e.stopPropagation()
}

// "Ask in chat" from the editor: the quote goes after anything already typed, the note joins the attached ones.
watch(pendingPrompt, async request => {
    if (request?.chatId !== props.chatId) return
    pendingPrompt.value = null
    input.value = input.value.trim() ? `${input.value.trimEnd()}\n\n${request.text}` : request.text
    notes.value = [...new Set([...notes.value, ...request.notes])]
    await nextTick()
    const el = textarea()
    el?.focus()
    el?.setSelectionRange(input.value.length, input.value.length)
}, {immediate: true})

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
    <DefineBody>
        <div v-if="locked" class="flex-1 min-h-0 overflow-y-auto flex items-center">
            <ChatVaultForm/>
        </div>

        <template v-else-if="chat">
            <div ref="scrollEl" :class="['flex-1 min-h-0 overflow-y-auto no-scrollbar', inSidePanel ? ['scroll-fade', isScrolled && 'is-scrolled'] : 'pt-10']">
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
                            <UChatTool v-else-if="isToolUIPart(part)" v-bind="toolView(part)" :disabled="!toolDetail(part)" class="my-1">
                                <pre class="text-xs text-muted whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{{ toolDetail(part) }}</pre>
                            </UChatTool>
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
                <div class="contents" @keydown.capture="onMentionKey" @input="updateMention" @keyup="updateMention" @click="updateMention">
                <UChatPrompt ref="promptRef" v-model="input" :error="chat.error" :placeholder="$t('app.chat.placeholder')" variant="subtle" @submit="onSubmit" @blur="mention = null">
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
                <UPopover
                    :open="!!mention && mentionItems.length > 0"
                    :reference="promptRef?.$el"
                    :content="{ side: 'top', align: 'start', sideOffset: 6, onOpenAutoFocus: (e: Event) => e.preventDefault(), onCloseAutoFocus: (e: Event) => e.preventDefault() }"
                    :ui="{ content: 'p-1 w-72 max-w-[calc(100vw-2rem)]' }"
                    @update:open="open => { if (!open) mention = null }"
                >
                    <template #content>
                        <div role="listbox" :aria-label="$t('app.chat.attachNote')" class="flex flex-col">
                            <UButton
                                v-for="(item, i) in mentionItems"
                                :key="item.value"
                                role="option"
                                :aria-selected="i === mentionIndex"
                                color="neutral"
                                variant="ghost"
                                size="sm"
                                icon="i-lucide-file-text"
                                :class="['w-full justify-start', i === mentionIndex && 'bg-elevated']"
                                @mousedown.prevent
                                @mouseenter="mentionIndex = i"
                                @click="pickMention(item.value)"
                            >
                                <span class="truncate">{{ item.label }}</span>
                                <span class="ms-auto truncate text-xs text-dimmed">{{ item.description }}</span>
                            </UButton>
                        </div>
                    </template>
                </UPopover>
            </div>
        </template>

        <div v-else class="flex-1 flex items-center justify-center p-4 text-sm text-muted text-center">
            <span v-if="loadError">{{ loadError }}</span>
            <UIcon v-else name="i-lucide-loader-circle" class="size-5 animate-spin"/>
        </div>
    </DefineBody>

    <!-- In a tab: the file viewers' header (gradient, centred breadcrumbs with the renamable title). -->
    <ViewerEditorLayoutWrapper
        v-if="!inSidePanel"
        v-model:file-name="titleDraft"
        scroll-mode="none"
        content-alignment="stretch"
        :show-status-bar="false"
        :top-spacing="false"
        :bottom-spacing="false"
        :cursor-text="false"
        :file-path="crumbPath"
        :renaming
        @on-rename="onRename"
    >
        <template #header-left>
            <UDropdownMenu v-if="current" :items="chatActions(current, 'tab')" :content="{ align: 'start' }" size="sm">
                <UButton class="text-muted" icon="i-lucide-ellipsis" size="xs" color="neutral" variant="ghost" :aria-label="$t('app.chat.actions')"/>
            </UDropdownMenu>
        </template>
        <template #header-right>
            <UTooltip :text="$t('app.chat.moveToSidePanel')">
                <UButton class="text-muted" icon="i-lucide-square-arrow-out-up-right" size="xs" color="neutral" variant="ghost" :aria-label="$t('app.chat.moveToSidePanel')" @click="showInSidePanel(chatId)"/>
            </UTooltip>
        </template>
        <div class="absolute inset-0 flex flex-col">
            <Body/>
        </div>
    </ViewerEditorLayoutWrapper>

    <div v-else class="flex flex-col h-full w-full min-h-0">
        <div class="flex items-center gap-1.5 px-3 h-10 shrink-0 border-b border-default">
            <UIcon name="i-lucide-message-square" class="size-4 text-muted shrink-0"/>
            <span class="truncate text-sm font-medium text-highlighted grow">{{ title }}</span>
            <UTooltip :text="$t('app.chat.openInTab')">
                <UButton icon="i-lucide-square-arrow-out-up-left" size="xs" color="neutral" variant="ghost" :aria-label="$t('app.chat.openInTab')" @click="openInTab(chatId)"/>
            </UTooltip>
        </div>
        <Body/>
    </div>
</template>
