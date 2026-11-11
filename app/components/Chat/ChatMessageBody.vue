<script setup lang="ts">
import type {Chat} from "@ai-sdk/vue";
import {getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart} from "ai";
import type {VertexChatMessage} from "#shared/types/app/chats";
import {convertFileSrc} from "@tauri-apps/api/core";
import {fileNameFromPath, getFileExtensionFromPath, isImage} from "#shared/utils/fs/filenames";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {ASK_USER, hostnameOf, type AskUserOutput} from "~/utils/chatTools";
import ChatMarkdown from "~/components/Chat/ChatMarkdown.vue";
import ChatLink from "~/components/Chat/ChatLink.vue";
import ChatChanges from "~/components/Chat/ChatChanges.vue";
import ChatQuestions from "~/components/Chat/ChatQuestions.vue";

/**
 * One message's content: attached notes, text, reasoning, tool calls (with their questions and approvals) and staged
 * changes. Its own component, so a streamed chunk (a new object for the last message only) re-renders that message,
 * not every message in the chat.
 */
const props = defineProps<{ chatId: string, chat: Chat<VertexChatMessage>, message: VertexChatMessage, streaming: boolean, busy: boolean }>()

const {t, te} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const {allowHost, root} = useChats(useActiveSessions().getSession(computed(() => $route.params.sessionId as string)))
/** An attached image shows as itself (from disk, by the asset protocol), not as a name. */
const imageSrc = (note: string) => root.value && isImage(getFileExtensionFromPath(note)) ? convertFileSrc(`${root.value}/${note}`) : undefined

const refName = (ref: string) => ref.endsWith('/') ? ref.slice(0, -1).split('/').at(-1)! : fileNameFromPath(ref, true)

async function act(run: () => Promise<unknown>) {
	try {
		await run()
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e)
		$qt.error(t('app.chat.actionFailed'), te(message) ? t(message) : message)
	}
}

// Tool calls in a reply, as UChatTool rows: what ran (and on what), how it ended, and its raw result when opened.
type ToolPart = ToolUIPart | DynamicToolUIPart
const TOOL_ICONS: Record<string, string> = {
	findTools: 'i-lucide-search',
	searchNotes: 'i-lucide-file-search',
	readNote: 'i-lucide-file-text',
	openInEditorTab: 'i-lucide-square-arrow-out-up-right',
	fetchUrl: 'i-lucide-globe',
	findFiles: 'i-lucide-folder-search',
	// Chats from before findFiles, and from before readNote read the open note.
	listNotes: 'i-lucide-list-tree',
	readDocument: 'i-lucide-file-text',
	readSelection: 'i-lucide-text-select',
	proposeEdit: 'i-lucide-file-pen-line',
	proposeInsert: 'i-lucide-file-plus',
	createNote: 'i-lucide-file-plus-2',
	writeNote: 'i-lucide-file-pen',
	editNote: 'i-lucide-file-pen-line',
	runWorkflow: 'i-lucide-workflow',
	bash: 'i-lucide-square-terminal',
}
const TOOL_DETAIL_CHARS = 4000

function toolView(part: ToolPart) {
	const name = getToolName(part)
	const input = (part.input ?? {}) as { query?: string, path?: string, folder?: string, url?: string, command?: string }
	const output = part.state === 'output-available' ? part.output as {
		status?: string,
		error?: string,
		declined?: boolean,
		// The AI SDK's tools (fetchUrl) answer failures as `{type: 'error', message}`.
		type?: string
	} | undefined : undefined
	const pending = part.state === 'input-streaming' || part.state === 'input-available'
	const suffix = part.state === 'output-error' || output?.error || output?.type === 'error' ? t('app.chat.tools.failed')
		: part.state === 'output-denied' || output?.declined ? t('app.chat.tools.declined')
			: output?.status === 'accepted' || output?.status === 'rejected' ? t(`app.chat.tools.${output.status}`)
				: part.state === 'approval-requested' ? t(name === 'fetchUrl' ? 'app.chat.tools.asksToFetch' : 'app.chat.tools.asksToRun')
					: pending && (name === 'proposeEdit' || name === 'proposeInsert') ? t('app.chat.tools.waiting')
						: input.query ?? input.path ?? input.folder ?? input.url ?? input.command
	return {
		text: te(`app.chat.tools.names.${name}`) ? t(`app.chat.tools.names.${name}`) : name,
		suffix,
		icon: TOOL_ICONS[name] ?? 'i-lucide-wrench',
		streaming: pending
	}
}

type ShellOutput = { stdout?: string, stderr?: string, exitCode?: number }

/** A `bash` call's result as a terminal shows it: the command, its output and exit code, then what it staged. */
function shellDetail(part: ToolPart, output: ShellOutput) {
	const input = part.input as { command?: string } | undefined
	const {stdout, stderr, exitCode, ...staging} = output
	const rest = Object.keys(staging).length ? JSON.stringify(staging, null, 2) : ''
	return [`$ ${input?.command ?? ''}`, stdout, stderr, t('app.chat.tools.exitCode', {code: exitCode}), rest].filter(Boolean).join('\n')
}

