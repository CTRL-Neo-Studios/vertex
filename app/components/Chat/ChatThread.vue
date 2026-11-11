<script setup lang="ts">
import type {Chat} from "@ai-sdk/vue";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import {ask} from "@tauri-apps/plugin-dialog";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useSettingsScope} from "~/composables/app/useSettingsScope";
import {useChats} from "~/composables/ai/useChats";
import {useChatActions} from "~/composables/ai/useChatActions";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import ChatMessageBody from "~/components/Chat/ChatMessageBody.vue";

/**
 * A chat's messages with their actions (copy, edit, retry, rewind, branches, context). Apart from the prompt, so
 * typing doesn't re-render the conversation.
 *
 * Only the latest messages mount (`WINDOW`, then **Show earlier** adds as many). This is the view only: the chat
 * state, what the model is sent, branches, undo and the context window all use every message. The window is where it
 * starts, not "the last N": new messages and replies extend it, and anything acted on (edit, retry, a branch switch)
 * stays in view however long the branch after it is. Reopening the chat starts at the latest again.
 */
const props = defineProps<{ chatId: string, chat: Chat<VertexChatMessage>, inSidePanel?: boolean }>()

const {t, te} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {summary, editMessage, retryMessage, rewindTo, appliedAfter, showBranch, branchesOf} = useChats(session)
const {showContext} = useChatActions(session)
const settings = useSettingsScope().effective
const current = computed(() => summary(props.chatId).value)

const WINDOW = 50
const start = ref(Math.max(0, props.chat.messages.length - WINDOW))
/** The first message shown: never past the last `WINDOW`, so a rewind or a shorter branch still fills the view. */
const from = computed(() => Math.min(start.value, Math.max(0, props.chat.messages.length - WINDOW)))
const shown = computed(() => (from.value ? props.chat.messages.slice(from.value) : props.chat.messages))

const root = useTemplateRef<HTMLElement>('root')
/**
 * Mounts the previous `WINDOW` above, keeping what's on screen where it was: the message that was first stays put
 * while the earlier ones render (their markdown lays out after this tick, so it's held for a moment).
 */
async function showEarlier() {
	const scroller = root.value?.parentElement
	const anchor = root.value?.querySelector('article')
	const top = anchor?.getBoundingClientRect().top ?? 0
	start.value = Math.max(0, from.value - WINDOW)
	await nextTick()
	if (!scroller || !anchor || !root.value) return
	const keep = () => {
		scroller.scrollTop += anchor.getBoundingClientRect().top - top
	}
	keep()
	const observer = new ResizeObserver(keep)
	observer.observe(root.value)
	setTimeout(() => observer.disconnect(), 1000)
}

const lastId = computed(() => props.chat.messages.at(-1)?.id)
const busy = computed(() => props.chat.status === 'submitted' || props.chat.status === 'streaming')
const isStreaming = (message: VertexChatMessage) => props.chat.status === 'streaming' && message.id === lastId.value

function errorText(e: unknown) {
	const message = e instanceof Error ? e.message : String(e)
	return te(message) ? t(message) : message
}

async function act(run: () => Promise<unknown>) {
	try {
		await run()
	} catch (e) {
		$qt.error(t('app.chat.actionFailed'), errorText(e))
	}
}

// Message actions (none while a reply is being written): Copy; Edit on the user's, Retry (or with another model) and
// Rewind on replies; a branch switcher where an edit or a retry forked the conversation.
const textOf = (message: VertexChatMessage) => message.parts.flatMap(p => p.type === 'text' ? [p.text] : []).join('\n\n')
/** The branch shown at each message that starts a fork, as a list of one (for `v-for` to name it). */
const branches = computed(() => Object.fromEntries(Object.entries(branchesOf(props.chatId)).map(([id, branch]) => [id, [branch]])))
const editing = ref<{ id: string, text: string } | null>(null)

async function copyMessage(message: VertexChatMessage) {
	await writeText(textOf(message))
	$qt.success(t('app.chat.copied'))
}

function sendEdit() {
	const draft = editing.value
	const text = draft?.text.trim()
	if (!draft || !text) return
	editing.value = null
	void act(() => editMessage(props.chatId, draft.id, text))
}

const retryItems = (message: VertexChatMessage) => [
	{type: 'label' as const, label: t('app.chat.retryWith')},
	...(settings.value?.aiConfig.modelProfiles ?? []).map(p => ({
		label: p.name,
		icon: 'i-lucide-bot',
		onSelect: () => act(() => retryMessage(props.chatId, message.id, p.id)),
	})),
]

