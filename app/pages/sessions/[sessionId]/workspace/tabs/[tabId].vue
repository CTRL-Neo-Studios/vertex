<script setup lang="ts">
import type {TabProps} from "#shared/plugin/api";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {tabKinds} from "~/utils/contributions";
import {pluginSession} from "~/utils/plugins/runtime";

// Keyed by tab so switching tabs remounts the editor with fresh state.
definePageMeta({
    layout: 'session'
})

const {t} = useI18n()
const $route = useRoute()
const tabId = computed(() => $route.params.tabId as string)
const {getActiveTab} = useActiveTabs(useActiveSessions().getSession(computed(() => $route.params.sessionId as string)))
const kind = computed(() => getActiveTab(tabId.value)?.kind)
const def = computed(() => tabKinds.get(kind.value))
// Drawn once the session is handed to plugins (`pluginSession`), so the tab always gets it. It sits absolutely, so it
// fills the panel body without adding to its height (it'd grow past the window).
const tabProps = computed<TabProps | undefined>(() => {
    const session = pluginSession()
    return session && {session, id: tabId.value}
})
</script>

<template>
    <SessionTab v-if="!kind" :key="tabId"/>
    <div v-else class="absolute inset-0 flex flex-col">
        <template v-if="def">
            <PluginMount v-if="tabProps" :key="tabId" :ui="def" :props="tabProps"/>
        </template>
        <UEmpty v-else variant="naked" size="sm" icon="i-lucide-square-dashed" class="h-full" :title="t('app.panels.viewMissing')"/>
    </div>
</template>
