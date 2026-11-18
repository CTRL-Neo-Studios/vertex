<script setup lang="ts">
import {openUrlInBrowser} from "~/composables/app/useAppOpener";

/** A link in `MarkdownText`: a web or mail one opens in the browser; anything else is its text. */
const props = defineProps<{ href?: string }>()
const web = computed(() => /^(https?|mailto):/i.test(props.href ?? ''))
</script>

<template>
    <a v-if="web" :href class="text-primary font-medium hover:underline" @click.prevent="openUrlInBrowser(href!)"><slot/></a>
    <span v-else><slot/></span>
</template>
