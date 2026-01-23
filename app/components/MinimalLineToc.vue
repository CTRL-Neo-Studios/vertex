<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useActiveEditorContent} from "~/composables/active/useActiveEditorContent";
import type {TocEntry} from "#codemirror-rich-obsidian-editor/editor-types";

const props = withDefaults(defineProps<{
    alignment?: 'left' | 'right'
}>(), {
    alignment: 'right'
})

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
            <div :class="['w-full flex flex-col justify-center', props.alignment == 'right' ? 'items-end' : 'items-start']">
                <UTooltip :delay-duration="100" :text="`${item.text}`" v-for="(item, index) in toc" :key="index">
                    <div :style="`--lineLevelWidth: ${(maxLevel - item.level + 1) * 0.5}rem`" :class="[`w-full h-fit p-2 select-none group cursor-pointer flex items-center`, props.alignment == 'right' ? 'justify-end' : 'justify-start']" @click="() => emit('to-toc', item)">
                        <div class="w-(--lineLevelWidth) h-0.5 bg-accented/75 group-hover:bg-primary group-hover:scale-105 transition rounded-lg"/>
                    </div>
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>