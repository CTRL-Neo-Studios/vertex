<script setup lang="ts">
import type {RowScope, Value} from "@type32/obsidian-bases-parser";
import {bareId, useBaseContext} from "~/composables/bases/useBaseContext";
import {BUILT_IN_SUMMARIES, summaryText} from "~/utils/basesSummaries";

/**
 * A cell of a table's summary row (a group's, or the totals footer): the column's summary name and value, or
 * Obsidian's "Summary" placeholder on hover; a click opens the summary picker.
 */
const props = defineProps<{ id: string, summaries: Map<string, Value>, rows: RowScope[] }>()
const {t} = useI18n()
const ctx = useBaseContext()

const open = ref(false)
const summary = computed(() => ctx.view.value.summaries?.[bareId(props.id)])
const label = computed(() => summary.value && BUILT_IN_SUMMARIES.includes(summary.value) ? t(`app.editor.ui.bases.summaryNames.${summary.value}`) : summary.value)
const value = computed(() => summaryText(props.summaries.get(bareId(props.id)) ?? {type: 'Null'}))
</script>

<template>
    <UPopover v-model:open="open">
        <button type="button" class="group flex size-full items-center gap-1.5 overflow-hidden px-2 text-sm text-start hover:bg-elevated/50">
            <template v-if="summary">
                <!-- The name gives way first (Obsidian shows "S… 2"); an empty value reads "Empty". -->
                <span class="min-w-0 truncate text-xs text-muted">{{ label }}</span>
                <span class="ms-auto shrink-0" :class="{'text-muted': !value}">{{ value || t('app.editor.ui.bases.empty') }}</span>
            </template>
            <span v-else class="invisible text-xs text-dimmed group-hover:visible">{{ t('app.editor.ui.bases.summaryPlaceholder') }}</span>
        </button>
        <template #content>
            <ViewerEditorBasesSummaryPicker :id="props.id" :rows="props.rows" @close="open = false"/>
        </template>
    </UPopover>
</template>
