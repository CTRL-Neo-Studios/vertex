<script setup lang="ts">
import type {PropType} from "vue";
import type {ElementNode} from "comark";
import {textContent} from "@comark/vue/utils";
import {chatUses} from "~/builtins/chat";

defineOptions({inheritAttrs: false})
// Comark passes the raw node to components that declare `__node`; the source is read from it. Runtime props: the SFC
// compiler needn't resolve Comark's types.
const props = defineProps({
    // Comark's ElementNode is a tuple (`[tag, props, ...children]`), so Array is its runtime type.
    __node: {type: Array as unknown as PropType<ElementNode>, required: true},
    language: {type: String, default: undefined},
})
const source = computed(() => textContent(props.__node))
// Mermaid's diagram while that plugin is on; its source as code otherwise.
const diagram = computed(() => props.language === 'mermaid' ? chatUses('mermaid')?.Diagram : undefined)
</script>

<template>
    <component :is="diagram" v-if="diagram" :source="source" class="my-3"/>
    <!-- $attrs carries the highlighter's classes (`shiki`, for the dark colors in main.css) onto ProsePre's <pre>. -->
    <ProsePre v-else :code="source" :language="language" v-bind="$attrs"><slot/></ProsePre>
</template>
