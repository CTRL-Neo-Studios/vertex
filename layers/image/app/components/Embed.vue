<script setup lang="ts">
import type {InternalLink} from "@type32/codemirror-rich-obsidian-editor"
// The editor's embed props it doesn't use (`filePath`, `host`…) aren't attributes.
defineOptions({inheritAttrs: false})
defineProps<{
    assetUrl: string;
    /** After `|` in `![[pic.png|…]]`. */
    display?: string;
    /** The link the editor resolved (`name` is the file's: `pic.png`). */
    linkData?: InternalLink
}>();
</script>

<template>
    <div class="p-3 flex flex-col items-center justify-center">
        <img @error="(e) => console.log('failed to load image', e)" :src="assetUrl" class="h-auto min-h-12 max-h-96 object-contain rounded-lg" :alt="display || linkData?.name"/>
        <div class="text-muted text-left text-xs select-none pt-1.5 text-pretty">{{ linkData?.name || display }}</div>
    </div>
</template>
