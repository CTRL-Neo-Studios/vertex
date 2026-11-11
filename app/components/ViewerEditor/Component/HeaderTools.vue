<script setup lang="ts">
import type {EditorState} from "@codemirror/state";
import type {EditorView} from "@codemirror/view";
import {redo, redoDepth, undo, undoDepth} from "@codemirror/commands";
import {builtinActions, label, markAt} from "@type32/codemirror-rich-obsidian-editor/kit";

/** Undo/redo or formatting buttons for the markdown editor's header; `state` is the editor's latest state. */
const props = defineProps<{
    tools: 'history' | 'format',
    view?: EditorView,
    state?: EditorState,
    disabled?: boolean,
}>()
const {t} = useI18n()

interface Tool { id: string, label: string, icon?: string, kbds?: string[], active: boolean, enabled: boolean, run: (view: EditorView) => unknown }

const FORMAT = ['bold', 'italic', 'strikethrough', 'highlight'] as const

/**
 * The kit's `isActive` only matches a selection that exactly covers the marked text (its toolbar only shows on a
 * selection). The header is always visible, so with a caret it reflects the word under it: the word the mark toggles.
 */
function markActive(state: EditorState, id: typeof FORMAT[number]) {
    const {main} = state.selection
    if (!main.empty) return !!builtinActions[id]!.isActive?.(state)
    const word = state.wordAt(main.head)
    return !!word && !!markAt(state, id, word.from, word.to)
}

const items = computed<Tool[]>(() => {
    const s = props.state
    if (props.tools === 'history') return [
        {id: 'undo', label: t('app.editor.ui.undo'), icon: 'i-lucide-undo-2', kbds: ['meta', 'z'], active: false, enabled: !!s && undoDepth(s) > 0, run: undo},
        {id: 'redo', label: t('app.editor.ui.redo'), icon: 'i-lucide-redo-2', kbds: ['meta', 'shift', 'z'], active: false, enabled: !!s && redoDepth(s) > 0, run: redo},
    ]
    return FORMAT.map((id) => {
        const action = builtinActions[id]!
        return {
            id,
            // The editor's labels facet carries the app language (useActiveEditorExtensions).
            label: s ? label(s, id, action.label) : action.label,
            icon: action.icon,
            kbds: action.kbds,
            active: !!s && markActive(s, id),
            enabled: !!s && (action.isEnabled?.(s) ?? true),
            run: action.run!,
        }
    })
})

function trigger(tool: Tool) {
    const view = props.view
    if (!view) return
    tool.run(view)
    view.focus()
}
</script>

<template>
    <div class="flex items-center gap-0.5 z-10">
        <UTooltip v-for="tool in items" :key="tool.id" :text="tool.label" :kbds="tool.kbds">
            <!-- mousedown.prevent keeps the editor's focus and selection, so formatting applies to what's selected. -->
            <UButton
                :icon="tool.icon"
                size="xs"
                :color="tool.active ? 'primary' : 'neutral'"
                :variant="tool.active ? 'soft' : 'ghost'"
                :disabled="disabled || !tool.enabled"
                :aria-label="tool.label"
                :aria-pressed="tools === 'format' ? tool.active : undefined"
                @mousedown.prevent
                @click="trigger(tool)"
				class="backdrop-blur-lg"
            />
        </UTooltip>
    </div>
</template>
