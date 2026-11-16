<script setup lang="ts">
import type {StatusItemProps} from "#shared/plugin/api";
import {jumpTo, outlineOf} from "../lib/outline";

/**
 * The note's headings as lines beside it (the outline's `side` status item); a click jumps to one, as the outline view
 * does. Its other props (`text`, `filePath`) aren't attributes.
 */
defineOptions({inheritAttrs: false})
const props = withDefaults(defineProps<Pick<StatusItemProps, 'fileId' | 'session'> & {
    alignment?: 'left' | 'right'
}>(), {
    alignment: 'right'
})

const view = computed(() => props.session.editor.viewOf(props.fileId))
const headings = computed(() => (view.value && outlineOf(view.value).value.headings) ?? [])
const active = computed(() => view.value && outlineOf(view.value).value.active)
const maxLevel = computed(() => Math.max(0, ...headings.value.map(i => i.level)))
</script>

<template>
    <div class="w-fit h-fit" v-if="view && headings.length <= 20">
        <div :class="['w-full flex flex-col justify-center', props.alignment == 'right' ? 'items-end' : 'items-start']">
            <UTooltip :delay-duration="100" :text="`${item.text}`" v-for="(item, i) in headings" :key="i">
                <div :style="`--lineLevelWidth: ${(maxLevel - item.level + 1) * 0.5}rem`" :class="[`w-full h-fit p-2 select-none group cursor-pointer flex items-center`, props.alignment == 'right' ? 'justify-end' : 'justify-start']" @click="() => jumpTo(view!, item.from)">
                    <div :class="['w-(--lineLevelWidth) h-0.5 group-hover:bg-primary group-hover:scale-105 transition rounded-lg', item.from === active ? 'bg-primary' : 'bg-accented/75']"/>
                </div>
            </UTooltip>
        </div>
    </div>
</template>
