<script setup lang="ts">
import type {EditorView} from "@codemirror/view"
import type {ExternalLinkClickDetail, InternalLinkClickDetail} from "@type32/codemirror-rich-obsidian-editor"
import type {NoteEditorEmits, NoteEditorProps} from "#shared/plugin/components"
import {useNoteEditor} from "~/composables/active/editor/useNoteEditor"
import {usePropertiesOptions} from "~/composables/active/editor/usePropertiesOptions"
import {useActiveSessions} from "~/composables/active/useActiveSessions"
import {useAppOpener} from "~/composables/app/useAppOpener"

/**
 * A markdown editor inside something else (a canvas card being edited, Bases' New item), published to plugins in
 * `app/plugin/ui`: the note editor's own rendering, `[[links]]`, code blocks, embeds and syntax (`useNoteEditor`), and
 * of the extensions only the `nested` ones, as the tab's (the outline, toolbars, AI) belong to a note's tab.
 * `notePath` is the file it's in (the canvas), `this` for an embedded base. Esc ends editing (`done`); an internal
 * link's click is the caller's (`openLink`). `readonly`: a picture of the note (a canvas card shown, not edited),
 * clipped as a card is, where only links, buttons and widgets take the pointer, so a drag or a double-click goes to
 * what holds it; no focus, no cursor, no `update`.
 */
const props = defineProps<NoteEditorProps>()
const emit = defineEmits<NoteEditorEmits>()
const editor = useTemplateRef<{ view: EditorView | undefined }>('editor')
const $route = useRoute()
const session = useActiveSessions().getSession(computed(() => $route.params.sessionId as string))
const properties = usePropertiesOptions(session)
const {ready, codeBlocks: codeBlockMap, links, markdown, extensions} = useNoteEditor(session, () => props.notePath)
// The editor follows no link itself: a web or mail link opens in the default app.
const {openUrlInBrowser} = useAppOpener()

// Focused at the end, as a double-clicked canvas card starts editing there; without scrolling, which would move what
// holds it out of view. A read-only one (a card shown, not edited) takes no focus.
watch(() => editor.value?.view, (view) => {
    if (!view || props.readonly) return
    view.contentDOM.focus({preventScroll: true})
    view.dispatch({selection: {anchor: view.state.doc.length}})
}, {flush: 'post'})
</script>

<template>
    <div
        class="note-editor size-full"
        :class="readonly ? 'overflow-hidden pointer-events-none [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_.cm-embed-widget]:pointer-events-auto' : 'overflow-auto'"
        @keydown.esc.stop.prevent="emit('done')"
    >
        <Editor
            v-if="ready"
            ref="editor"
            class="w-full"
            :model-value="props.text"
            :disabled="props.readonly"
            :extensions="extensions"
            :special-code-block-map="codeBlockMap"
            :internal-link-map="links"
            :markdown="markdown"
            :properties="properties"
            context-menu-size="sm"
            @update:model-value="(text?: string) => emit('update', text ?? '')"
            @internal-link-click="(detail: InternalLinkClickDetail) => emit('openLink', detail)"
            @external-link-click="({url}: ExternalLinkClickDetail) => openUrlInBrowser(url)"
        />
    </div>
</template>

<style scoped>
/* With CodeMirror's own line padding, the text sits where a canvas card shows it when not editing (12px 16px). */
.note-editor {
    padding: 11px 10px 7px;
}
</style>
