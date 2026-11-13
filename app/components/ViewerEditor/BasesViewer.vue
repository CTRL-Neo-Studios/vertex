<script setup lang="ts">
import type {InternalLink} from "#codemirror-rich-obsidian-editor/editor-types";
import type {TableColumn} from "@nuxt/ui";
import {parseBase, stringifyBase, toDisplay, type Base, type RowScope} from "@type32/obsidian-bases-parser";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {registerBaseCommands} from "~/composables/bases/useBaseCommands";
import {BASE_CONTEXT, createBaseContext} from "~/composables/bases/useBaseContext";
import {useBaseHost} from "~/composables/bases/useBaseHost";

/**
 * A `.base` file: its views over the workspace's files, queried with `@type32/obsidian-bases-parser`. The text is
 * parsed once; the toolbar's edits are written back as Obsidian writes them (the tab autosaves), and nothing is written
 * until something changes. A file that doesn't parse shows why and is never written. The view, the search and group
 * folds belong to the tab.
 */
const fileName = defineModel<string>('fileName')
const content = defineModel<string>({default: ''})
defineModel<boolean>('contentSaved', {default: false})
const props = withDefaults(defineProps<{
    renaming: boolean,
    filePath?: string,
    sessionId: string,
    internalLinkList?: InternalLink[],
    disabled?: boolean,
}>(), {filePath: '', internalLinkList: () => [], disabled: false})
const emit = defineEmits<{ 'on-rename': [oldValue: string, newValue: string] }>()

const {t} = useI18n()
const session = useActiveSessions().getSession(props.sessionId)!
const {host, paths} = useBaseHost(session)

// Text ↔ base. `written` is the last text this viewer produced, so its own saves don't parse again.
let written = content.value
const initial = parseBase(content.value)
const problem = ref(initial.error)
const base = shallowRef<Base>(initial.base ?? {views: []})
watch(content, (text) => {
    if (text === written) return
    written = text
    const next = parseBase(text)
    problem.value = next.error
    if (next.base) base.value = next.base
})

function commit(next: Base) {
    if (problem.value !== null) return
    base.value = next
    const text = stringifyBase(next)
    if (text === content.value) return
    written = text
    content.value = text
}

const ctx = createBaseContext({base, commit, host, paths, thisPath: props.filePath, session})
provide(BASE_CONTEXT, ctx)
registerBaseCommands(ctx)

const LAYOUTS = ['table', 'cards', 'list', 'kanban', 'map']
const unknownType = computed(() => (LAYOUTS.includes(ctx.view.value.type) ? null : ctx.view.value.type))

const columns = computed<TableColumn<RowScope>[]>(() => (ctx.view.value.order ?? ['file.name']).map(id => ({
    id,
    header: ctx.property(id).label,
    accessorFn: (row) => {
        const value = row.property(id)
        return value.type === 'Null' ? '' : toDisplay(value)
    },
})))

// Stable objects: a new one on each render (inline in the template) re-renders the table, and its virtualizer then
// re-estimates every row (Nuxt UI recomputes its options per row).
const TABLE_VIRTUALIZE = {estimateSize: 37}
const TABLE_WATCH = {deep: false}
const TABLE_UI = {
    thead: 'backdrop-blur-xs bg-linear-to-t from-transparent to-default',
    td: 'py-1',
    th: 'py-2 pt-0 text-xs',
}
</script>

<template>
    <ViewerEditorLayoutWrapper
        scrollMode="none"
        v-model:fileName="fileName"
        @onRename="(oldValue: string, newValue: string) => emit('on-rename', oldValue, newValue)"
        :filePath="filePath"
        :renaming="renaming"
        :showStatusBar="false"
        :bottomSpacing="false"
    >
        <div v-if="problem !== null" class="w-full p-6 pt-12">
            <UAlert color="error" variant="subtle" icon="i-lucide-file-x" :title="t('app.editor.ui.bases.invalid')"/>
            <p class="mt-3 font-mono text-xs text-muted whitespace-pre-wrap">{{ problem }}</p>
        </div>
        <div v-else class="w-full flex flex-col flex-1 h-full pb-10">
            <ViewerEditorBasesToolbar/>
            <div v-if="unknownType !== null" class="p-6 text-sm text-muted">
                {{ t('app.editor.ui.bases.unknownViewType', {type: unknownType}) }}
            </div>
            <!-- ponytail: every known layout shows as this table until V2–V5 build them. -->
            <UTable
                v-else
                sticky
                :columns="columns"
                :data="ctx.result.value.rows"
                class="flex-1 min-h-0"
                :virtualize="TABLE_VIRTUALIZE"
                :watch-options="TABLE_WATCH"
                :ui="TABLE_UI"
            />
        </div>
    </ViewerEditorLayoutWrapper>
</template>
