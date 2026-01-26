<script setup lang="ts">
import {getFileExtensionFromPath} from "#shared/utils/fs/filenames";

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
        scrollMode="vertical"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="props.filePath"
        :renaming="renaming"
    >
        <template #default>
            <CodeEditor
                :disabled="disabled"
                :colorMode="$cm.value"
                v-model="content"
                class="w-full"
                :language="getFileExtensionFromPath(props.filePath)"
                @update:model-value="() => contentSaved = false"
            />
        </template>
        <template #status-bar>
            <ViewerEditorComponentWordCounter v-model="content"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>