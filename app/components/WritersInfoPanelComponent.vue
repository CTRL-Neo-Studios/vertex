<script setup lang="ts">
import nlp from "compromise";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {computed} from "vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorContent} from "~/composables/active/editor/useActiveEditorContent";

const $navi = useAppNavigator()
const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const {
    getSession
} = useActiveSessions()
const {
    openTab,
    getActiveTab
} = useActiveTabs(getSession($sessionId))
const {
    getFileByUuid
} = useActiveWorkspaceIndex(getSession($sessionId))
const { content } = useActiveEditorContent(getSession($sessionId), getActiveTab($tabId))

function compromiseInstance() {
    return nlp(unref(content))
}

async function openNewTab(uuid: string) {
    const tab = openTab(uuid)
    await $navi.toWorkspaceTab($sessionId, tab)
}

</script>

<template>
    <div class="w-full h-full">
        <template v-if="$tabId && $sessionId">
            <div class="w-full grid grid-cols-1">
                <UButton label="Analyze Text" block/>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>