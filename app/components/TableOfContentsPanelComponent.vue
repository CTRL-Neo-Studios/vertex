<script setup lang="ts">
import nlp from "compromise";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {computed} from "vue";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorContent} from "~/composables/active/useActiveEditorContent";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

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
const {content} = useActiveEditorContent(getSession($sessionId), getActiveTab($tabId))
const $eu = useDocumentUtils()

// function compromiseInstance() {
//     return nlp(unref(content))
// }

const toc = computed(() => $eu.getTableOfContents(unref(content)))
const emit = defineEmits<{
    (e: 'to-toc', value: TocEntry): void
}>()

async function openNewTab(uuid: string) {
    const tab = openTab(uuid)
    await $navi.toWorkspaceTab($sessionId, tab)
}

</script>

<template>
    <div class="w-full h-full">
        <template v-if="$tabId && $sessionId">
            <div class="w-full grid grid-cols-1 gap-1.5">
                <UTooltip :text="`Jump to Level ${item.level} Content in Editor`" v-for="(item, index) in toc" :key="index">
                    <UButton variant="soft" color="neutral" size="sm" :label="item.text" :icon="`i-lucide-heading-${item.level}`" @click="() => emit('to-toc', item)"/>
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>