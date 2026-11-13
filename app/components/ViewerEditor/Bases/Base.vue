<script setup lang="ts">
import {parseBase, stringifyBase, type Base} from "@type32/obsidian-bases-parser";
import type {ActiveSession} from "#shared/types/active/sessions";
import {registerBaseCommands} from "~/composables/bases/useBaseCommands";
import {BASE_CONTEXT, createBaseContext} from "~/composables/bases/useBaseContext";
import {useBaseHost} from "~/composables/bases/useBaseHost";

/**
 * A base from its text: its views over the workspace's files, queried with `@type32/obsidian-bases-parser`. The text is
 * parsed once; the toolbar's edits come back as the text Obsidian would write, and nothing is written until something
 * changes. Text that doesn't parse shows why and is never written. Used by `.base` tabs and by embeds:
 * - `embed: 'note'` (`![[x.base]]`, ` ```base `) sizes as Obsidian's: content height, kanban at least 500 px, a map
 * `mapHeight` (400) high;
 * - `embed: 'card'` (canvas) fills the card.
 * Embeds don't take the palette's Bases commands.
 */
const text = defineModel<string>({required: true})
const viewName = defineModel<string>('view', {default: ''})
const props = defineProps<{ session: ActiveSession, thisPath: string, embed?: 'note' | 'card' }>()

const {t} = useI18n()
const {host, paths} = useBaseHost(props.session)

// Text ↔ base. `written` is the last text this produced, so its own edits don't parse again.
let written = text.value
const initial = parseBase(text.value)
const problem = ref(initial.error)
const base = shallowRef<Base>(initial.base ?? {views: []})
watch(text, (next) => {
    if (next === written) return
    written = next
    const parsed = parseBase(next)
    problem.value = parsed.error
    if (parsed.base) base.value = parsed.base
})

function commit(next: Base) {
    if (problem.value !== null) return
    base.value = next
    const out = stringifyBase(next)
    if (out === text.value) return
    written = out
    text.value = out
}

const ctx = createBaseContext({base, commit, host, paths, thisPath: props.thisPath, session: props.session, viewName})
provide(BASE_CONTEXT, ctx)
if (!props.embed) registerBaseCommands(ctx)

const LAYOUTS = ['table', 'cards', 'list', 'kanban', 'map']
const unknownType = computed(() => (LAYOUTS.includes(ctx.view.value.type) ? null : ctx.view.value.type))

const layoutStyle = computed(() => {
    if (props.embed !== 'note') return undefined
    const {type, mapHeight} = ctx.view.value
    if (type === 'kanban') return {minHeight: '500px'}
    if (type === 'map') return {height: `${typeof mapHeight === 'number' ? mapHeight : 400}px`}
    return undefined
})
</script>

<template>
    <div v-if="problem !== null" class="w-full p-6" :class="{'pt-12': !embed}">
        <UAlert color="error" variant="subtle" icon="i-lucide-file-x" :title="t('app.editor.ui.bases.invalid')"/>
        <p class="mt-3 font-mono text-xs text-muted whitespace-pre-wrap">{{ problem }}</p>
    </div>
    <div v-else class="w-full flex flex-col" :class="{'flex-1 h-full': embed !== 'note'}">
        <ViewerEditorBasesToolbar/>
        <div class="flex-1 min-h-0 flex flex-col" :style="layoutStyle">
            <div v-if="unknownType !== null" class="p-6 text-sm text-muted">
                {{ t('app.editor.ui.bases.unknownViewType', {type: unknownType}) }}
            </div>
            <ViewerEditorBasesCards v-else-if="ctx.view.value.type === 'cards'"/>
            <ViewerEditorBasesList v-else-if="ctx.view.value.type === 'list'"/>
            <ViewerEditorBasesKanban v-else-if="ctx.view.value.type === 'kanban'"/>
            <!-- A map per view: each places its own camera when it opens. -->
            <ViewerEditorBasesMap v-else-if="ctx.view.value.type === 'map'" :key="ctx.view.value.name"/>
            <ViewerEditorBasesTable v-else/>
        </div>
    </div>
</template>
