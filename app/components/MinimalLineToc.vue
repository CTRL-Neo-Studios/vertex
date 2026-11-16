<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useTabOutline} from "~/composables/active/editor/useActiveEditorExtensions";
import {useActiveEditorDispatcher} from "~/composables/active/editor/useActiveEditorDispatcher";
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";

/**
 * The note's headings as lines beside it (the outline's `side` status item); a click jumps to one through the session's
 * editor dispatcher, as the outline view does. The status item's props (`text`, `filePath`) aren't attributes.
 */
defineOptions({inheritAttrs: false})
const props = withDefaults(defineProps<{
    alignment?: 'left' | 'right'
}>(), {
    alignment: 'right'
})

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const session = useActiveSessions().getSession($sessionId)
const {outline: toc, activeHeading} = useTabOutline(session, $tabId)
const {emitToTocEntry} = useActiveEditorDispatcher(session)
const toHeading = ({from}: Heading) => emitToTocEntry({from})
const maxLevel = computed(() => Math.max(0, ...toc.value.map(i => i.level)))

</script>

<template>
    <div class="w-fit h-fit" v-if="toc.length <= 20">
        <template v-if="$tabId && $sessionId">
            <div :class="['w-full flex flex-col justify-center', props.alignment == 'right' ? 'items-end' : 'items-start']">
                <UTooltip :delay-duration="100" :text="`${item.text}`" v-for="(item, i) in toc" :key="i">
                    <div :style="`--lineLevelWidth: ${(maxLevel - item.level + 1) * 0.5}rem`" :class="[`w-full h-fit p-2 select-none group cursor-pointer flex items-center`, props.alignment == 'right' ? 'justify-end' : 'justify-start']" @click="() => toHeading(item)">
                        <div :class="['w-(--lineLevelWidth) h-0.5 group-hover:bg-primary group-hover:scale-105 transition rounded-lg', item.from === activeHeading ? 'bg-primary' : 'bg-accented/75']"/>
                    </div>
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>
