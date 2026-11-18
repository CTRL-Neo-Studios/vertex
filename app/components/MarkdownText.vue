<script setup lang="ts">
import {Markdown} from "@comark/vue";
import type {MarkdownProps} from "#shared/plugin/components";
import {MARKDOWN_IMAGES, strangerMarkdown} from "~/utils/markdown";
import MarkdownLink from "./MarkdownText/Link.vue";
import MarkdownImage from "./MarkdownText/Image.vue";

/**
 * Someone else's Markdown (`MarkdownProps`; a plugin's README), parsed as `strangerMarkdown` and drawn with Nuxt UI's
 * prose; links and images are `MarkdownText/`'s. Published to plugins as `Markdown`.
 */
const props = defineProps<MarkdownProps>()
provide(MARKDOWN_IMAGES, {remote: ref(false), asset: path => props.assetUrl?.(path)})
const components = {a: MarkdownLink, img: MarkdownImage}
const plugins = [...strangerMarkdown.plugins]
</script>

<template>
    <Suspense>
        <Markdown :value :options="strangerMarkdown.options" :plugins :components class="*:first:mt-0 *:last:mb-0"/>
    </Suspense>
</template>
