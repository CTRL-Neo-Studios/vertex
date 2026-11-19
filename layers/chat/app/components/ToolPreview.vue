<script setup lang="ts">
import {getToolName, type DynamicToolUIPart, type ToolUIPart} from "ai";
import {PluginMount} from "~/plugin/ui";
import {chatContext, chatSession} from "../plugin";
import {useChats} from "../lib/chats";
import {pluginTools} from "../lib/tools";

/**
 * What a call waiting for approval will change: a plugin tool's `preview` (else its input, field by field), or a real
 * `runWorkflow`'s quiet dry run, drawn by the workflows plugin (`Ops`). Other tools show theirs in the row.
 */
const props = defineProps<{ part: ToolUIPart | DynamicToolUIPart }>()

const session = chatSession()!
const {previewWorkflow} = useChats(session)
const name = computed(() => getToolName(props.part))
const input = computed(() => (props.part.input ?? {}) as Record<string, unknown>)
const plugin = computed(() => pluginTools.get(name.value))
const previewProps = computed(() => ({input: props.part.input, session}))
const fields = computed(() => Object.entries(input.value).map(([key, value]) => ({key, value: typeof value === 'string' ? value : JSON.stringify(value)})))

const Ops = chatContext().use('workflows')?.Ops
const workflow = shallowRef<Awaited<ReturnType<typeof previewWorkflow>>>()
const workflowCall = computed(() => name.value === 'runWorkflow' && !input.value.dryRun
    ? JSON.stringify([input.value.path, input.value.note]) : undefined)
watch(workflowCall, async (call) => {
	workflow.value = undefined
	if (!call) return
	const [path, note] = JSON.parse(call) as [unknown, unknown]
	const found = await previewWorkflow(String(path ?? ''), typeof note === 'string' ? note : undefined)
	if (workflowCall.value === call) workflow.value = found
}, {immediate: true})
</script>

<template>
	<PluginMount v-if="plugin?.def.preview" :ui="plugin.def.preview" :props="previewProps" :owner="plugin.plugin.name"
	             class="w-full"/>
	<dl v-else-if="plugin && fields.length" class="w-full grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
		<template v-for="field in fields" :key="field.key">
			<dt class="text-muted">{{ field.key }}</dt>
			<dd class="min-w-0 break-words whitespace-pre-wrap">{{ field.value }}</dd>
		</template>
	</dl>
	<div v-else-if="workflowCall" class="w-full text-xs" data-chat-workflow-preview>
		<p v-if="!workflow" class="text-muted">{{ $t('plugins.chat.tools.preview.loading') }}</p>
		<p v-else-if="workflow.missing" class="text-muted">{{ $t('plugins.chat.tools.preview.workflowMissing') }}</p>
		<p v-else-if="workflow.error" class="text-error break-words">{{ workflow.error }}</p>
		<p v-else-if="!workflow.outcome" class="text-muted">{{ $t('plugins.chat.tools.preview.workflowAsks') }}</p>
		<template v-else>
			<p v-if="workflow.outcome.result.fault" class="text-warning break-words">
				{{ $t('plugins.chat.tools.preview.workflowFault', {message: workflow.outcome.result.fault.message}) }}
			</p>
			<p v-if="!workflow.outcome.ops.length" class="text-muted">{{ $t('plugins.chat.tools.preview.nothing') }}</p>
			<div v-else class="max-h-60 overflow-y-auto">
				<component :is="Ops" :ops="workflow.outcome.ops"/>
			</div>
		</template>
	</div>
</template>
