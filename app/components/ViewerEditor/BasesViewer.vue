<script setup lang="ts">
import type {InternalLink} from "#codemirror-rich-obsidian-editor/editor-types";
import type {DropdownMenuItem, TableColumn} from "@nuxt/ui";
import {parseBase, runQuery, toDisplay, type RowScope} from "@type32/obsidian-bases-parser";
import {useActiveSessions} from "~/composables/active/useActiveSessions";
import {useBaseHost} from "~/composables/bases/useBaseHost";

/**
 * A `.base` file: its views over the workspace's files, queried with `@type32/obsidian-bases-parser`. The rows follow
 * the index live. Nothing is written yet (the toolbar's edits come with V1 of the Bases plan).
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

const parsed = computed(() => parseBase(content.value))
const base = computed(() => parsed.value.base)

const activeView = ref('')
const view = computed(() => base.value?.views?.find(v => v.name === activeView.value) ?? base.value?.views?.[0])

const search = ref('')
// Each keystroke re-runs the query: once typing pauses.
const searchTerm = refDebounced(search, 200)
const result = computed(() => base.value && view.value
    ? runQuery(base.value, view.value.name, {host, paths: paths.value, now: Date.now(), thisPath: props.filePath, search: searchTerm.value})
    : undefined)

const viewItems = computed<DropdownMenuItem[]>(() => (base.value?.views ?? []).map(v => ({
    label: v.name,
    type: 'checkbox' as const,
    checked: v.name === view.value?.name,
    onSelect: () => void (activeView.value = v.name),
})))

const columns = computed<TableColumn<RowScope>[]>(() => (view.value?.order ?? ['file.name']).map((id) => {
    const displayName = base.value?.properties?.[id]?.displayName
    return {
        id,
        header: typeof displayName === 'string' ? displayName : id.replace(/^(note|formula)\./, ''),
        accessorFn: (row) => {
            const value = row.property(id)
            return value.type === 'Null' ? '' : toDisplay(value)
        },
    }
}))

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
        <div v-if="parsed.error !== null" class="w-full p-6 pt-12">
            <UAlert color="error" variant="subtle" icon="i-lucide-file-x" :title="t('app.editor.ui.bases.invalid')"/>
            <p class="mt-3 font-mono text-xs text-muted whitespace-pre-wrap">{{ parsed.error }}</p>
        </div>
        <div v-else class="w-full flex flex-col flex-1 h-full pb-10">
            <div class="w-full flex items-center p-1 px-2">
                <UDropdownMenu :items="viewItems" size="sm">
                    <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-layout-dashboard" :label="view?.name ?? t('app.editor.ui.bases.views')"/>
                </UDropdownMenu>
                <UInput
                    v-model="search"
                    icon="i-lucide-search"
                    size="sm"
                    :placeholder="t('app.editor.ui.bases.search', {count: result?.rows.length ?? 0})"
                    variant="ghost"
                />
            </div>
            <UTable
                sticky
                :columns="columns"
                :data="result?.rows ?? []"
                class="flex-1 min-h-0"
                :virtualize="TABLE_VIRTUALIZE"
                :watch-options="TABLE_WATCH"
                :ui="TABLE_UI"
            />
        </div>
    </ViewerEditorLayoutWrapper>
</template>
