<script setup lang="ts">
import {catppuccinLatte, catppuccinMocha} from "@catppuccin/codemirror";
import {autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap} from "@codemirror/autocomplete";
import {defaultKeymap, history, historyKeymap} from "@codemirror/commands";
import {css} from "@codemirror/lang-css";
import {bracketMatching, indentOnInput} from "@codemirror/language";
import {Compartment, EditorState} from "@codemirror/state";
import {drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers, placeholder as hint} from "@codemirror/view";

/**
 * A CSS editor for a settings field (Theme → Custom CSS): highlighting, completion of properties and values, the code
 * viewer's colours in light and dark, the editor's code font. 8 lines tall, growing to 24. `v-model` follows every
 * keystroke; `save` comes when the editor loses focus or on ⌘S, so the setting is written once per edit, not per key.
 * Not the editor package's `CodeEditor`: that one focuses itself when it mounts (`autofocus`), here on every visit to Theme.
 */
const text = defineModel<string>({required: true})
const props = defineProps<{ placeholder?: string, readonly?: boolean }>()
const emit = defineEmits<{ save: [] }>()

const host = useTemplateRef<HTMLDivElement>('host')
const colorMode = useColorMode()
const colors = () => (colorMode.value === 'dark' ? catppuccinMocha : catppuccinLatte)
const editable = new Compartment()
const theme = new Compartment()
let view: EditorView | undefined

onMounted(() => {
    view = new EditorView({
        parent: host.value!,
        state: EditorState.create({
            doc: text.value,
            extensions: [
                lineNumbers(),
                history(),
                drawSelection(),
                highlightActiveLine(),
                indentOnInput(),
                bracketMatching(),
                closeBrackets(),
                autocompletion(),
                css(),
                hint(props.placeholder ?? ''),
                keymap.of([{key: 'Mod-s', run: () => (emit('save'), true)}, ...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, ...completionKeymap]),
                editable.of(EditorView.editable.of(!props.readonly)),
                theme.of(colors()),
                EditorView.theme({
                    '&': {fontSize: '0.8125rem', backgroundColor: 'transparent'},
                    '&.cm-focused': {outline: 'none'},
                    '.cm-scroller': {fontFamily: 'var(--font-editor-code)', lineHeight: '1.5', maxHeight: '36em', overflow: 'auto'},
                    '.cm-content, .cm-gutter': {minHeight: '12em'},
                }),
                EditorView.updateListener.of(update => {
                    if (update.docChanged) text.value = update.state.doc.toString()
                }),
                EditorView.domEventHandlers({blur: () => emit('save')}),
            ],
        }),
    })
})
onBeforeUnmount(() => view?.destroy())

// Another window, a reset or the scope changing the setting: the editor shows it.
watch(text, value => {
    if (view && value !== view.state.doc.toString()) view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: value}})
})
watch(() => props.readonly, readonly => view?.dispatch({effects: editable.reconfigure(EditorView.editable.of(!readonly))}))
watch(() => colorMode.value, () => view?.dispatch({effects: theme.reconfigure(colors())}))
</script>

<template>
    <div ref="host" class="rounded-md ring ring-default overflow-hidden focus-within:ring-2 focus-within:ring-primary" data-css-editor/>
</template>
