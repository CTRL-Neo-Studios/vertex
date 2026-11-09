<script setup lang="ts">
import ChatView from "~/components/Chat/ChatView.vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useChats} from "~/composables/ai/useChats";
import useQuickToasts from "~/composables/utility/useQuickToasts";
import {usePanelActions} from "~/utils/panelViews";

/** The Chat panel view: the side panel's chat, or a way to start one. */
const {t} = useI18n()
const $qt = useQuickToasts()
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const {sidePanelChatId, createChat, showInSidePanel} = useChats(session)

async function newSidePanelChat() {
    try {
        showInSidePanel((await createChat()).id)
    } catch (e) {
        $qt.error(t('app.chat.actionFailed'), e instanceof Error ? e.message : String(e))
    }
}

usePanelActions(() => [{id: 'newChat', label: t('app.chat.newChat'), icon: 'i-lucide-message-square-plus', onSelect: newSidePanelChat}])
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
        :title="t('app.chat.noSidePanelChat')"
        :actions="[{ label: t('app.chat.newChat'), icon: 'i-lucide-message-square-plus', size: 'sm', onClick: newSidePanelChat }]"
    />
</template>
