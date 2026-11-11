<script setup lang="ts">
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useTabOutline} from "~/composables/active/editor/useActiveEditorExtensions";
import type {Heading} from "@type32/codemirror-rich-obsidian-editor/kit";

const props = withDefaults(defineProps<{
    alignment?: 'left' | 'right'
}>(), {
    alignment: 'right'
})

const $route = useRoute()
const $sessionId = computed<string>(() => $route.params.sessionId as string), $tabId = computed<string>(() => $route.params.tabId as string)
const {outline: toc, activeHeading} = useTabOutline(useActiveSessions().getSession($sessionId), $tabId)
const emit = defineEmits<{
    (e: 'to-toc', value: Heading): void
}>()
const maxLevel = computed(() => Math.max(0, ...toc.value.map(i => i.level)))

</script>

<template>
    <div class="w-fit h-fit" v-if="toc.length <= 20">
        <template v-if="$tabId && $sessionId">
            <div :class="['w-full flex flex-col justify-center', props.alignment == 'right' ? 'items-end' : 'items-start']">
                <UTooltip :delay-duration="100" :text="`${item.text}`" v-for="(item, i) in toc" :key="i">
                    <div :style="`--lineLevelWidth: ${(maxLevel - item.level + 1) * 0.5}rem`" :class="[`w-full h-fit p-2 select-none group cursor-pointer flex items-center`, props.alignment == 'right' ? 'justify-end' : 'justify-start']" @click="() => emit('to-toc', item)">
                        <div :class="['w-(--lineLevelWidth) h-0.5 group-hover:bg-primary group-hover:scale-105 transition rounded-lg', item.from === activeHeading ? 'bg-primary' : 'bg-accented/75']"/>
                    </div>
                </UTooltip>
            </div>
        </template>
    </div>
</template>

<style scoped>

</style>
