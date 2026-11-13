<script setup lang="ts">
import {toText, type RowScope, type Value} from "@type32/obsidian-bases-parser";
import {bareId, useBaseContext} from "~/composables/bases/useBaseContext";
import {useNoteProperties} from "~/composables/bases/useNoteProperties";
import {cellEditable, cellValue} from "~/utils/basesCells";
import type {RowHeight} from "~/utils/basesGrid";

/**
 * A table cell (Obsidian's Bases table): the row's value (`Value`), or, while `editing`, an inline editor for a note
 * property chosen by the column's kind. Checkboxes toggle on click without editing; numbers sit right.
 */
const props = defineProps<{ row: RowScope, id: string, editing: boolean, rowHeight: RowHeight }>()
const emit = defineEmits<{ done: [] }>()
const ctx = useBaseContext()
const {setProperties} = useNoteProperties(ctx.session)

const property = computed(() => ctx.property(props.id))
const value = computed(() => props.row.property(props.id))
const editable = computed(() => cellEditable(props.id, props.row.path))
// A non-note row has no note properties (Obsidian disables those cells).
const hidden = computed(() => property.value.source === 'note' && !props.row.path.endsWith('.md'))
const short = computed(() => props.rowHeight === 'short')

const write = (next: unknown) => setProperties([{path: props.row.path, key: bareId(props.id), value: next}])

/** The editor for the column's kind; a value that doesn't fit the kind edits as text. */
const editor = computed(() => {
    const kind = property.value.kind, type = value.value.type
    const fits = (t: Value['type']) => type === t || type === 'Null'
    if (kind === 'checkbox' && fits('Boolean')) return 'checkbox'
    if (kind === 'number' && fits('Number')) return 'number'
    if (kind === 'date' && fits('Date')) return 'date'
    if (kind === 'list' && fits('List')) return 'list'
    return 'text'
})
const withTime = computed(() => value.value.type === 'Date' && value.value.time)

const draft = ref('')
const tags = ref<string[]>([])
let start = ''
let finished = false
const tagsBox = useTemplateRef<HTMLElement>('tagsBox')

watch(() => props.editing, (editing) => {
    if (!editing) return
    // A checkbox has nothing to edit: its click toggles it.
    if (editor.value === 'checkbox') return emit('done')
    const v = value.value
    finished = false
    tags.value = v.type === 'List' ? v.items.map(i => (i.type === 'String' && i.tag ? i.value.slice(1) : toText(i))) : []
    // `datetime-local` takes minutes (`2026-09-23T23:10`); the stored seconds are dropped on save.
    draft.value = v.type === 'Null' ? '' : v.type === 'Date' && v.time ? toText(v).slice(0, 16) : toText(v)
    start = editor.value === 'list' ? JSON.stringify(tags.value) : draft.value
}, {immediate: true})

async function finish(save: boolean) {
    if (finished) return
    finished = true
    let next: unknown = null, now = draft.value
    if (editor.value === 'list') {
        // Text typed but not yet turned into a tag counts too.
        const pending = tagsBox.value?.querySelector('input')?.value.trim()
        const list = pending ? [...tags.value, pending] : tags.value
        now = JSON.stringify(list)
        next = list.length ? list : null
    } else {
        next = cellValue(property.value.kind, String(draft.value))
    }
    emit('done')
    if (save && now !== start) await write(next)
}

function onKeydown(event: KeyboardEvent) {
    if (event.isComposing) return
    if (event.key === 'Escape') return void finish(false)
    // In the tags input, Enter with text adds a tag; on an empty input it saves.
    if (event.key === 'Enter' && !(editor.value === 'list' && (event.target as HTMLInputElement).value)) return void finish(true)
}

function onTagsFocusout(event: FocusEvent) {
    if (!tagsBox.value?.contains(event.relatedTarget as Node | null)) finish(true)
}
</script>

<template>
    <div v-if="hidden"/>
    <div v-else-if="editing && editor === 'list'" ref="tagsBox" class="size-full overflow-auto" @keydown="onKeydown" @focusout="onTagsFocusout">
        <UInputTags v-model="tags" autofocus variant="none" size="sm" class="min-h-full w-full"/>
    </div>
    <UInput
        v-else-if="editing && editor !== 'checkbox'"
        v-model="draft"
        :type="editor === 'number' ? 'number' : editor === 'date' ? (withTime ? 'datetime-local' : 'date') : 'text'"
        autofocus
        variant="none"
        size="sm"
        class="size-full"
        :ui="{base: 'h-full'}"
        @keydown="onKeydown"
        @blur="finish(true)"
    />
    <div
        v-else
        class="flex size-full min-w-0 px-2"
        :class="[short ? 'items-center whitespace-nowrap' : 'items-start py-1.5 whitespace-normal break-words', {'justify-end': value.type === 'Number'}]"
    >
        <ViewerEditorBasesValue :row="row" :id="id" :one-line="short" :editable="editable" @toggle="write"/>
    </div>
</template>
