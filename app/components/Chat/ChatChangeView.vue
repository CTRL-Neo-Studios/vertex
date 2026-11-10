<script setup lang="ts">
import type {Chat} from "@ai-sdk/vue";
import type {ChatChange, VertexChatMessage} from "#shared/types/app/chats";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {chatChangeOf} from "~/utils/chatChanges";
import TextDiff from "~/components/Diff/TextDiff.vue";

/**
 * A chat change's diff tab: what a Write-mode reply staged for one note, from the chat's own record (`ChatChange`:
 * the note's text before and the reply's after; never git). It follows the change as it's applied, discarded, undone or
 * found in conflict, and offers Apply / Discard while it's pending.
 */
const props = defineProps<{ tabId: string }>()

const {t} = useI18n()
const $route = useRoute()
const $navi = useAppNavigator()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const index = useActiveWorkspaceIndex(session)
const {openTab} = useActiveTabs(session)
const {liveChat, summary, applyChanges, discardChanges, showInSidePanel} = useChats(session)
const target = chatChangeOf(props.tabId)

const chat = shallowRef<Chat<VertexChatMessage>>()
const chatFailed = ref(false)
onMounted(async () => {
    if (!target) return
    try {
        chat.value = await liveChat(target.chatId)
    } catch {
        chatFailed.value = true
    }
})
const change = computed<ChatChange | undefined>(() => chat.value?.messages
    .find(m => m.id === target?.messageId)?.metadata?.changes?.find(c => c.path === target?.path))
/** A new note has no before side. */
const sides = computed(() => change.value && {before: change.value.before ?? undefined, after: change.value.after})
const busy = computed(() => chat.value?.status === 'submitted' || chat.value?.status === 'streaming')
const chatTitle = computed(() => (target && summary(target.chatId).value?.title) || t('app.chat.untitled'))
/** Instead of the diff: the chat couldn't load (a locked vault), or no longer has this change (deleted, rewound). */
const missing = computed(() => chatFailed.value ? t('app.chat.changes.chatFailed') : chat.value && !change.value ? t('app.chat.changes.gone') : '')

const path = target?.path ?? ''
const name = path.slice(path.lastIndexOf('/') + 1)
const dir = path.slice(0, Math.max(path.lastIndexOf('/'), 0))
const node = computed(() => (session?.rootPath ? index.getFileByPath(`${session.rootPath}/${path}`) : undefined))

const working = ref(false)
async function settle(apply: boolean) {
    if (!target) return
    working.value = true
    try {
        await (apply ? applyChanges : discardChanges)(target.chatId, target.messageId, [target.path])
        if (change.value?.state === 'conflict') $qt.warning(t('app.chat.changes.conflicts', {count: 1}), target.path)
    } catch (e) {
        $qt.error(t('app.chat.actionFailed'), e instanceof Error ? e.message : String(e))
    } finally {
        working.value = false
    }
}
async function openNote() {
    if (node.value && session) await $navi.toWorkspaceTab(session.uuid, openTab(node.value.uuid))
}
</script>

<template>
    <UEmpty v-if="missing" class="h-full" variant="naked" size="sm" icon="i-lucide-file-x" :title="missing"/>
    <TextDiff v-else :sides :failed="!target">
        <template #header="{added, removed, binary}">
            <div class="shrink-0 flex items-center gap-2 px-4 h-10 border-b border-default text-sm">
                <UIcon name="i-lucide-sparkles" class="size-4 shrink-0 text-muted"/>
                <span class="font-medium truncate shrink-0 max-w-1/3">{{ name }}</span>
                <span class="text-xs text-dimmed truncate">{{ dir }}</span>
                <UBadge v-if="change?.before === null" :label="t('app.chat.changes.new')" size="sm" color="neutral" variant="soft" class="shrink-0"/>
                <UTooltip v-if="change" :text="t('app.chat.changes.from', {chat: chatTitle})">
                    <UBadge
                        :label="t(`app.chat.changes.states.${change.state}`)"
                        size="sm"
                        :color="change.state === 'conflict' ? 'warning' : change.state === 'pending' ? 'primary' : 'neutral'"
                        variant="subtle"
                        class="shrink-0 max-w-64 truncate"
                    />
                </UTooltip>
                <div class="flex-1"/>
                <span v-if="change && !binary" class="shrink-0 flex items-center gap-2 text-xs tabular-nums">
                    <span class="text-success">+{{ added }}</span>
                    <span class="text-error">−{{ removed }}</span>
                </span>
                <template v-if="change?.state === 'pending'">
                    <UButton size="xs" color="neutral" variant="ghost" class="shrink-0" :label="t('app.chat.changes.discard')" :disabled="working || busy" @click="settle(false)"/>
                    <UButton size="xs" class="shrink-0" :label="t('app.chat.changes.apply', {count: 1})" :loading="working" :disabled="busy" @click="settle(true)"/>
                </template>
                <UButton v-if="node" size="xs" color="neutral" variant="ghost" icon="i-lucide-file-text" class="shrink-0" :label="t('app.chat.changes.openNote')" @click="openNote"/>
                <UButton v-if="target" size="xs" color="neutral" variant="ghost" icon="i-lucide-message-square" class="shrink-0" :label="t('app.chat.changes.openChat')" @click="showInSidePanel(target.chatId)"/>
            </div>
            <UAlert
                v-if="change?.state === 'conflict'"
                class="shrink-0 rounded-none"
                color="warning"
                variant="subtle"
                icon="i-lucide-triangle-alert"
                :description="t('app.chat.changes.conflictNote')"
            />
        </template>
    </TextDiff>
</template>
