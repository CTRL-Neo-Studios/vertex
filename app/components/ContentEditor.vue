<script setup lang="ts">
import {ScrollAreaRoot, ScrollAreaScrollbar, ScrollAreaThumb, ScrollAreaViewport} from "reka-ui";
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types";

const $du = useDocumentUtils()

const fileName = defineModel<string>('fileName')
const content = defineModel<string>()
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    renaming: boolean,
    filePath?: string
}>(), {
    renaming: false,
    filePath: ''
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
    (e: 'on-clicked-internal-link', detail: InternalLinkClickDetail): void
}>()
</script>

<template>
    <ScrollAreaRoot
        class="w-full h-full flex flex-col relative"
        :style="{ height: 'calc(100vh - var(--ui-header-height) - 0.7rem)' }"
    >
        <div class="absolute z-10 bg-linear-to-t from-transparent via-default to-default left-0 right-0 top-0 h-10 rounded-t-xl">
            <div class="w-full flex items-center justify-center p-2">
                <div class="grow flex items-center justify-center">
                    <EditorHeaderBreadcrumbs :renaming="props.renaming" v-model="fileName" :relativeFilePath="props.relativeFilePath" @on-rename="(oldValue, newValue) => emit('on-rename', oldValue, newValue)" class="w-fit"/>
                </div>
            </div>
        </div>
        <ScrollAreaViewport class="w-full flex-none h-full">
            <!-- This div can add padding or alignment for the editor -->
            <div class="flex flex-col items-center justify-start md:p-0 mb-32 mt-10">
                <!-- The editor is free to be as tall as its content requires -->
                <Editor
                    ref="editorRef"
                    v-model="content"
                    class="max-w-2xl w-full"
                    :internal-link-map="props.internalLinkList"
                    @update:model-value="() => contentSaved = false"
                    @internal-link-click="(detail) => emit('on-clicked-internal-link', detail)"
                />
            </div>
        </ScrollAreaViewport>
        <div class="absolute z-10 bg-linear-to-b from-transparent to-default left-0 right-0 bottom-0 h-fit rounded-b-xl inline-flex justify-center items-center p-1">
            <div class="grow"/>
            <UTooltip :content="{side: 'left'}" :text="`${$du.getWordCount(content || '')} Words, ${$du.getLineCount(content || '')} Lines`" :delay-duration="100">
                <UButton size="xs" variant="ghost" icon="i-lucide-info"/>
            </UTooltip>
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