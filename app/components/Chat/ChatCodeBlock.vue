<script setup lang="ts">
import type {PropType} from "vue";
import type {ElementNode} from "@comark/vue";
import {textContent} from "@comark/vue/utils";
import MermaidDiagram from "~/components/Utility/MermaidDiagram.vue";

defineOptions({inheritAttrs: false})
// Comark passes the raw node to components that declare `__node`; the source is read from it. Runtime props: the SFC
// compiler needn't resolve Comark's types.
const props = defineProps({
    // Comark's ElementNode is a tuple (`[tag, props, ...children]`), so Array is its runtime type.
    __node: {type: Array as unknown as PropType<ElementNode>, required: true},
    language: {type: String, default: undefined},
})
const source = computed(() => textContent(props.__node))
</script>

<template>
    <MermaidDiagram v-if="language === 'mermaid'" :source="source" class="my-3"/>
    <pre v-else :data-language="language"><slot/></pre>
</template>
