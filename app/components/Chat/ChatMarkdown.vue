<script setup lang="ts">
import math, {Math} from "@comark/nuxt/plugins/math";
import rangi from "@comark/nuxt/plugins/rangi";
import "katex/dist/katex.min.css";
import {callouts, wikiLinks} from "~/utils/comarkPlugins";
import ChatLink from "~/components/Chat/ChatLink.vue";
import ChatCodeBlock from "~/components/Chat/ChatCodeBlock.vue";

defineProps<{ value: string, streaming?: boolean }>()

// Callouts render as Nuxt UI's ProseCallout and everything else through its prose components (@comark/nuxt turns
// them on); `a` and `pre` are ours (wikilinks, Pele diagrams), `icon` is a folding callout's. rangi highlights code
// without Shiki's weight.
const plugins = [wikiLinks, callouts, math(), rangi()]
const components = {a: ChatLink, pre: ChatCodeBlock, math: Math, icon: resolveComponent('UIcon')}
</script>

<template>
    <Suspense>
        <Markdown :value :streaming :plugins :components class="*:first:mt-0 *:last:mb-0"/>
    </Suspense>
</template>
