<script setup lang="ts">
/** A status item: the shown file's counts. Its other props (`filePath`, `fileId`, `session`) aren't attributes. */
defineOptions({inheritAttrs: false})
const props = withDefaults(defineProps<{
    text: string,
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
const text = refDebounced(toRef(props, 'text'), 250)
const wordCount = computed(() => $du.getWordCount(text.value || ''))
const lineCount = computed(() => $du.getLineCount(text.value || ''))
const paragraphCount = computed(() => $du.getParagraphs(text.value || ''))
</script>

<template>
    <div class="text-center flex justify-center items-center gap-3 text-default text-xs select-none">
        <template v-if="words">
            <div class="font-mono!">{{ wordCount }} {{ $t('plugins.writers-tools.words') }}</div>
            <USeparator orientation="vertical" class="h-3 w-fit last:hidden"/>
        </template>
        <template v-if="lines">
            <div class="font-mono!">{{ lineCount }} {{ $t('plugins.writers-tools.lines') }}</div>
            <USeparator orientation="vertical" class="h-3 w-fit last:hidden"/>
        </template>
        <template v-if="paragraphs">
            <div class="font-mono!">{{ paragraphCount }} {{ $t('plugins.writers-tools.paragraphs') }}</div>
            <USeparator orientation="vertical" class="h-3 w-fit last:hidden"/>
        </template>
    </div>
</template>
