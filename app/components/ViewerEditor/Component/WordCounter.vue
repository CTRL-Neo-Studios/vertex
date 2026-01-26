<script setup lang="ts">
const content = defineModel({ default: '' })
const $du = useDocumentUtils()
</script>

<template>
    <div class="text-center flex justify-center items-center gap-3 text-dimmed text-xs select-none">
        <div class="font-mono!">{{ $du.getWordCount(content || '') }} Words</div>
        <USeparator orientation="vertical" class="h-3 w-fit"/>
        <div class="font-mono!">{{ $du.getLineCount(content || '') }} Lines</div>
    </div>
</template>

<style scoped>

</style>