async function rewind(message: VertexChatMessage) {
	const messages = props.chat.messages
	const count = messages.length - 1 - messages.findIndex(m => m.id === message.id)
	// Rewinding also undoes what the dropped replies changed in notes: say which before asking.
	const applied = appliedAfter(props.chatId, message.id).map(c => c.path)
	const description = t('app.chat.rewind.description', {count}) + (applied.length ? `\n\n${t('app.chat.rewind.undo', {paths: applied.join(', ')})}` : '')
	const confirmed = await ask(description, {
		title: t('app.chat.rewind.title'),
		kind: 'warning',
		okLabel: t('app.chat.rewind.confirm'),
		cancelLabel: t('app.generic.cancel'),
	})
	if (!confirmed) return
	await act(async () => {
		const {undone, skipped} = await rewindTo(props.chatId, message.id)
		if (undone.length) $qt.success(t('app.chat.rewind.undone', {count: undone.length}))
		if (skipped.length) $qt.warning(t('app.chat.rewind.skipped', {count: skipped.length}), skipped.join(', '))
	})
}
</script>

<template>
	<div ref="root" :class="['mx-auto w-full py-4', inSidePanel ? 'px-2' : 'px-4 max-w-3xl']">
		<div v-if="from > 0" class="flex justify-center pb-4">
			<UButton size="xs" color="neutral" variant="soft" icon="i-lucide-chevrons-up"
			         :label="$t('app.chat.showEarlier', { count: Math.min(WINDOW, from) })" data-chat-earlier
			         @click="showEarlier"/>
		</div>
		<UChatMessages :messages="shown" :status="chat.status" should-auto-scroll>
			<template #indicator>
				<UChatShimmer :text="$t('app.chat.thinking')" class="text-sm"/>
			</template>
			<template #content="{ message }">
				<div v-if="editing?.id === message.id" class="flex flex-col gap-2 min-w-64">
					<UTextarea
						v-model="editing.text"
						autoresize
						autofocus
						:rows="1"
						variant="none"
						:ui="{ base: 'p-0' }"
						@keydown.enter.exact.prevent="sendEdit"
						@keydown.esc.prevent="editing = null"
					/>
					<div class="flex justify-end gap-1">
						<UButton size="xs" color="neutral" variant="ghost" :label="$t('app.generic.cancel')"
						         @click="editing = null"/>
						<UButton size="xs" :label="$t('app.chat.send')" :disabled="!editing.text.trim()"
						         @click="sendEdit"/>
					</div>
				</div>
				<ChatMessageBody v-else :chat-id="chatId" :chat :message :streaming="isStreaming(message)" :busy/>
			</template>
			<template #actions="{ message }">
				<div v-if="!busy && editing?.id !== message.id" class="flex items-center">
					<template v-for="branch in branches[message.id]" :key="branch.index">
						<UButton icon="i-lucide-chevron-left" size="sm" color="neutral" variant="ghost"
						         :aria-label="$t('app.chat.branch.previous')" :disabled="branch.index === 0"
						         @click="act(() => showBranch(chatId, message.id, branch.index - 1))"/>
						<span class="text-xs text-muted tabular-nums">{{ branch.index + 1 }}/{{
								branch.count
							}}</span>
						<UButton icon="i-lucide-chevron-right" size="sm" color="neutral" variant="ghost"
						         :aria-label="$t('app.chat.branch.next')"
						         :disabled="branch.index === branch.count - 1"
						         @click="act(() => showBranch(chatId, message.id, branch.index + 1))"/>
					</template>
					<UTooltip :text="$t('app.chat.copy')">
						<UButton icon="i-lucide-copy" size="sm" color="neutral" variant="ghost"
						         :aria-label="$t('app.chat.copy')" @click="copyMessage(message)"/>
					</UTooltip>
					<UTooltip v-if="message.role === 'user'" :text="$t('app.chat.edit')">
						<UButton icon="i-lucide-pencil" size="sm" color="neutral" variant="ghost"
						         :aria-label="$t('app.chat.edit')"
						         @click="editing = { id: message.id, text: textOf(message) }"/>
					</UTooltip>
					<template v-else>
						<UTooltip :text="$t('app.chat.retry')">
							<UButton icon="i-lucide-refresh-cw" size="sm" color="neutral" variant="ghost"
							         :aria-label="$t('app.chat.retry')"
							         @click="act(() => retryMessage(chatId, message.id))"/>
						</UTooltip>
						<UDropdownMenu :items="retryItems(message)" size="sm" :content="{ align: 'start' }">
							<UButton icon="i-lucide-chevron-down" size="xs" color="neutral" variant="ghost"
							         class="-ms-1" :aria-label="$t('app.chat.retryWith')"/>
						</UDropdownMenu>
						<UTooltip v-if="message.id !== lastId" :text="$t('app.chat.rewind.action')">
							<UButton icon="i-lucide-history" size="sm" color="neutral" variant="ghost"
							         :aria-label="$t('app.chat.rewind.action')" @click="rewind(message)"/>
						</UTooltip>
					</template>
					<UTooltip :text="$t('app.chat.context.info')">
						<UButton icon="i-lucide-info" size="sm" color="neutral" variant="ghost"
						         :aria-label="$t('app.chat.context.info')"
						         @click="current && showContext(current, message.id)"/>
					</UTooltip>
				</div>
			</template>
		</UChatMessages>
	</div>
</template>
