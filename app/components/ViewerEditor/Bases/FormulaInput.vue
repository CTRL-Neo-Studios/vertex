<script setup lang="ts">
import {autocompletion, closeCompletion, completionStatus, type Completion, type CompletionContext} from "@codemirror/autocomplete";
import {EditorState} from "@codemirror/state";
import {EditorView, keymap, placeholder as placeholderExtension} from "@codemirror/view";
import {FUNCTION_NAMES, parseExpression} from "@type32/obsidian-bases-parser";
import {FILE_PROPERTIES, useBaseContext} from "~/composables/bases/useBaseContext";

/**
 * An expression field (formulas, advanced filters, a map's center): one line, with completion of functions,
 * methods after `.`, and properties (`file.`, `formula.`, `note.`), and Obsidian's "Valid formula" line under it.
 * `commit` fires on Enter and when focus leaves.
 */
const model = defineModel<string>({default: ''})
const props = withDefaults(defineProps<{ placeholder?: string, status?: boolean, autofocus?: boolean }>(), {placeholder: '', status: true, autofocus: false})
const emit = defineEmits<{ commit: [] }>()
const {t} = useI18n()
const ctx = useBaseContext()
const host = useTemplateRef<HTMLDivElement>('host')
let view: EditorView | undefined

const error = computed(() => {
    if (!model.value.trim()) return null
    try {
        parseExpression(model.value)
        return null
    } catch (e) {
        return e instanceof Error ? e.message : String(e)
    }
})

const option = (label: string, type: string, detail?: string): Completion => ({label, type, detail})

function complete(context: CompletionContext) {
    const word = context.matchBefore(/[\p{L}\p{N}_.]*$/u)
    if (!word || (word.from === word.to && !context.explicit)) return null
    const dot = word.text.lastIndexOf('.')
    if (dot < 0) {
        const notes = ctx.properties.value.filter(p => p.source === 'note').map(p => option(p.id, 'property'))
        return {
            from: word.from,
            options: [
                ...FUNCTION_NAMES.globals.map(name => ({...option(name, 'function'), apply: `${name}(`})),
                ...['file', 'formula', 'note', 'this'].map(name => option(name, 'namespace')),
                ...notes,
            ],
        }
    }
    const subject = word.text.slice(0, dot)
    const from = word.from + dot + 1
    if (subject === 'file') return {from, options: [...FILE_PROPERTIES.map(f => option(f, 'property', t(`app.editor.ui.bases.fileProperties.${f}`))), ...FUNCTION_NAMES.methods.map(name => ({...option(name, 'method'), apply: `${name}(`}))]}
    if (subject === 'formula') return {from, options: Object.keys(ctx.base.value.formulas ?? {}).map(name => option(name, 'property'))}
    if (subject === 'note') return {from, options: ctx.properties.value.filter(p => p.source === 'note').map(p => option(p.id, 'property'))}
    return {from, options: FUNCTION_NAMES.methods.map(name => ({...option(name, 'method'), apply: `${name}(`}))}
}

const theme = EditorView.theme({
    '&': {fontSize: '13px', backgroundColor: 'transparent', color: 'var(--ui-text)'},
    '&.cm-focused': {outline: 'none'},
    '.cm-content': {fontFamily: 'var(--font-mono, ui-monospace, monospace)', padding: '5px 0', caretColor: 'var(--ui-text)'},
    '.cm-line': {padding: '0 8px'},
    '.cm-placeholder': {color: 'var(--ui-text-dimmed)'},
    '.cm-tooltip': {backgroundColor: 'var(--ui-bg-elevated)', color: 'var(--ui-text)', border: '1px solid var(--ui-border)', borderRadius: 'var(--ui-radius)'},
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': {backgroundColor: 'var(--ui-bg-accented)', color: 'var(--ui-text-highlighted)'},
    '.cm-completionDetail': {color: 'var(--ui-text-dimmed)', marginLeft: '0.5em'},
})

onMounted(() => {
    view = new EditorView({
        parent: host.value!,
        state: EditorState.create({
            doc: model.value,
            extensions: [
                theme,
                placeholderExtension(props.placeholder),
                autocompletion({override: [complete], icons: false}),
                // One line: Enter commits (unless it picks a completion), and pasted newlines become spaces.
                keymap.of([{key: 'Enter', run: (v) => {
                    if (completionStatus(v.state) === 'active') return false
                    emit('commit')
                    return true
                }}, {key: 'Escape', run: v => closeCompletion(v)}]),
                EditorState.transactionFilter.of(tr => (tr.docChanged && tr.newDoc.lines > 1
                    ? [tr, {changes: {from: 0, to: tr.newDoc.length, insert: tr.newDoc.toString().replace(/\r?\n/g, ' ')}, sequential: true}]
                    : tr)),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) model.value = update.state.doc.toString()
                    if (update.focusChanged && !update.view.hasFocus) emit('commit')
                }),
            ],
        }),
    })
    if (props.autofocus) view.focus()
})

watch(model, (text) => {
    if (view && text !== view.state.doc.toString()) view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: text}})
})

onBeforeUnmount(() => view?.destroy())
</script>

<template>
    <div class="w-full">
        <div ref="host" class="w-full rounded-md bg-elevated/50 ring ring-inset ring-default focus-within:ring-2 focus-within:ring-primary"/>
        <div v-if="props.status && model.trim()" class="mt-1 flex items-start gap-1 text-xs" :class="error ? 'text-error' : 'text-success'">
            <UIcon :name="error ? 'i-lucide-circle-x' : 'i-lucide-circle-check'" class="mt-0.5 size-3.5 shrink-0"/>
            <span class="whitespace-pre-wrap">{{ error ?? t('app.editor.ui.bases.validFormula') }}</span>
        </div>
    </div>
</template>
