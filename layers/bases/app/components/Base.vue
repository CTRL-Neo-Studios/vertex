<script setup lang="ts">
import {parseBase, stringifyBase, type Base} from "@type32/obsidian-bases-parser";
import type {SessionContext} from "#shared/plugin/api";
import {PluginMount} from "~/plugin/ui";
import {registerBaseCommands} from "../lib/useBaseCommands";
import {BASE_CONTEXT, createBaseContext} from "../lib/useBaseContext";
import {useBaseHost} from "../lib/useBaseHost";
import {baseViews} from "../lib/views";

/**
 * A base from its text: its views over the workspace's files, queried with `@type32/obsidian-bases-parser`. The text is
 * parsed once; the toolbar's edits come back as the text Obsidian would write, and nothing is written until something
 * changes. Text that doesn't parse shows why and is never written. Used by `.base` tabs and by embeds:
 * - `embed: 'note'` (`![[x.base]]`, ` ```base `) sizes as Obsidian's: content height, or what the layout's
 * `embedStyle` says (kanban at least 500 px, a map `mapHeight` high);
 * - `embed: 'card'` (canvas) fills the card.
 * Embeds don't take the palette's Bases commands. `readonly` (a block in a callout or table cell, which Obsidian
 * doesn't edit) ignores every edit.
 */
const text = defineModel<string>({required: true})
const viewName = defineModel<string>('view', {default: ''})
const props = defineProps<{ session: SessionContext, thisPath: string, embed?: 'note' | 'card', readonly?: boolean }>()

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
    if (problem.value !== null || props.readonly) return
    base.value = next
    const out = stringifyBase(next)
    if (out === text.value) return
    written = out
    text.value = out
}

const ctx = createBaseContext({base, commit, host, paths, thisPath: props.thisPath, session: props.session, viewName, embed: props.embed})
provide(BASE_CONTEXT, ctx)
if (!props.embed) registerBaseCommands(ctx)

// The view's layout, as registered (`registerView`); a type nothing registered (a map with `bases-map` off) says so.
const layout = computed(() => baseViews.get(ctx.view.value.type))
const layoutStyle = computed(() => (props.embed === 'note' ? layout.value?.embedStyle?.(ctx.view.value) : undefined))
const layoutProps = {context: ctx}
</script>

<template>
    <div v-if="problem !== null" class="w-full p-6" :class="{'pt-12': !embed}">
        <UAlert color="error" variant="subtle" icon="i-lucide-file-x" :title="t('plugins.bases.invalid')"/>
        <p class="mt-3 font-mono text-xs text-muted whitespace-pre-wrap">{{ problem }}</p>
    </div>
    <div v-else class="w-full flex flex-col" :class="{'flex-1 h-full': embed !== 'note'}">
        <BasesToolbar/>
        <div class="flex-1 min-h-0 flex flex-col" :style="layoutStyle">
            <div v-if="!layout" class="p-6 text-sm text-muted">
                {{ t('plugins.bases.unknownViewType', {type: ctx.view.value.type}) }}
            </div>
            <!-- A layout per view: each (a map's camera, a table's scroll) starts fresh when its view is shown. -->
            <PluginMount v-else :key="ctx.view.value.name" :ui="layout" :props="layoutProps"/>
        </div>
    </div>
</template>
