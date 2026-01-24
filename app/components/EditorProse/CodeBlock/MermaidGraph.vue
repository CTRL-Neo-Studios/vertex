<script setup lang="ts">
import VueMermaidString from "vue-mermaid-string";

const props = defineProps<{ codeContent?: string }>()
</script>

<template>
    <div class="p-3 rounded-lg">
        <VueMermaidString :value="codeContent || ''"/>
    </div>
</template>

<style scoped>

</style>