<script setup lang="ts">
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";
import type {
    InternalLink,
    InternalLinkClickDetail,
    SpecialCodeBlockMapping
} from "#codemirror-rich-obsidian-editor/editor-types";

const $du = useDocumentUtils()

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    specialCodeBlockMapping: SpecialCodeBlockMapping[]
    renaming: boolean,
    filePath?: string
}>(), {
    renaming: false,
    filePath: '',
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
    (e: 'on-clicked-internal-link', detail: InternalLinkClickDetail): void
}>()
</script>

<template>
    <ScrollAreaRoot
        class="w-full h-full flex flex-col relative"
        :style="{ height: 'calc(100vh - var(--ui-header-height) - 0.0rem)' }"
    >
        <div class="absolute z-10 bg-linear-to-t from-transparent via-default to-default left-0 right-0 top-0 h-10">
            <div class="w-full flex items-center justify-center p-2">
                <div class="grow flex items-center justify-center">
                    <EditorHeaderBreadcrumbs :renaming="props.renaming" v-model="fileName" :relativeFilePath="props.filePath" @on-rename="(oldValue, newValue) => emit('on-rename', oldValue, newValue)" class="w-fit"/>
                </div>
            </div>
        </div>
        <ScrollAreaViewport class="w-full flex-none h-full cursor-text">
            <!-- This div can add padding or alignment for the editor -->
            <div class="flex flex-col items-center justify-start md:p-0 mb-32 mt-10 cursor-text">
                <!-- The editor is free to be as tall as its content requires -->
                <Editor
                    ref="editorInstance"
                    v-model="content"
                    class="max-w-2xl w-full"
                    :special-code-block-map="props.specialCodeBlockMapping"
                    :internal-link-map="props.internalLinkList"
                    @update:model-value="() => contentSaved = false"
                    @internal-link-click="(detail) => emit('on-clicked-internal-link', detail)"
                />
            </div>
        </ScrollAreaViewport>
        <div class="bg-default absolute z-10 left-0 right-0 bottom-0 h-fit">
            <div class="bg-submuted inline-flex justify-center items-center w-full border-t border-default">
                <div class="text-center flex justify-center items-center gap-3 text-dimmed text-xs p-1 px-3 pb-1.5 select-none">
                    <div class="font-mono!">{{ $du.getWordCount(content || '') }} Words</div>
                    <USeparator orientation="vertical" class="h-3 w-fit"/>
                    <div class="font-mono!">{{ $du.getLineCount(content || '') }} Lines</div>
                </div>
                <div class="grow"/>
            </div>
        </div>
        <ScrollAreaScrollbar
            class="select-none touch-none z-20 w-2 m-2 pointer-events-none"
            orientation="vertical"
        >
            <ScrollAreaThumb
                class="flex-1 bg-accented rounded-lg"
            />
        </ScrollAreaScrollbar>
    </ScrollAreaRoot>
</template>

<style scoped>

</style>