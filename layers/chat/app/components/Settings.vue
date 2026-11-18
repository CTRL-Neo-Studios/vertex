<script setup lang="ts">
import {writeText} from "@tauri-apps/plugin-clipboard-manager";
import type {SettingsPageProps} from "#shared/plugin/api";
import {SettingsRow, SettingsScrollLayout, SettingsSection} from "~/plugin/ui";
import {chatContext} from "../plugin";
import {feedbackIssue, type ChatGlobalData, type FeedbackEntry} from "../lib/feedback";
import {useNotify} from "../lib/notify";

/**
 * Settings → Chat: the tool feedback the chat's models reported (`toolFeedback`), kept on this computer only, newest
 * first; the user copies an entry as a GitHub issue, or removes it. Settings draws Chat's options above it.
 */
defineProps<SettingsPageProps>()
const {t, locale} = useI18n()
const $qt = useNotify()
const store = chatContext().data.global

const data = ref<ChatGlobalData>({})
const entries = computed(() => data.value.feedback ?? [])
const confirming = ref(false)
onMounted(async () => {
    data.value = (await store.get() ?? {}) as ChatGlobalData
})
onScopeDispose(store.onChange(value => {
    data.value = (value ?? {}) as ChatGlobalData
}))

async function save(feedback: FeedbackEntry[]) {
    try {
        await store.set({...(await store.get() ?? {}) as ChatGlobalData, feedback})
    } catch (error) {
        $qt.error(t('plugins.chat.actionFailed'), String(error))
    }
}
const remove = (entry: FeedbackEntry) => save(entries.value.filter(e => e !== entry))
async function clear() {
    confirming.value = false
    await save([])
}

async function copyIssue(entry: FeedbackEntry) {
    const {title, body} = feedbackIssue(entry)
    try {
        await writeText(`# ${title}\n\n${body}`)
        $qt.success(t('plugins.chat.settings.feedback.copied'))
    } catch (error) {
        $qt.error(t('plugins.chat.actionFailed'), String(error))
    }
}

const KIND_COLORS = {missing: 'info', bug: 'error', confusing: 'warning'} as const
const when = (at: number) => new Date(at).toLocaleString(locale.value)
</script>

<!-- settings-index: /settings/chat -->
<template>
    <SettingsScrollLayout :title="t('plugins.chat.settings.nav')">
        <div class="space-y-4">
            <SettingsSection
                :title="t('plugins.chat.settings.feedback.title')"
                :description="t('plugins.chat.settings.feedback.description')"
                :info="t('plugins.chat.settings.feedback.info')"
                :empty="entries.length ? undefined : t('plugins.chat.settings.feedback.empty')"
            >
                <template #actions>
                    <template v-if="entries.length">
                        <template v-if="confirming">
                            <span class="text-xs text-muted">{{ t('plugins.chat.settings.feedback.clearConfirm', {count: entries.length}) }}</span>
                            <UButton size="xs" color="error" :label="t('plugins.chat.settings.feedback.clear')" @click="clear"/>
                            <UButton size="xs" color="neutral" variant="ghost" :label="t('plugins.chat.settings.feedback.cancel')" @click="confirming = false"/>
                        </template>
                        <UButton v-else size="xs" color="error" variant="ghost" icon="i-lucide-trash-2"
                                 :label="t('plugins.chat.settings.feedback.clear')" @click="confirming = true"/>
                    </template>
                </template>
                <SettingsRow v-for="entry in entries" :key="`${entry.at}-${entry.chatId}-${entry.summary}`" stacked>
                    <details class="group">
                    <summary class="flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-muted transition-transform group-open:rotate-90"/>
                        <UBadge size="sm" variant="subtle" :color="KIND_COLORS[entry.kind] ?? 'neutral'"
                                :label="t(`plugins.chat.settings.feedback.kinds.${entry.kind}`)"/>
                        <code v-if="entry.tool" class="text-xs text-muted">{{ entry.tool }}</code>
                        <span class="flex-1 min-w-0 truncate text-sm text-default">{{ entry.summary }}</span>
                        <span class="text-xs text-muted shrink-0">{{ when(entry.at) }}</span>
                    </summary>
                    <div class="mt-2 ps-6 space-y-2">
                        <p class="text-sm whitespace-pre-wrap break-words">{{ entry.details }}</p>
                        <p class="text-xs text-muted">{{ t('plugins.chat.settings.feedback.model', {model: entry.model}) }}</p>
                        <div class="flex gap-1">
                            <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-clipboard-copy"
                                     :label="t('plugins.chat.settings.feedback.copyIssue')" @click="copyIssue(entry)"/>
                            <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2"
                                     :label="t('plugins.chat.settings.feedback.remove')" @click="remove(entry)"/>
                        </div>
                    </div>
                    </details>
                </SettingsRow>
            </SettingsSection>
        </div>
    </SettingsScrollLayout>
</template>
