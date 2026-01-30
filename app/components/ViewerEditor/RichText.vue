<script setup lang="ts">
import type {
    InternalLink,
    InternalLinkClickDetail,
    SpecialCodeBlockMapping
} from "#codemirror-rich-obsidian-editor/editor-types";

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    specialCodeBlockMapping: SpecialCodeBlockMapping[]
    renaming: boolean,
    filePath?: string,
    disabled?: boolean
}>(), {
    renaming: false,
    filePath: '',
    disabled: false
})
const frontmatterOpen = useState<boolean>(props?.filePath, () => false)

const emit = defineEmits<{
    (e: 'on-rename', oldValue: string, newValue: string): void
    (e: 'on-clicked-internal-link', detail: InternalLinkClickDetail): void
}>()

onBeforeUnmount(() => {
    frontmatterOpen.value = false
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
            <ViewerEditorComponentFrontmatterEditor class="max-w-2xl w-full" v-model:open="frontmatterOpen" v-model:editorInstance="editorInstance"/>
            <Editor
                :disabled="disabled || frontmatterOpen || renaming"
                ref="editorInstance"
                v-model="content"
                class="max-w-2xl w-full"
                :special-code-block-map="props.specialCodeBlockMapping"
                :internal-link-map="props.internalLinkList"
                @update:model-value="() => contentSaved = false"
                @internal-link-click="(detail) => emit('on-clicked-internal-link', detail)"
            />
        </template>
        <template #status-bar>
            <ViewerEditorComponentWordCounter v-model="content"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>