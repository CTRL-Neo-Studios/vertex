<script setup lang="ts">
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types";
import {createBase, createReactiveBaseFromYAML, useBase} from "@type32/obsidian-bases-parser";

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
    (e: 'on-clicked-internal-link', detail: InternalLinkClickDetail): void
}>()

const $base = useBase({
    base: unref(content),
    trackChanges: true
})

watch($base.hasChanges, (newValue) => {
    if (newValue)
        content.value = $base.save()
})

</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="vertical"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
    >
        <template #default>

        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>