<script setup lang="ts">
import type {PanelViewProps} from "#shared/plugin/api";
import {useChats} from "../lib/chats";
import {useNotify} from "../lib/notify";

const props = defineProps<PanelViewProps>()

/** The Chat panel view: the side panel's chat, or a way to start one. */
const {t} = useI18n()
const $qt = useNotify()
const {sidePanelChatId, createChat, showInSidePanel} = useChats(props.session)

async function newSidePanelChat() {
    try {
        showInSidePanel((await createChat()).id)
    } catch (e) {
        $qt.error(t('plugins.chat.actionFailed'), e instanceof Error ? e.message : String(e))
    }
}

watchEffect(() => props.actions([{id: 'newChat', label: t('plugins.chat.newChat'), icon: 'i-lucide-message-square-plus', onSelect: newSidePanelChat}]))
</script>

<template>
    <!-- `min-h-0` with the chat's `h-full`, so the messages scroll inside the panel and the prompt stays at the bottom. -->
    <div v-if="sidePanelChatId" class="relative flex-1 min-h-0">
        <ChatView :key="sidePanelChatId" :chat-id="sidePanelChatId" in-side-panel/>
    </div>
    <UEmpty
        v-else
        class="my-auto"
        variant="naked"
        size="sm"
        icon="i-lucide-message-square"
        :title="t('plugins.chat.noSidePanelChat')"
        :actions="[{ label: t('plugins.chat.newChat'), icon: 'i-lucide-message-square-plus', size: 'sm', onClick: newSidePanelChat }]"
    />
</template>
