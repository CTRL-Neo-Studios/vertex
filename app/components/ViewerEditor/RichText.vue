<script setup lang="ts">
import type {
    InternalLink,
    InternalLinkClickDetail,
    SpecialCodeBlockMapping
} from "#codemirror-rich-obsidian-editor/editor-types";
import type {EditorState, Extension} from "@codemirror/state";
import {EditorView} from "@codemirror/view";
import type {HeaderToolsPosition} from "#shared/types/app/settings";
import {useSettingsScope} from "~/composables/app/useSettingsScope";

const editorInstance = defineModel('editorInstance')
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({ default: '' })
const contentSaved = defineModel<boolean>('contentSaved', {default: false})

const props = withDefaults(defineProps<{
    internalLinkList: InternalLink[],
    specialCodeBlockMapping: SpecialCodeBlockMapping[],
    extensions?: Extension[],
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

// Header tools: the editor's latest state drives their enabled/active looks; each group sits where settings say.
const {effective} = useSettingsScope()
const editorState = shallowRef<EditorState>()
const stateTracker = EditorView.updateListener.of(update => { editorState.value = update.state })
const editorExtensions = computed(() => [...(props.extensions ?? []), stateTracker])
const editorView = computed(() => unref((editorInstance.value as {view?: MaybeRef<EditorView | undefined>} | undefined)?.view))
watch(editorView, view => { if (view) editorState.value = view.state }, {immediate: true})
function toolsAt(side: HeaderToolsPosition) {
    const panel = effective.value?.viewConfig.editorPanel
    return (['history', 'format'] as const).filter(tools => (tools === 'history' ? panel?.headerHistory : panel?.headerFormatting) === side)
}
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
                :extensions="editorExtensions"
                ref="editorInstance"
                v-model="content"
                class="max-w-2xl w-full"
                :special-code-block-map="props.specialCodeBlockMapping"
                :internal-link-map="props.internalLinkList"
                @update:model-value="() => contentSaved = false"
                @internal-link-click="(detail) => emit('on-clicked-internal-link', detail)"
            />
        </template>
        <template #header-left>
            <ViewerEditorComponentHeaderTools v-for="tools in toolsAt('left')" :key="tools" :tools="tools" :view="editorView" :state="editorState" :disabled="disabled || frontmatterOpen || renaming"/>
        </template>
        <template #header-right>
            <ViewerEditorComponentHeaderTools v-for="tools in toolsAt('right')" :key="tools" :tools="tools" :view="editorView" :state="editorState" :disabled="disabled || frontmatterOpen || renaming"/>
        </template>
        <template #status-bar>
            <ViewerEditorComponentWordCounter v-model="content"/>
        </template>
    </ViewerEditorLayoutWrapper>
</template>

<style scoped>

</style>