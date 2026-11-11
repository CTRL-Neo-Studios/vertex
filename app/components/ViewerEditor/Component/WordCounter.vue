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
// Three passes over the whole text: once typing pauses, not per keystroke.
const text = refDebounced(content, 250)
const wordCount = computed(() => $du.getWordCount(text.value || ''))
const lineCount = computed(() => $du.getLineCount(text.value || ''))
const paragraphCount = computed(() => $du.getParagraphs(text.value || ''))
</script>

<template>
    <div class="text-center flex justify-center items-center gap-3 text-default text-xs select-none">
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
