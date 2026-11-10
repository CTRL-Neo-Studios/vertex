<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import ChatView from "~/components/Chat/ChatView.vue";
import GitDiffView from "~/components/Git/GitDiffView.vue";
import ChatChangeView from "~/components/Chat/ChatChangeView.vue";
import {chatChangeOf} from "~/utils/chatChanges";
import PanelViewTab from "~/components/LayoutComponents/PanelViewTab.vue";

// Keyed by tab so switching tabs remounts the editor with fresh state.
definePageMeta({
    layout: 'session'
})

const $route = useRoute()
const tabId = computed(() => $route.params.tabId as string)
const {getActiveTab} = useActiveTabs(useActiveSessions().getSession(computed(() => $route.params.sessionId as string)))
// A chat, a diff or a view sits absolutely, so it fills the panel body without adding to its height (it'd grow past
// the window).
const kind = computed(() => getActiveTab(tabId.value)?.kind)
</script>

<template>
    <div v-if="kind === 'chat'" class="absolute inset-0 flex flex-col">
        <ChatView :key="tabId" :chat-id="tabId"/>
    </div>
    <div v-else-if="kind === 'diff'" class="absolute inset-0 flex flex-col">
        <!-- A diff tab is a chat's staged change or git's; its id says which. -->
        <ChatChangeView v-if="chatChangeOf(tabId)" :key="tabId" :tab-id="tabId"/>
        <GitDiffView v-else :key="tabId" :tab-id="tabId"/>
    </div>
    <div v-else-if="kind === 'view'" class="absolute inset-0 flex flex-col">
        <PanelViewTab :key="tabId" :view-id="tabId"/>
    </div>
    <SessionTab v-else :key="tabId"/>
</template>
