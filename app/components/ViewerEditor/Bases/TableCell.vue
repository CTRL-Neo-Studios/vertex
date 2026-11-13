<script setup lang="ts">
import {convertFileSrc} from "@tauri-apps/api/core";
import {toDisplay, toText, type RowScope, type Value} from "@type32/obsidian-bases-parser";
import {filterXSS} from "xss";
import {useActiveTabs} from "~/composables/active/useActiveTabs";
import {useActiveWorkspaceIndex} from "~/composables/active/useActiveWorkspaceIndex";
import {useAppNavigator} from "~/composables/app/useAppNavigator";
import {useAppOpener} from "~/composables/app/useAppOpener";
import {bareId, useBaseContext} from "~/composables/bases/useBaseContext";
import {useNoteProperties} from "~/composables/bases/useNoteProperties";
import {cellEditable, cellValue} from "~/utils/basesCells";
import type {RowHeight} from "~/utils/basesGrid";

/**
 * A table cell (Obsidian's Bases table): the row's value rendered by its type, or, while `editing`, an inline editor
 * for a note property chosen by the column's kind. Checkboxes toggle on click without editing.
 */
const props = defineProps<{ row: RowScope, id: string, editing: boolean, rowHeight: RowHeight }>()
const emit = defineEmits<{ done: [] }>()
const ctx = useBaseContext()
const {setProperties} = useNoteProperties(ctx.session)
const {getFileByPath} = useActiveWorkspaceIndex(ctx.session)
const {openTab} = useActiveTabs(ctx.session)
const $navi = useAppNavigator()
const {openUrlInBrowser} = useAppOpener()

const property = computed(() => ctx.property(props.id))
const value = computed(() => props.row.property(props.id))
const editable = computed(() => cellEditable(props.id, props.row.path))
// A non-note row has no note properties (Obsidian disables those cells).
const hidden = computed(() => property.value.source === 'note' && !props.row.path.endsWith('.md'))
const short = computed(() => props.rowHeight === 'short')

const write = (next: unknown) => setProperties([{path: props.row.path, key: bareId(props.id), value: next}])

async function openNote(path: string | null) {
    if (!path) return
    const node = getFileByPath(`${ctx.session.rootPath}/${path}`)
    if (node) await $navi.toWorkspaceTab(ctx.session.uuid, openTab(node.uuid))
}

interface CellLink { label: string, path: string | null }
function linkOf(v: Value): CellLink | null {
    if (v.type === 'Link') return {label: v.display ?? v.path, path: ctx.host.resolve(v.path.split('#')[0]!, v.from)}
    if (v.type === 'File') return {label: v.path.split('/').pop()!.replace(/\.md$/, ''), path: v.path}
    return null
}

const tagText = (v: Value) => (v.type === 'String' && v.tag ? v.value.replace(/^#/, '') : toDisplay(v))

/** How the value shows: one of the renderers below, with what it needs. */
const shown = computed(() => {
    const v = value.value
    if (props.id === 'file.name') return {as: 'links' as const, links: [{label: toText(v), path: props.row.path}]}
    const link = linkOf(v)
    if (link) return {as: 'links' as const, links: [link]}
    if (v.type === 'Boolean' || (v.type === 'Null' && property.value.source === 'note' && property.value.kind === 'checkbox')) {
        return {as: 'checkbox' as const, checked: v.type === 'Boolean' && v.value}
    }
    if (v.type === 'List') {
        const links = v.items.map(linkOf)
        if (links.every((l): l is CellLink => l !== null)) return {as: 'links' as const, links}
        if (property.value.source === 'note' || v.items.every(i => i.type === 'String' && i.tag)) return {as: 'pills' as const, pills: v.items.map(tagText), tags: v.items.every(i => i.type === 'String' && i.tag)}
    }
    if (v.type === 'Null') return {as: 'none' as const}
    if (v.type === 'URL') return {as: 'url' as const, url: v.value}
    if (v.type === 'HTML') return {as: 'html' as const, html: filterXSS(v.value)}
    if (v.type === 'Image') return {as: 'image' as const, src: /^[a-z][\w+.-]*:/i.test(v.src) ? v.src : convertFileSrc(`${ctx.session.rootPath}/${v.src}`)}
    if (v.type === 'String' && v.icon) return {as: 'icon' as const, icon: `i-lucide-${v.value}`}
    if (v.type === 'Error') return {as: 'error' as const, message: v.message}
    return {as: 'text' as const, text: toDisplay(v)}
})

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
        :class="short ? 'items-center whitespace-nowrap' : 'items-start py-1.5 whitespace-normal break-words'"
    >
        <span v-if="shown.as === 'links'" :class="{truncate: short}">
            <template v-for="(link, i) in shown.links" :key="i">
                <template v-if="i">, </template>
                <a
                    v-if="link.path"
                    href="#"
                    class="text-primary hover:underline cursor-pointer"
                    @click.prevent="openNote(link.path)"
                >{{ link.label }}</a>
                <span v-else class="text-muted">{{ link.label }}</span>
            </template>
        </span>
        <UCheckbox
            v-else-if="shown.as === 'checkbox'"
            :model-value="shown.checked"
            :disabled="!editable"
            @update:model-value="checked => write(checked === true)"
        />
        <div v-else-if="shown.as === 'pills'" class="flex gap-1 min-w-0" :class="short ? 'overflow-hidden' : 'flex-wrap'">
            <!-- Tags in the accent colour, other lists neutral, as Obsidian's pills. -->
            <UBadge v-for="(pill, i) in shown.pills" :key="i" :label="pill" :color="shown.tags ? 'primary' : 'neutral'" variant="soft" size="md" class="shrink-0"/>
        </div>
        <a
            v-else-if="shown.as === 'url'"
            :href="shown.url"
            class="text-primary hover:underline cursor-pointer"
            :class="{truncate: short}"
            @click.prevent="openUrlInBrowser(($event.currentTarget as HTMLAnchorElement).getAttribute('href')!)"
        >{{ shown.url }}</a>
        <!-- eslint-disable-next-line vue/no-v-html -- sanitized by filterXSS -->
        <div v-else-if="shown.as === 'html'" class="min-w-0" :class="{truncate: short}" v-html="shown.html"/>
        <img v-else-if="shown.as === 'image'" :src="shown.src" alt="" class="h-full max-w-full object-contain py-1">
        <UIcon v-else-if="shown.as === 'icon'" :name="shown.icon" class="size-4 shrink-0"/>
        <UTooltip v-else-if="shown.as === 'error'" :text="shown.message">
            <span class="flex items-center gap-1 min-w-0">
                <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning"/>
                <span class="truncate">{{ shown.message }}</span>
            </span>
        </UTooltip>
        <!-- Numbers sit right, as in Obsidian's table. -->
        <span v-else-if="shown.as === 'text'" :class="{truncate: short, 'ms-auto': value.type === 'Number'}">{{ shown.text }}</span>
    </div>
</template>
