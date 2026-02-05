<script setup lang="ts">
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";
import {Latex} from "@type32/latex2vue";

const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})
const $cm = useColorMode()

const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false,
})

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
}>()
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="props.filePath"
        :renaming="renaming"
        :bottomSpacing="false"
    >
        <template #default>
            <div
                class="w-full flex flex-col flex-1 h-full pb-10"
                :style="{maxHeight: 'calc(100vh - var(--ui-header-height) - 0.0rem)'}"
            >
                <div class="flex-1 grid grid-cols-2 grid-rows-1 w-full min-h-0 pb-6">
                    <UScrollArea orientation="vertical" class="no-scrollbar border-r border-r-default overflow-auto">
                        <CodeEditor
                            :disabled="disabled || renaming"
                            :colorMode="$cm.value"
                            v-model="content"
                            class="w-full pb-6"
                            :language="getFileExtensionFromPath(props.filePath)"
                            @update:model-value="() => contentSaved = false"
                        />
                    </UScrollArea>
                    <div class="overflow-auto">
                        <UScrollArea orientation="vertical" class="w-full h-full no-scrollbar">
                            <ClientOnly class="math-document" id="latex-macros">
                                <Latex class="w-full h-full items-center justify-center p-3 px-6 relative font-math" :content="content"/>
                            </ClientOnly>
                        </UScrollArea>
                    </div>
                </div>
            </div>
        </template>
        <template #status-bar>
            <ViewerEditorComponentWordCounter v-model="content" :paragraphs="false" :words="false"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style>
@reference "~/assets/css/main.css";

.cm-code-editor {
    @apply h-full;
}

.cm-scroller {
    @apply no-scrollbar;
}

svg {
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
}

.pspicture {
    position: relative;
    margin: auto;
}

.enumerate {
    list-style: circle;
    padding: 12px;
}

span.tt {
    font-family: courier;
}

p.quotation {
    padding: 0 0 0 15px;
    margin: 0 0 20px;
    font-size: 10pt;
}

.nicebox {
    margin-top: 20px;
    min-height: 20px;
    padding: 19px;
    margin-bottom: 20px;
    background-color: #f5f5f5;
    border: 1px solid #e3e3e3;
    -webkit-border-radius: 4px;
    -moz-border-radius: 4px;
    border-radius: 4px;
    -webkit-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
    -moz-box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
    box-shadow: inset 0 1px 1px rgba(0, 0, 0, 0.05);
}

pre {
    overflow: auto;
}
</style>