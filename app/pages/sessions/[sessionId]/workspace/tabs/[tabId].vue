<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import ChatView from "~/components/Chat/ChatView.vue";

// Keyed by tab so switching tabs remounts the editor with fresh state.
definePageMeta({
    layout: 'session'
})

const $route = useRoute()
const tabId = computed(() => $route.params.tabId as string)
const {getActiveTab} = useActiveTabs(useActiveSessions().getSession(computed(() => $route.params.sessionId as string)))
</script>

<template>
    <div v-if="getActiveTab(tabId)?.kind === 'chat'" class="absolute inset-0 flex flex-col">
        <!-- Absolute, so the chat fills the panel body without adding to its height (it would grow past the window). -->
        <ChatView :key="tabId" :chat-id="tabId"/>
    </div>
    <SessionTab v-else :key="tabId"/>
</template>
