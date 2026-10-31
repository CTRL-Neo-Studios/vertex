<script setup lang="ts">
const content = defineModel({ default: '' })

withDefaults(defineProps<{
    words?: boolean,
    lines?: boolean,
    paragraphs?: boolean
}>(), {
    words: true,
    lines: true,
    paragraphs: true,
})

const $du = useDocumentUtils()
const wordCount = computed(() => $du.getWordCount(unref(content) || ''))
const lineCount = computed(() => $du.getLineCount(unref(content) || ''))
const paragraphCount = computed(() => $du.getParagraphs(unref(content) || ''))
</script>

<template>
    <div class="text-center flex justify-center items-center gap-3 text-dimmed text-xs select-none">
        <template v-if="words">
            <div class="font-mono!">{{ wordCount }} {{ $t('app.generic.words') }}</div>
            <USeparator orientation="vertical" class="h-3 w-fit last:hidden"/>
        </template>
        <template v-if="lines">
            <div class="font-mono!">{{ lineCount }} {{ $t('app.generic.lines') }}</div>
            <USeparator orientation="vertical" class="h-3 w-fit last:hidden"/>
        </template>
        <template v-if="paragraphs">
            <div class="font-mono!">{{ paragraphCount }} {{ $t('app.generic.paragraphs') }}</div>
            <USeparator orientation="vertical" class="h-3 w-fit last:hidden"/>
        </template>
    </div>
</template>

<style scoped>

</style>