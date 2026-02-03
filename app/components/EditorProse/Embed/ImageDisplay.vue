<script setup lang="ts">
import type {InternalLink} from "#codemirror-rich-obsidian-editor/editor-types"
const props = defineProps<{
    srcPath: string;
    display: string;
    linkData?: InternalLink
}>();
</script>

<template>
    <div class="p-3 flex flex-col items-center justify-center">
        <img @error="(e) => console.log('failed to load image', e)" :src="srcPath" class="h-auto min-h-12 max-h-96 object-contain rounded-lg" :alt="display"/>
        <div class="text-muted text-left text-xs select-none pt-1.5 text-pretty">{{ linkData?.name || display }}</div>
    </div>
</template>
