<script setup lang="ts">
import type {EditorView} from "@codemirror/view"
import type {InternalLink, InternalLinkClickDetail} from "#codemirror-rich-obsidian-editor/editor-types"

/**
 * The markdown editor inside a canvas card being edited (a text card, or a note card): the note editor's own
 * rendering and `[[links]]`, without the tab's extensions (the outline, toolbars, AI), which belong to a note's tab.
 * Esc ends editing, as the canvas's own textarea does.
 */
const props = defineProps<{ text: string, internalLinkList: InternalLink[] }>()
const emit = defineEmits<{ update: [text: string], done: [], openLink: [detail: InternalLinkClickDetail] }>()
const editor = useTemplateRef<{ view: EditorView | undefined }>('editor')

// Focused at the end, as a double-clicked card starts editing there; without scrolling, which would move the canvas
// out of its tab.
watch(() => editor.value?.view, (view) => {
    if (!view) return
    view.contentDOM.focus({preventScroll: true})
    view.dispatch({selection: {anchor: view.state.doc.length}})
}, {flush: 'post'})
</script>

<template>
    <div class="canvas-card-editor size-full overflow-auto" @keydown.esc.stop.prevent="emit('done')">
        <Editor
            ref="editor"
            class="w-full"
            :model-value="props.text"
            :internal-link-map="props.internalLinkList"
            @update:model-value="(text?: string) => emit('update', text ?? '')"
            @internal-link-click="(detail: InternalLinkClickDetail) => emit('openLink', detail)"
        />
    </div>
</template>

<style scoped>
/* With CodeMirror's own line padding, the text sits where the card shows it when not editing (12px 16px). */
.canvas-card-editor {
    padding: 11px 10px 7px;
}
</style>
