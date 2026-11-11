<script setup lang="ts">
import {diffCounts, lineDiff} from "#shared/utils/textDiff";
import type {ChatChange, VertexChatMessage} from "#shared/types/app/chats";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";

/**
 * A Write-mode reply's staged changes: one row per note (path, new or not, lines added/removed, what became of it),
 * the path opening its diff tab (`ChatChangeView`) beside the chat, and Apply/Discard for the picked pending ones.
 */
const props = defineProps<{ chatId: string, message: VertexChatMessage, busy?: boolean }>()

const {t} = useI18n()
const $route = useRoute()
const $qt = useQuickToasts()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {applyChanges, discardChanges, openChange} = useChats(session)

const changes = computed(() => props.message.metadata?.changes ?? [])
const pending = computed(() => changes.value.filter(c => c.state === 'pending').map(c => c.path))
/** Picked for Apply/Discard: every pending one until the user unticks some. */
const picked = ref<string[]>([])
watch(pending, paths => { picked.value = paths }, {immediate: true})
const open = (path: string) => void openChange(props.chatId, props.message.id, path)
const working = ref(false)

const STATE_ICONS: Record<ChatChange['state'], string> = {
    pending: 'i-lucide-circle-dashed',
    applied: 'i-lucide-check',
    discarded: 'i-lucide-x',
    conflict: 'i-lucide-triangle-alert',
    undone: 'i-lucide-undo-2',
}

// The diff tab's own counting (`lineDiff`: a missing final newline isn't a change), so the numbers match.
const counts = computed(() => new Map(changes.value.map(c => [c.path, diffCounts(lineDiff(c.before ?? '', c.after))])))

function toggle(path: string, on: boolean | 'indeterminate') {
    picked.value = on === true ? [...picked.value, path] : picked.value.filter(p => p !== path)
}

async function settle(apply: boolean) {
    const paths = picked.value
    working.value = true
    try {
        await (apply ? applyChanges : discardChanges)(props.chatId, props.message.id, paths)
        const conflicts = changes.value.filter(c => paths.includes(c.path) && c.state === 'conflict')
        if (conflicts.length) $qt.warning(t('app.chat.changes.conflicts', {count: conflicts.length}), conflicts.map(c => c.path).join(', '))
    } catch (e) {
        $qt.error(t('app.chat.actionFailed'), e instanceof Error ? e.message : String(e))
    } finally {
        working.value = false
    }
}
</script>

<template>
    <div class="my-2 rounded-md border border-default text-sm">
        <div class="flex items-center gap-2 px-3 py-2">
            <UIcon name="i-lucide-files" class="size-4 text-muted shrink-0"/>
            <span class="font-medium grow">{{ $t('app.chat.changes.title', { count: changes.length }) }}</span>
            <template v-if="pending.length">
                <UButton size="xs" color="neutral" variant="ghost" :label="$t('app.chat.changes.discard')" :disabled="!picked.length || working || busy" @click="settle(false)"/>
                <UButton size="xs" :label="$t('app.chat.changes.apply', { count: picked.length })" :loading="working" :disabled="!picked.length || busy" @click="settle(true)"/>
            </template>
        </div>
        <div v-for="change in changes" :key="change.path" class="border-t border-default">
            <div class="flex items-center gap-2 px-3 py-1.5">
                <UCheckbox
                    v-if="change.state === 'pending'"
                    :model-value="picked.includes(change.path)"
                    :aria-label="change.path"
                    @update:model-value="toggle(change.path, $event)"
                />
                <UTooltip v-else :text="$t(`app.chat.changes.states.${change.state}`)">
                    <UIcon :name="STATE_ICONS[change.state]" :class="['size-4 shrink-0', change.state === 'conflict' ? 'text-warning' : 'text-muted']"/>
                </UTooltip>
                <button
                    type="button"
                    class="grow min-w-0 truncate text-start hover:underline"
                    :title="`${change.path} · ${$t('app.chat.changes.open')}`"
                    @click="open(change.path)"
                >
                    {{ change.path }}
                </button>
                <UBadge v-if="change.before === null" size="sm" color="neutral" variant="soft" :label="$t('app.chat.changes.new')"/>
                <span class="text-xs tabular-nums text-success">+{{ counts.get(change.path)?.added }}</span>
                <span class="text-xs tabular-nums text-error">−{{ counts.get(change.path)?.removed }}</span>
            </div>
        </div>
    </div>
</template>