/** Whether a call has a result to show; known from its state, so a closed card never serializes its output. */
const hasDetail = (part: ToolPart) => part.state === 'output-error' || (part.state === 'output-available' && part.output !== undefined)

function toolDetail(part: ToolPart) {
	const output = part.state === 'output-available' ? part.output as ShellOutput | undefined : undefined
	const text = part.state === 'output-error' ? part.errorText
		: getToolName(part) === 'bash' && typeof output?.exitCode === 'number' ? shellDetail(part, output)
			: part.state === 'output-available' ? JSON.stringify(part.output, null, 2) ?? '' : ''
	return text.length > TOOL_DETAIL_CHARS ? `${text.slice(0, TOOL_DETAIL_CHARS)}…` : text
}

/** An `askUser` call the card shows: asked (the model's input is complete) or answered. */
const isQuestion = (part: ToolPart) => getToolName(part) === ASK_USER && (part.state === 'input-available' || part.state === 'output-available')
const answerQuestion = (part: ToolPart, output: AskUserOutput) => props.chat.addToolOutput({tool: ASK_USER, toolCallId: part.toolCallId, output})
const approveRun = (id: string, approved: boolean) => props.chat.addToolApprovalResponse({id, approved})
/** The URL a `fetchUrl` call asks for. */
const fetchTarget = (part: ToolPart) => (part.input as { url?: string } | undefined)?.url ?? ''
const fetchSite = (part: ToolPart) => hostnameOf(fetchTarget(part))
/** A fetch's approval with "always for this site": the site is saved to the chat first, so later fetches don't ask. */
async function allowSite(part: ToolPart, id: string) {
	await act(() => allowHost(props.chatId, fetchSite(part)))
	approveRun(id, true)
}
</script>

<template>
	<div
		v-if="message.role === 'user' && (message.metadata?.notes?.length || message.metadata?.folders?.length)"
		class="flex flex-wrap gap-1 mb-1.5">
		<ChatLink v-for="note in message.metadata?.notes ?? []" :key="note" :note>
			<img v-if="imageSrc(note)" :src="imageSrc(note)" :alt="fileNameFromPath(note)" :title="note"
			     class="h-20 max-w-40 rounded-md border border-default object-cover">
			<UBadge v-else icon="i-lucide-file-text" size="sm" color="neutral" variant="outline"
			        :label="fileNameFromPath(note, true)"/>
		</ChatLink>
		<UBadge v-for="folder in message.metadata?.folders ?? []" :key="`${folder}/`"
		        icon="i-lucide-folder" size="sm" color="neutral" variant="outline"
		        :label="refName(`${folder}/`)" :title="folder"/>
	</div>
	<template v-for="(part, index) in message.parts" :key="`${message.id}-${index}`">
		<UChatReasoning v-if="part.type === 'reasoning'" :text="part.text"
		                :streaming="part.state === 'streaming'"/>
		<ChatMarkdown v-else-if="part.type === 'text'" :value="part.text" :streaming/>
		<template v-else-if="isToolUIPart(part)">
			<ChatQuestions v-if="isQuestion(part)" :part :disabled="busy"
			               @answer="output => answerQuestion(part, output)"/>
			<template v-else>
				<!-- Closed cards unmount their body, so a result is serialized only while it's shown. -->
				<UChatTool v-bind="toolView(part)" :disabled="!hasDetail(part)" unmount-on-hide class="my-1">
					<pre
						class="text-xs text-muted whitespace-pre-wrap break-words max-h-60 overflow-y-auto">{{
							toolDetail(part)
						}}</pre>
				</UChatTool>
				<div v-if="part.state === 'approval-requested' && getToolName(part) === 'fetchUrl'" class="flex flex-wrap gap-1 mb-2">
					<p class="w-full text-xs text-muted break-all">{{ fetchTarget(part) }}</p>
					<UButton size="xs" icon="i-lucide-globe" :label="$t('app.chat.tools.fetch')"
					         @click="approveRun(part.approval.id, true)"/>
					<UButton v-if="fetchSite(part)" size="xs" color="neutral" variant="outline"
					         :label="$t('app.chat.tools.allowSite', { host: fetchSite(part) })"
					         @click="allowSite(part, part.approval.id)"/>
					<UButton size="xs" color="neutral" variant="ghost" :label="$t('app.chat.tools.dontFetch')"
					         @click="approveRun(part.approval.id, false)"/>
				</div>
				<div v-else-if="part.state === 'approval-requested'" class="flex gap-1 mb-2">
					<UButton size="xs" icon="i-lucide-play" :label="$t('app.chat.tools.run')"
					         @click="approveRun(part.approval.id, true)"/>
					<UButton size="xs" color="neutral" variant="ghost" :label="$t('app.chat.tools.dontRun')"
					         @click="approveRun(part.approval.id, false)"/>
				</div>
			</template>
		</template>
	</template>
	<ChatChanges v-if="message.metadata?.changes?.length" :chat-id="chatId" :message :busy/>
</template>
