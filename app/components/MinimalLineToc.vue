<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorContent} from "~/composables/active/useActiveEditorContent";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const {
    getSession
} = useActiveSessions()
const {
    getActiveTab
} = useActiveTabs(getSession($sessionId))
const {
} = useActiveWorkspaceIndex(getSession($sessionId))
const {content} = useActiveEditorContent(getSession($sessionId), getActiveTab($tabId))
const $eu = useDocumentUtils()

const toc = computed(() => $eu.getTableOfContents(unref(content)))
const emit = defineEmits<{
    (e: 'to-toc', value: TocEntry): void
}>()
const maxLevel = computed(() => {
    let max = 0
    unref(toc).forEach(i => {
        max = max > i.level ? max : i.level
    })

    return max
})

</script>

<template>
    <div class="w-fit h-fit">
        <template v-if="$tabId && $sessionId">
            <div class="w-full flex flex-col justify-center items-end gap-4">
                <UTooltip :text="`Jump to Level ${item.level} Content in Editor`" v-for="(item, index) in toc" :key="index">
                    <div :class="`w-${(maxLevel - item.level + 1) * 4} h-1 bg-accented hover:bg-primary hover:scale-105 hover:cursor-pointer transition rounded-lg select-none`" @click="() => emit('to-toc', item)"/>
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>